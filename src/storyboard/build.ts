import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseTimeline, sanitizeText, TimelineError } from "../schema/load.ts";
import { ACTOR_ACTIONS, EFFECT_TYPES, MOTIONS, TRANSITIONS, type Motion, type ProfileId, type Transition } from "../schema/timeline.ts";
import { renderSoundtrack } from "../audio/soundtrack.ts";
import { sceneStartFrames } from "../renderer/ffmpeg/assemble.ts";
import { silhouette } from "../story/actor.ts";
import { actorPlacement, BACKGROUND_NEGATIVE, BACKGROUND_STYLE, effectsFor, musicSections, SHAPE_FOR, sfxEvents, type StorySceneInfo } from "../story/visuals.ts";
import { acquireLock, exists, removeTmpFiles, sha256, writeFileAtomic } from "../utils/fs.ts";
import { Logger } from "../utils/log.ts";
import { DEFAULT_VOICE, ENGINES, VOICES } from "../tts/engines.ts";
import { narrateScene, type Narration } from "../tts/narrate.ts";
import { appendToIndex, findOnline, imageSources, type Judge } from "../library/online.ts";
import { acceptable, judgeFit } from "../library/tag.ts";
import { ollama, type LlmProvider } from "../script/providers.ts";
import { graphicFor } from "./graphic.ts";
import { LICENSE as GEN_LICENSE, sdTurbo, type ImageGen } from "../imagegen/sd.ts";
import { fallbackGradient, importImage, LIBRARY_DIR, loadLibrary, matchImage, tokens, toLibraryImage, type LibraryImage } from "./assets.ts";
import { ProjectSettings, Storyboard, type StoryboardScene } from "./schema.ts";

export interface BuildOptions {
  engine?: "piper" | "dummy";
  voice?: string;
  speed?: number;
  /** Use only the local library, never search online. */
  offline?: boolean;
}

export interface BuildResult {
  timelineFile: string;
  warnings: string[];
  durationSec: number;
  logFile: string;
}

const MOTION_CYCLE: Motion[] = ["ken_burns", "zoom_in", "pan_right", "zoom_out", "pan_left"];
const TRANSITION_FRAMES: Record<Transition, number> = {
  cut: 0, fade: 12, fadeblack: 18, dissolve: 12, slide_left: 15, slide_up: 15, wipe_left: 15, circle_open: 18,
};

/** Map a free-text hint from the LLM onto a known preset ("slow zoom in" → zoom_in). */
export function pickPreset<T extends string>(hint: string | undefined, allowed: readonly T[]): T | undefined {
  if (!hint) return undefined;
  const norm = hint.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return allowed.find((a) => a === norm) ?? allowed.find((a) => a !== "none" && norm.includes(a));
}

async function readJson(file: string, what: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    throw new TimelineError(`cannot read ${what} ${file}: ${(err as Error).message}`);
  }
}

export async function loadStoryboard(file: string): Promise<Storyboard> {
  const parsed = Storyboard.safeParse(await readJson(file, "storyboard"));
  if (!parsed.success) throw new TimelineError(`storyboard is invalid:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

async function loadSettings(projectDir: string, options: BuildOptions): Promise<ProjectSettings> {
  const file = path.join(projectDir, "project.json");
  const raw = (await exists(file)) ? await readJson(file, "settings") : {};
  const parsed = ProjectSettings.safeParse(raw);
  if (!parsed.success) throw new TimelineError(`project.json is invalid:\n${z.prettifyError(parsed.error)}`);
  const s = parsed.data;
  return { ...s, engine: options.engine ?? s.engine, voice: options.voice ?? s.voice, speed: options.speed ?? s.speed };
}

function texts(scene: StoryboardScene, warnings: string[], where: string) {
  const out: { role: "kicker" | "title" | "body"; text: string; animation: "fade" | "slide_up"; startFrame?: number }[] = [];
  const add = (role: "kicker" | "title" | "body", value: string | undefined, animation: "fade" | "slide_up", startFrame?: number) => {
    if (!value) return;
    const { text, notes } = sanitizeText(value);
    if (notes.length) warnings.push(`${where}.onScreen.${role}: ${notes.join(", ")}`);
    if (text) out.push({ role, text, animation, ...(startFrame ? { startFrame } : {}) });
  };
  add("kicker", scene.onScreen.kicker, "fade");
  add("title", scene.onScreen.title, "slide_up", 4);
  add("body", scene.onScreen.body, "fade", 15);
  return out;
}

/**
 * storyboard.json (LLM) → narration audio (TTS) → timeline.json (renderer input).
 * Everything the renderer needs is decided here by code; the LLM only supplied words and hints.
 */
export async function buildProject(storyboardFile: string, options: BuildOptions = {}): Promise<BuildResult> {
  const abs = path.resolve(storyboardFile);
  const projectDir = path.dirname(abs);
  const genDir = path.join(projectDir, "gen");
  const storyboard = await loadStoryboard(abs);
  const settings = await loadSettings(projectDir, options);
  const engine = ENGINES[settings.engine]!;
  const voice = settings.voice ?? DEFAULT_VOICE;
  const warnings: string[] = [];

  if (settings.engine === "piper") {
    const info = VOICES.find((v) => v.id === voice);
    if (!info) warnings.push(`voice "${voice}" is not in the known list; check its license yourself`);
    else if (info.commercial !== true) warnings.push(`voice "${voice}": ${info.license} — ${info.note}`);
  } else {
    warnings.push(`engine "${settings.engine}" is a placeholder tone, not speech`);
  }

  const release = await acquireLock(path.join(genDir, ".lock"));
  let vision: LlmProvider | undefined;
  const log = new Logger(path.join(projectDir, "build", "logs"), "build");
  try {
    await removeTmpFiles(genDir);
    log.info(`"${storyboard.title}": ${storyboard.scenes.length} scenes, TTS ${settings.engine}${settings.engine === "piper" ? ` (${voice}, speed ${settings.speed})` : ""}`);
    const library = await loadLibrary(warnings);
    const usedImages = new Set<string>();
    // Ids and page URLs of online photos already in this video, so a search never repeats one.
    const usedOnline = new Set<string>();
    const sources = settings.onlineImages && !options.offline ? imageSources() : [];
    const orientation = settings.profiles.includes("16x9") ? "landscape" : "portrait";
    if (sources.length && !sources.some((s) => s.trusted)) {
      log.info("images: no PIXABAY_API_KEY or PEXELS_API_KEY, searching Openverse only (see README to add a free key for better photos)");
    }
    const credits: string[] = [];

    // Photos from sources with loose search (Openverse) are checked by the local vision model,
    // when Ollama is available. It is loaded only if needed and unloaded before rendering.
    if (sources.some((s) => !s.trusted)) {
      const candidate = ollama();
      try {
        await candidate.check();
        vision = candidate;
      } catch (err) {
        warnings.push(`photos found online are not checked by a vision model (${(err as Error).message}); review them before publishing`);
      }
    }
    const judge: Judge | undefined = vision
      ? async (file, query) => {
          try {
            const v = await judgeFit(file, query, vision!, path.join(genDir, "vision"));
            return { ok: acceptable(v), shows: v.shows, note: `fit ${v.fit}/10, ${v.kind}` };
          } catch (err) {
            return { ok: false, shows: "", note: `vision check failed: ${(err as Error).message}` };
          }
        }
      : undefined;

    let generator: ImageGen | undefined = settings.imageGen === "off" ? undefined : await sdTurbo();
    if (settings.imageGen === "prefer" && !generator) warnings.push(`imageGen is "prefer" but the image generator is not installed (bash scripts/setup-imagegen.sh)`);

    const online = async (query: string, id: string): Promise<LibraryImage | undefined> => {
      if (!sources.length) return undefined;
      const found = await findOnline(query, sources, { orientation, exclude: usedOnline, judge, log: (m) => log.detail(`${id}: ${m}`) });
      if (!found) {
        log.detail(`${id}: nothing usable online for "${query}"`);
        return undefined;
      }
      usedOnline.add(found.candidate.id);
      const img = toLibraryImage(found.file, found.entry);
      library.push(img);
      log.info(`  ${id}: photo from ${found.candidate.source} (${found.entry.license}${found.entry.author ? `, ${found.entry.author}` : ""})`);
      return img;
    };

    /** Paint a picture locally; kept in assets/library/generated so it is made only once. */
    const generate = async (prompt: string, id: string): Promise<LibraryImage | undefined> => {
      if (!generator) return undefined;
      // The vision model and the image model don't both fit in memory on a 16 GB machine.
      await vision?.release();
      const dir = path.join(LIBRARY_DIR, "generated");
      const started = Date.now();
      try {
        const { file, cached } = await generator.generate(prompt, dir);
        const entry = { file: path.basename(file), tags: [...new Set(tokens(prompt))].slice(0, 20), description: prompt, license: GEN_LICENSE, author: generator.id, width: 512, height: 512, taggedBy: generator.id };
        if (entry.tags.length) await appendToIndex(dir, entry);
        log.info(`  ${id}: ${cached ? "reused" : "generated"} image with ${generator.id}${cached ? "" : ` (${((Date.now() - started) / 1000).toFixed(0)}s)`}`);
        const img = toLibraryImage(file, { ...entry, tags: entry.tags.length ? entry.tags : ["generated"] });
        library.push(img);
        return img;
      } catch (err) {
        warnings.push(`image generator failed, not using it for the rest of this build: ${(err as Error).message}`);
        generator = undefined;
        return undefined;
      }
    };

    /**
     * Picture for a scene: a strong match from the local library, then (in the order set by
     * imageGen) a photo found online or a locally generated one, then a weak local match.
     * Undefined → gradient.
     */
    const pickImage = async (query: string | undefined, prompt: string | undefined, matchText: string, id: string): Promise<LibraryImage | undefined> => {
      const unused = library.filter((img) => !usedImages.has(img.path));
      const strong = matchImage(matchText, unused, usedImages, 2);
      if (strong) return strong;
      const steps = settings.imageGen === "prefer" ? [() => prompt && generate(prompt, id), () => query && online(query, id)] : [() => query && online(query, id), () => prompt && generate(prompt, id)];
      for (const step of steps) {
        const img = await step();
        if (img) return img;
      }
      return matchImage(matchText, library, usedImages);
    };

    const narrations: Narration[] = [];
    for (const [i, scene] of storyboard.scenes.entries()) {
      const id = `s${String(i + 1).padStart(2, "0")}`;
      const { text: narration, notes } = sanitizeText(scene.narration);
      if (notes.length) warnings.push(`scenes[${i}].narration: ${notes.join(", ")}`);
      const n = await narrateScene(id, narration, {
        engine,
        synth: { voice, speed: settings.speed },
        fps: settings.fps,
        ttsDir: path.join(genDir, "tts"),
        audioDir: path.join(genDir, "audio"),
        log,
      });
      log.info(`  ${id}: ${(n.durationFrames / settings.fps).toFixed(1)}s, ${n.cues.length} sentence(s)`);
      narrations.push(n);
    }

    const story = storyboard.kind === "story";
    if (story && !generator) {
      warnings.push("story video without the image generator: backgrounds are gradients and there are no silhouettes (run: bash scripts/setup-imagegen.sh)");
    }
    /** One silhouette per character, painted once and shared by every scene it appears in. */
    const silhouettes = new Map<string, Promise<string | undefined>>();
    const actorImage = (id: string, description: string) => {
      let p = silhouettes.get(id);
      if (!p) {
        p = (async () => {
          if (!generator) return undefined;
          const started = Date.now();
          const file = await silhouette(description, generator, path.join(LIBRARY_DIR, "generated", "actors")).catch((err: Error) => {
            warnings.push(`silhouette for "${id}" failed: ${err.message}`);
            return undefined;
          });
          if (!file) {
            warnings.push(`no usable silhouette for "${id}"; its scenes show the background only`);
            return undefined;
          }
          log.info(`  actor ${id}: silhouette ready (${((Date.now() - started) / 1000).toFixed(0)}s)`);
          const rel = path.join("gen", "actors", `${id}${path.extname(file)}`);
          await fs.mkdir(path.join(projectDir, "gen", "actors"), { recursive: true });
          await fs.copyFile(file, path.join(projectDir, rel));
          return rel;
        })();
        silhouettes.set(id, p);
      }
      return p;
    };
    /** A painting per output shape, so each fills its frame. */
    const paint = async (prompt: string, id: string) => {
      if (!generator) return undefined;
      const variants: Partial<Record<ProfileId, string>> = {};
      for (const profile of settings.profiles) {
        const started = Date.now();
        try {
          const { file, cached } = await generator.generate(prompt, path.join(LIBRARY_DIR, "generated", "story"), { style: BACKGROUND_STYLE, negative: BACKGROUND_NEGATIVE, shape: SHAPE_FOR[profile] });
          log.info(`  ${id}: ${cached ? "reused" : "painted"} ${profile} background${cached ? "" : ` (${((Date.now() - started) / 1000).toFixed(0)}s)`}`);
          const rel = path.join("gen", "assets", `${id}-${profile}${path.extname(file)}`);
          await fs.mkdir(path.join(projectDir, "gen", "assets"), { recursive: true });
          await fs.copyFile(file, path.join(projectDir, rel));
          variants[profile] = rel;
        } catch (err) {
          warnings.push(`${id}: painting failed: ${(err as Error).message}`);
          return undefined;
        }
      }
      return variants;
    };
    const storyInfo: StorySceneInfo[] = [];

    const scenes = [];
    for (const [i, scene] of storyboard.scenes.entries()) {
      const where = `scenes[${i}]`;
      const n = narrations[i]!;
      const graphic = story ? undefined : graphicFor(scene.graphic, n, settings.fps, warnings, where);
      // A graphic takes the middle of the frame: the heading stays, the body text would crowd it.
      let sceneTexts = texts(graphic ? { ...scene, onScreen: { ...scene.onScreen, body: undefined } } : scene, warnings, where);
      // Story chapter cards show for a few seconds, then the picture has the frame to itself.
      if (story) sceneTexts = sceneTexts.map((t) => ({ ...t, animation: "fade" as const, endFrame: Math.min(n.durationFrames, Math.round(settings.fps * 3.8)) }));

      const motion = pickPreset(scene.camera, MOTIONS);
      if (scene.camera && !motion) warnings.push(`${where}.camera "${scene.camera}" is not a known motion; using a default`);

      const id = `s${String(i + 1).padStart(2, "0")}`;
      const query = [scene.visual.query, scene.visual.description].filter(Boolean).join(" ");
      // Graphic scenes are drawn on a calm gradient: a photo behind an infographic only competes with it.
      const prompt = scene.visual.description || scene.visual.query;
      const painted = story && prompt ? await paint(prompt, id) : undefined;
      const image = graphic || story ? undefined : await pickImage(scene.visual.query, prompt, query, id);
      let background;
      if (painted && Object.keys(painted).length) {
        const first = painted[settings.profiles[0]!]!;
        background = {
          type: "image" as const,
          src: first,
          variants: painted,
          motion: motion ?? MOTION_CYCLE[i % MOTION_CYCLE.length]!,
          focus: { x: 0.5, y: 0.5 },
          dim: 0.12,
        };
      } else if (image) {
        usedImages.add(image.path);
        if (image.source) usedOnline.add(image.source);
        credits.push(`${id}: ${image.author ?? "unknown author"} — ${image.license ? `${image.license}${image.licenseUrl ? ` (${image.licenseUrl})` : ""}` : "license not recorded"} — ${image.source ?? path.relative(projectDir, image.path)}`);
        background = {
          type: "image" as const,
          src: await importImage(image, projectDir),
          motion: motion ?? MOTION_CYCLE[i % MOTION_CYCLE.length]!,
          focus: image.focus ?? { x: 0.5, y: 0.5 },
          dim: sceneTexts.length ? 0.35 : 0.2,
        };
      } else {
        const g = fallbackGradient(scene.visual.mood, i);
        if (!g.known) warnings.push(`${where}.visual.mood "${scene.visual.mood}" is not a known mood; using a default palette`);
        if (query && !graphic) log.detail(`${where}: no library image for "${query}", using a gradient`);
        background = { type: "gradient" as const, from: g.from, to: g.to, direction: "diagonal" as const };
      }

      let transition = pickPreset(scene.transition, TRANSITIONS);
      if (scene.transition && !transition) warnings.push(`${where}.transition "${scene.transition}" is not known; using fade`);
      transition ??= "fade";
      const next = narrations[i + 1];
      // A transition must fit inside both scenes it joins.
      const frames = next ? Math.min(TRANSITION_FRAMES[transition], n.durationFrames - 1, next.durationFrames - 1) : 0;

      // Story: the silhouette and the effects.
      const action = scene.actor ? pickPreset(scene.actor.action, ACTOR_ACTIONS) ?? "appear" : undefined;
      const actorSrc = story && scene.actor ? await actorImage(scene.actor.id, scene.actor.silhouette) : undefined;
      const effectTypes = (scene.effects ?? []).flatMap((e) => {
        const t = pickPreset(e, EFFECT_TYPES);
        if (!t) warnings.push(`${where}.effects: "${e}" is not a known effect`);
        return t ? [t] : [];
      });
      const effects = story ? effectsFor(effectTypes, actorSrc ? action : undefined, settings.fps) : [];
      if (story) {
        storyInfo.push({
          start: 0,
          duration: n.durationFrames / settings.fps,
          chapterStart: i === 0 || storyboard.scenes[i - 1]!.chapter !== scene.chapter,
          mood: scene.visual.mood,
          action: actorSrc ? action : undefined,
          effects: effectTypes,
        });
      }

      scenes.push({
        id,
        durationFrames: n.durationFrames,
        audio: { src: path.relative(projectDir, n.audioFile) },
        background,
        texts: sceneTexts,
        ...(graphic ? { graphic } : {}),
        ...(actorSrc && action ? { actor: { src: actorSrc, action, ...actorPlacement(action, settings.fps) } } : {}),
        ...(effects.length ? { effects } : {}),
        captionCues: n.cues,
        transitionOut: next && frames > 0 ? { type: transition, frames } : { type: "cut" as const, frames: 0 },
      });
    }

    // Story soundtrack: music by mood and effects by action, timed on the final cut.
    let soundtrack: { src: string; volume: number } | undefined;
    if (story) {
      const starts = sceneStartFrames(scenes as Parameters<typeof sceneStartFrames>[0]);
      storyInfo.forEach((s, i) => (s.start = starts[i]! / settings.fps));
      const total = scenes.reduce((a, s) => a + s.durationFrames, 0) / settings.fps;
      const sections = musicSections(storyInfo);
      const sfx = sfxEvents(storyInfo);
      const key = sha256(JSON.stringify({ sections, sfx, total })).slice(0, 12);
      const rel = path.join("gen", "audio", `soundtrack-${key}.wav`);
      const file = path.join(projectDir, rel);
      if (!(await exists(file))) {
        log.info(`soundtrack: ${sections.map((s) => s.mood).join(" → ")}, ${sfx.length} sound effects`);
        await fs.mkdir(path.dirname(file), { recursive: true });
        const tmp = file.replace(/\.wav$/, `.tmp-${process.pid}.wav`);
        await renderSoundtrack(sections, sfx, total, tmp);
        await fs.rename(tmp, file);
      }
      soundtrack = { src: rel, volume: 1 };
    }

    const raw = {
      schemaVersion: 1,
      title: storyboard.title,
      fps: settings.fps,
      profiles: settings.profiles,
      ...(story ? { vignette: true } : {}),
      ...(soundtrack ? { soundtrack } : {}),
      scenes,
    };
    // Round-trip through the renderer's own validation: a timeline we write is a timeline it accepts.
    const { timeline, warnings: tlWarnings } = parseTimeline(raw);
    warnings.push(...tlWarnings);
    const timelineFile = path.join(projectDir, "timeline.json");
    await writeFileAtomic(timelineFile, `${JSON.stringify(raw, null, 2)}\n`);
    if (credits.length) {
      const sites = [credits.some((c) => c.includes("Pexels License")) && "Pexels (https://www.pexels.com)", credits.some((c) => c.includes("Pixabay Content License")) && "Pixabay (https://pixabay.com)"].filter(Boolean);
      const header = [
        ...(sites.length ? [`Photos provided by ${sites.join(" and ")}`] : []),
        // Required by the Stability AI Community License for SD-Turbo output.
        ...(credits.some((c) => c.includes(GEN_LICENSE)) ? ["Some images: Powered by Stability AI (SD-Turbo)"] : []),
      ];
      if (header.length) header.push("");
      await writeFileAtomic(path.join(projectDir, "credits.txt"), [`Image credits — ${storyboard.title}`, "", ...header, ...credits, ""].join("\n"));
    }

    const durationSec = timeline.scenes.reduce((s, x) => s + x.durationFrames, 0) / timeline.fps;
    for (const w of warnings) log.warn(w);
    log.info(`timeline: ${timelineFile} (${durationSec.toFixed(1)}s)`);
    return { timelineFile, warnings, durationSec, logFile: log.file };
  } catch (err) {
    log.detail(`FAILED: ${(err as Error).stack ?? err}`);
    throw err;
  } finally {
    await vision?.release();
    await removeTmpFiles(genDir);
    await log.close();
    await release();
  }
}
