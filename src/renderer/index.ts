import fs from "node:fs/promises";
import path from "node:path";
import { AUDIO_SAMPLE_RATE, FFMPEG, FONTS_DIR, RENDERER_VERSION, TIMEOUTS } from "../config.ts";
import { getLayout, type Layout } from "../layouts/index.ts";
import { loadTimeline, resolveInProject, TimelineError } from "../schema/load.ts";
import type { ProfileId, Timeline } from "../schema/timeline.ts";
import { acquireLock, exists, hashFile, removeTmpFiles, sha256, slugify, tmpPathFor, writeFileAtomic } from "../utils/fs.ts";
import { Logger } from "../utils/log.ts";
import { ProcessError, run } from "../utils/process.ts";
import { probe, verifyVideo } from "../utils/probe.ts";
import { buildSceneAss } from "./ass.ts";
import { assembleArgs, totalFrames, type Encoder } from "./ffmpeg/assemble.ts";
import { isSilent, loudnessApplyArgs, loudnessMeasureArgs, narrationMixArgs, parseLoudness } from "./ffmpeg/audio.ts";
import { resolveFit, sceneClipArgs } from "./ffmpeg/scene.ts";

export interface RenderOptions {
  profiles?: ProfileId[];
  /** Ignore cached clips and outputs. */
  force?: boolean;
  encoder?: Encoder;
}

export interface RenderReport {
  title: string;
  outputs: { profile: ProfileId; file: string; cached: boolean; seconds: number }[];
  warnings: string[];
  logFile: string;
}

interface ResolvedAssets {
  images: (string | undefined)[];
  /** Pixel size per scene image. */
  sizes: ({ width: number; height: number } | undefined)[];
  /** Per-profile pictures of image backgrounds (see ImageBackground.variants). */
  variants: Partial<Record<ProfileId, { file: string; width: number; height: number }>>[];
  /** Absolute path of each scene's silhouette PNG. */
  actors: (string | undefined)[];
  soundtrack?: { file: string; hash: string };
  audio: (string | undefined)[];
  /** Content hash per scene of every file it uses. */
  hashes: string[];
}

/** The first "shake" effect of a scene, scaled to the frame size. */
function shakeOf(scene: Timeline["scenes"][number], layout: Layout, fps: number): { start: number; amplitude: number } | undefined {
  const fx = scene.effects.find((e) => e.type === "shake");
  return fx ? { start: fx.startFrame / fps, amplitude: fx.intensity * layout.height * 0.012 } : undefined;
}

/** Check every referenced file before spending minutes on rendering. Reports all problems at once. */
async function preflight(tl: Timeline, projectDir: string, warnings: string[]): Promise<ResolvedAssets> {
  const errors: string[] = [];
  const images: (string | undefined)[] = [];
  const sizes: ResolvedAssets["sizes"] = [];
  const actors: (string | undefined)[] = [];
  const variants: ResolvedAssets["variants"] = [];
  const audio: (string | undefined)[] = [];
  const hashes: string[] = [];

  for (const [i, scene] of tl.scenes.entries()) {
    const where = `scenes[${i}] (${scene.id})`;
    const parts: string[] = [];
    let image: string | undefined;
    let size: ResolvedAssets["sizes"][number];
    let sound: string | undefined;

    if (scene.background.type === "image") {
      try {
        image = resolveInProject(projectDir, scene.background.src);
        if (!(await exists(image))) throw new Error(`image not found: ${scene.background.src}`);
        const info = await probe(image);
        const v = info.streams.find((s) => s.codec_type === "video");
        if (!v?.width || !v.height) throw new Error(`not a readable image: ${scene.background.src}`);
        size = { width: v.width, height: v.height };
        if (scene.background.fit === "cover" && Math.min(v.width, v.height) < 1080) {
          warnings.push(`${where}: image is ${v.width}x${v.height}; below 1080px it will look soft (fit "auto" would show it whole instead)`);
        }
        parts.push(await hashFile(image));
      } catch (err) {
        errors.push(`${where}: ${(err as Error).message}`);
      }
    }
    const sceneVariants: ResolvedAssets["variants"][number] = {};
    if (scene.background.type === "image" && scene.background.variants) {
      try {
        for (const [profile, src] of Object.entries(scene.background.variants) as [ProfileId, string | undefined][]) {
          if (!src) continue;
          const file = resolveInProject(projectDir, src);
          if (!(await exists(file))) throw new Error(`image not found: ${src}`);
          const v = (await probe(file)).streams.find((s) => s.codec_type === "video");
          if (!v?.width || !v.height) throw new Error(`not a readable image: ${src}`);
          sceneVariants[profile] = { file, width: v.width, height: v.height };
          parts.push(await hashFile(file));
        }
      } catch (err) {
        errors.push(`${where}: ${(err as Error).message}`);
      }
    }

    let actor: string | undefined;
    if (scene.actor) {
      try {
        actor = resolveInProject(projectDir, scene.actor.src);
        if (!(await exists(actor))) throw new Error(`actor image not found: ${scene.actor.src}`);
        parts.push(await hashFile(actor));
      } catch (err) {
        errors.push(`${where}: ${(err as Error).message}`);
      }
    }

    if (scene.audio) {
      try {
        sound = resolveInProject(projectDir, scene.audio.src);
        if (!(await exists(sound))) throw new Error(`audio not found: ${scene.audio.src}`);
        const info = await probe(sound);
        if (!info.streams.some((s) => s.codec_type === "audio")) throw new Error(`no audio stream in ${scene.audio.src}`);
        const room = (scene.durationFrames - scene.audio.offsetFrames) / tl.fps;
        if (info.durationSec > room + 0.05) {
          warnings.push(`${where}: audio is ${info.durationSec.toFixed(2)}s but the scene leaves ${room.toFixed(2)}s; the end will be cut`);
        }
        parts.push(await hashFile(sound));
      } catch (err) {
        errors.push(`${where}: ${(err as Error).message}`);
      }
    }

    images.push(image);
    sizes.push(size);
    actors.push(actor);
    variants.push(sceneVariants);
    audio.push(sound);
    hashes.push(sha256(parts.join(":")));
  }

  let soundtrack: ResolvedAssets["soundtrack"];
  if (tl.soundtrack) {
    try {
      const file = resolveInProject(projectDir, tl.soundtrack.src);
      if (!(await exists(file))) throw new Error(`soundtrack not found: ${tl.soundtrack.src}`);
      if (!(await probe(file)).streams.some((s) => s.codec_type === "audio")) throw new Error(`no audio stream in ${tl.soundtrack.src}`);
      soundtrack = { file, hash: await hashFile(file) };
    } catch (err) {
      errors.push(`soundtrack: ${(err as Error).message}`);
    }
  }
  if (errors.length) throw new TimelineError(`missing or broken assets:\n  ${errors.join("\n  ")}`);
  return { images, sizes, actors, variants, audio, hashes, soundtrack };
}

/** Move a file that failed verification out of the tmp namespace so cleanup doesn't delete it. */
async function keepFailed(tmp: string): Promise<string> {
  const failed = tmp.replace(/\.tmp-\d+(\.\w+)$/, ".failed$1");
  await fs.rename(tmp, failed);
  return failed;
}

async function ffmpeg(args: string[], log: Logger, timeoutMs: number, cwd?: string): Promise<string> {
  log.command(FFMPEG, args);
  try {
    return (await run(FFMPEG, args, { cwd, timeoutMs, onStderr: (d) => log.detail(d.trimEnd()) })).stderr;
  } catch (err) {
    if (err instanceof ProcessError) {
      throw new Error(`${err.message}\n--- ffmpeg output (tail) ---\n${err.stderrTail.trim()}\n--- full log: ${log.file}`);
    }
    throw err;
  }
}

/** Build the narration track once (shared by all profiles), loudness-normalized in two passes. */
async function buildAudio(tl: Timeline, assets: ResolvedAssets, buildDir: string, force: boolean, log: Logger, warnings: string[]): Promise<{ file: string; key: string }> {
  const key = sha256(JSON.stringify({ v: RENDERER_VERSION, fps: tl.fps, lufs: tl.loudnessLufs, scenes: tl.scenes.map((s) => [s.durationFrames, s.audio]), assets: assets.hashes, bed: assets.soundtrack && [assets.soundtrack.hash, tl.soundtrack?.volume] })).slice(0, 12);
  const dir = path.join(buildDir, "audio");
  const master = path.join(dir, `master-${key}.wav`);
  if (!force && (await exists(master))) {
    log.info("audio: cached");
    return { file: master, key };
  }
  await fs.mkdir(dir, { recursive: true });
  log.info("audio: mixing narration…");
  const mix = path.join(dir, `mix-${key}.wav`);
  const mixTmp = tmpPathFor(mix);
  await ffmpeg(narrationMixArgs(tl.scenes, assets.audio, tl.fps, mixTmp), log, TIMEOUTS.assembleMs);
  await fs.rename(mixTmp, mix);

  const measured = parseLoudness(await ffmpeg(loudnessMeasureArgs(mix, tl.loudnessLufs), log, TIMEOUTS.assembleMs));
  log.detail(`loudness measured: ${JSON.stringify(measured)}`);
  if (isSilent(measured)) warnings.push("the video has no audible narration");
  else log.info(`audio: ${measured.input_i} LUFS → ${tl.loudnessLufs} LUFS`);

  const tmp = tmpPathFor(master);
  await ffmpeg(loudnessApplyArgs(mix, measured, tl.loudnessLufs, tl.scenes, tl.fps, tmp), log, TIMEOUTS.assembleMs);
  if (assets.soundtrack) {
    // Music and effects under the voice: a compressor keyed by the narration ducks the bed
    // while someone speaks and lets it swell in the pauses.
    log.info("audio: mixing soundtrack under the narration…");
    const voiced = tmpPathFor(path.join(dir, `voiced-${key}.wav`));
    await fs.rename(tmp, voiced);
    const total = Math.round((totalFrames(tl.scenes) / tl.fps) * AUDIO_SAMPLE_RATE);
    await ffmpeg(
      [
        "-hide_banner", "-nostdin", "-y", "-v", "warning",
        "-i", voiced, "-i", assets.soundtrack.file,
        "-filter_complex",
        `[0:a]aformat=sample_rates=${AUDIO_SAMPLE_RATE}:channel_layouts=mono,asplit=2[key][voice];` +
          `[1:a]aresample=${AUDIO_SAMPLE_RATE},aformat=channel_layouts=mono,volume=${tl.soundtrack!.volume},apad,atrim=end_sample=${total}[bed];` +
          `[bed][key]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=450[ducked];` +
          `[voice][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=end_sample=${total}[out]`,
        "-map", "[out]", "-c:a", "pcm_s24le", tmp,
      ],
      log,
      TIMEOUTS.assembleMs,
    );
    await fs.rm(voiced, { force: true });
  }
  const info = await probe(tmp);
  const expected = totalFrames(tl.scenes) / tl.fps;
  if (Math.abs(info.durationSec - expected) > 0.01) {
    throw new Error(`audio track is ${info.durationSec.toFixed(3)}s, expected ${expected.toFixed(3)}s`);
  }
  await fs.rename(tmp, master);
  await fs.rm(mix, { force: true });
  return { file: master, key };
}

async function renderProfile(
  tl: Timeline,
  layout: Layout,
  assets: ResolvedAssets,
  audio: { file: string; key: string },
  dirs: { build: string; out: string },
  opts: Required<RenderOptions>,
  log: Logger,
  warnings: string[],
): Promise<RenderReport["outputs"][number]> {
  const started = Date.now();
  const clipDir = path.join(dirs.build, layout.id);
  await fs.mkdir(clipDir, { recursive: true });
  const clips: string[] = [];
  const clipKeys: string[] = [];

  const picture = (i: number) => {
    const v = assets.variants[i]?.[layout.id];
    return v ? { file: v.file, size: { width: v.width, height: v.height } } : { file: assets.images[i], size: assets.sizes[i] };
  };
  const fit = (i: number) => {
    const bg = tl.scenes[i]!.background;
    const size = picture(i).size;
    return bg.type === "image" && size ? resolveFit(bg.fit, size, layout) : undefined;
  };

  for (const [i, scene] of tl.scenes.entries()) {
    const clipFrames = scene.durationFrames + scene.transitionOut.frames;
    const { ass, warnings: textWarnings } = buildSceneAss(scene, layout, tl.fps, clipFrames);
    warnings.push(...textWarnings.map((w) => `${scene.id}: ${w}`));

    const key = sha256(JSON.stringify({ v: RENDERER_VERSION, profile: layout.id, fps: tl.fps, clipFrames, bg: scene.background, fit: fit(i), actor: scene.actor, shake: shakeOf(scene, layout, tl.fps), vignette: tl.vignette, ass, asset: assets.hashes[i] })).slice(0, 12);
    const base = `${scene.id}-${key}`;
    const clip = path.join(clipDir, `${base}.mp4`);
    clips.push(clip);
    clipKeys.push(key);

    const label = `[${layout.id}] scene ${i + 1}/${tl.scenes.length} ${scene.id}`;
    if (!opts.force && (await exists(clip))) {
      log.info(`${label}: cached`);
      continue;
    }
    log.info(`${label}: rendering ${clipFrames} frames…`);
    await writeFileAtomic(path.join(clipDir, `${base}.ass`), ass);
    const tmp = tmpPathFor(clip);
    await ffmpeg(
      sceneClipArgs({
        background: scene.background,
        imagePath: picture(i).file,
        fit: fit(i),
        actor: scene.actor && assets.actors[i] ? { ...scene.actor, path: assets.actors[i]! } : undefined,
        shake: shakeOf(scene, layout, tl.fps),
        vignette: tl.vignette,
        layout,
        fps: tl.fps,
        frames: clipFrames,
        assFile: `${base}.ass`,
        fontsDir: FONTS_DIR,
        output: path.basename(tmp),
      }),
      log,
      TIMEOUTS.sceneMs,
      clipDir,
    );
    const problems = await verifyVideo(tmp, { width: layout.width, height: layout.height, frames: clipFrames, fps: tl.fps, hasAudio: false });
    if (problems.length) throw new Error(`${label}: rendered clip is wrong: ${problems.join("; ")} (kept for inspection: ${await keepFailed(tmp)})`);
    await fs.rename(tmp, clip);
  }

  const finalKey = sha256(JSON.stringify({ v: RENDERER_VERSION, clipKeys, transitions: tl.scenes.map((s) => s.transitionOut), audio: audio.key, enc: opts.encoder })).slice(0, 8);
  const output = path.join(dirs.out, `${slugify(tl.title)}_${layout.id}_${finalKey}.mp4`);
  if (!opts.force && (await exists(output))) {
    log.info(`[${layout.id}] final: cached → ${output}`);
    return { profile: layout.id, file: output, cached: true, seconds: 0 };
  }

  log.info(`[${layout.id}] final: joining ${clips.length} clips + audio (${opts.encoder})…`);
  await fs.mkdir(dirs.out, { recursive: true });
  const tmp = tmpPathFor(output);
  const assemble = (encoder: Encoder) =>
    ffmpeg(
      assembleArgs({ scenes: tl.scenes, clips, audioTrack: audio.file, layout, fps: tl.fps, encoder, output: tmp }),
      log,
      TIMEOUTS.assembleMs,
    );
  try {
    await assemble(opts.encoder);
  } catch (err) {
    if (opts.encoder !== "qsv") throw err;
    warnings.push(`[${layout.id}] Quick Sync encoding failed, fell back to libx264`);
    log.warn(`Quick Sync failed, retrying with libx264 (${(err as Error).message.split("\n")[0]})`);
    await assemble("x264");
  }

  const frames = totalFrames(tl.scenes);
  const problems = await verifyVideo(tmp, { width: layout.width, height: layout.height, frames, fps: tl.fps, hasAudio: true });
  if (problems.length) throw new Error(`[${layout.id}] final video is wrong: ${problems.join("; ")} (kept for inspection: ${await keepFailed(tmp)})`);
  await fs.rename(tmp, output);
  const seconds = (Date.now() - started) / 1000;
  log.info(`[${layout.id}] done in ${seconds.toFixed(1)}s → ${output}`);
  return { profile: layout.id, file: output, cached: false, seconds };
}

export async function renderTimeline(file: string, options: RenderOptions = {}): Promise<RenderReport> {
  const { timeline: tl, projectDir, warnings } = await loadTimeline(file);
  const opts: Required<RenderOptions> = {
    profiles: options.profiles ?? tl.profiles,
    force: options.force ?? false,
    encoder: options.encoder ?? "x264",
  };
  const dirs = { build: path.join(projectDir, "build"), out: path.join(projectDir, "out") };

  const release = await acquireLock(path.join(dirs.build, ".lock"));
  const log = new Logger(path.join(dirs.build, "logs"));
  try {
    await removeTmpFiles(dirs.build);
    await removeTmpFiles(dirs.out);
    log.info(`"${tl.title}": ${tl.scenes.length} scenes, ${(totalFrames(tl.scenes) / tl.fps).toFixed(1)}s, profiles ${opts.profiles.join(", ")}`);

    const assets = await preflight(tl, projectDir, warnings);
    const audio = await buildAudio(tl, assets, dirs.build, opts.force, log, warnings);
    const outputs: RenderReport["outputs"] = [];
    for (const id of opts.profiles) {
      outputs.push(await renderProfile(tl, getLayout(id), assets, audio, dirs, opts, log, warnings));
    }

    for (const w of warnings) log.warn(w);
    const report: RenderReport = { title: tl.title, outputs, warnings, logFile: log.file };
    await writeFileAtomic(path.join(dirs.build, "report.json"), JSON.stringify(report, null, 2));
    return report;
  } catch (err) {
    log.detail(`FAILED: ${(err as Error).stack ?? err}`);
    throw err;
  } finally {
    await removeTmpFiles(dirs.build);
    await removeTmpFiles(dirs.out);
    await log.close();
    await release();
  }
}
