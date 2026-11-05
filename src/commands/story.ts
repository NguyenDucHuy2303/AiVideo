import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { TimelineError } from "../schema/load.ts";
import { ollama, type LlmProvider } from "../script/providers.ts";
import type { Storyboard } from "../storyboard/schema.ts";
import { parseStory, type ParsedStory } from "../story/parse.ts";
import { applyStoryRules, cleanBackground, cleanSilhouette, fillBackgrounds, namedInStory, transformationScenes, type FormChange } from "../story/rules.ts";
import { designCast, designForm, designShots, type Character, type Shot } from "../story/shots.ts";
import { exists, sha256, slugify, writeFileAtomic } from "../utils/fs.ts";

export interface StoryOptions {
  name?: string;
  title?: string;
  model?: string;
  force?: boolean;
}

/** How the camera moves for each kind of action: the motion should follow the story. */
const CAMERA: Record<Shot["action"], string> = {
  appear: "ken_burns",
  enter_left: "pan_right",
  enter_right: "pan_left",
  grow: "zoom_out",
  charge: "pan_right",
  rise: "pan_up",
  fly_up: "pan_up",
};

/**
 * A story script written by a person → storyboard.json. The narration is the script, word
 * for word; the local LLM only designs the pictures (cast, backgrounds, actions, effects).
 */
export async function writeStory(scriptFile: string, opts: StoryOptions): Promise<string> {
  const text = await fs.readFile(path.resolve(scriptFile), "utf8").catch(() => {
    throw new TimelineError(`cannot read ${scriptFile}`);
  });
  const parsed = parseStory(text);
  if (!parsed.scenes.length) throw new TimelineError(`${scriptFile} has no paragraphs to narrate`);
  for (const d of parsed.dropped) console.warn(`⚠ left out: ${d}`);

  const title = opts.title ?? parsed.chapters.find(Boolean) ?? path.basename(scriptFile, path.extname(scriptFile));
  const projectDir = path.join(ROOT, "projects", slugify(opts.name ?? title));
  const storyboardFile = path.join(projectDir, "storyboard.json");
  if (!opts.force && (await exists(storyboardFile))) {
    throw new TimelineError(`${path.relative(ROOT, storyboardFile)} already exists. Use --force to replace it.`);
  }
  console.log(`"${title}": ${parsed.chapters.filter(Boolean).length} chapters, ${parsed.scenes.length} scenes`);

  const provider = ollama(opts.model);
  await provider.check();
  let shown = 0;
  const progress = (step: string) => (chars: number) => {
    if (chars - shown >= 400 || chars < shown) {
      shown = chars;
      process.stdout.write(`\r  ${step}: ${chars} characters…`);
    }
  };
  // The cast takes minutes on a CPU: keep it, so a retry after a failed shot design starts there.
  const castFile = path.join(projectDir, "build", `cast-v2-${sha256(JSON.stringify(parsed)).slice(0, 12)}.json`);
  try {
    let cast: Character[];
    let changes: FormChange[];
    if (await exists(castFile)) {
      ({ cast, changes } = JSON.parse(await fs.readFile(castFile, "utf8")) as { cast: Character[]; changes: FormChange[] });
      console.log("  cast: reused from the last run");
    } else {
      ({ cast, changes } = await designCastAndForms(parsed, provider, progress));
      await writeFileAtomic(castFile, JSON.stringify({ cast, changes }, null, 2));
    }
    for (const c of cast) console.log(`  ${c.id}: ${c.name} — ${c.silhouette}`);
    for (const c of changes) console.log(`  scene ${c.scene + 1}: ${c.from} → ${c.to}`);
    shown = 0;
    const designed = await designShots(parsed, cast, provider, (chars, ch) => progress(`shots, chapter ${ch + 1}/${parsed.chapters.length}`)(chars));
    process.stdout.write("\n");
    const names = cast.map((c) => c.name);
    const backgrounds = fillBackgrounds(parsed, designed.map((s) => cleanBackground(s.background, names)), "ancient Vietnamese village among rice fields and bamboo groves");
    const shots: Shot[] = applyStoryRules(parsed, cast, designed, changes).map((s, i) => ({ ...s, background: backgrounds[i]! }));

    const byId = new Map(cast.map((c) => [c.id, c]));
    const storyboard: Storyboard = {
      title,
      kind: "story",
      scenes: parsed.scenes.map((s, i) => {
        const shot = shots[i]!;
        const chapter = parsed.chapters[s.chapter] || undefined;
        const firstOfChapter = i === 0 || parsed.scenes[i - 1]!.chapter !== s.chapter;
        const actor = byId.get(shot.actor);
        return {
          narration: s.narration,
          chapter,
          // A title card at each chapter; otherwise the picture speaks and captions carry the words.
          onScreen: firstOfChapter && chapter ? { kicker: parsed.chapters.filter(Boolean).length > 1 ? `PHẦN ${s.chapter + 1}` : undefined, title: chapter } : {},
          visual: { description: `${shot.background}, ${shot.time}`, mood: shot.mood },
          camera: CAMERA[actor ? shot.action : "appear"],
          transition: i + 1 < parsed.scenes.length && parsed.scenes[i + 1]!.chapter !== s.chapter ? "fadeblack" : "dissolve",
          ...(actor ? { actor: { id: actor.id, silhouette: actor.silhouette, action: shot.action } } : {}),
          ...(shot.effects.length ? { effects: shot.effects } : {}),
        };
      }),
    };

    await fs.mkdir(projectDir, { recursive: true });
    await writeFileAtomic(storyboardFile, `${JSON.stringify(storyboard, null, 2)}\n`);
    await writeFileAtomic(path.join(projectDir, "build", "logs", `story-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ parsed, cast, changes, designed, shots }, null, 2));
    const settings = path.join(projectDir, "project.json");
    // Story videos are painted, never stock photos: a real photo in a legend breaks the spell.
    if (!(await exists(settings))) await writeFileAtomic(settings, `${JSON.stringify({ engine: "piper", speed: 1, imageGen: "prefer", onlineImages: false }, null, 2)}\n`);
    console.log(`✔ ${path.relative(ROOT, storyboardFile)}`);
    return storyboardFile;
  } finally {
    await provider.release();
  }
}

/** The cast the story names, plus each form a character takes on (asked scene by scene). */
async function designCastAndForms(
  parsed: ParsedStory,
  provider: LlmProvider,
  progress: (step: string) => (chars: number) => void,
): Promise<{ cast: Character[]; changes: FormChange[] }> {
  const designed = await designCast(parsed, provider, progress("cast"));
  process.stdout.write("\n");
  const named = designed.filter((c) => namedInStory(c, parsed));
  for (const c of designed) if (!named.includes(c)) console.warn(`⚠ left out ${c.id} (${c.name}): the story never names it`);
  const cast = (named.length ? named : designed).map((c) => ({ ...c, silhouette: cleanSilhouette(c.silhouette) }));
  const changes: FormChange[] = [];
  for (const scene of transformationScenes(parsed)) {
    try {
      const { from, form } = await designForm(parsed, cast, scene, provider, progress(`form change, scene ${scene + 1}`));
      process.stdout.write("\n");
      cast.push({ ...form, silhouette: cleanSilhouette(form.silhouette) });
      changes.push({ scene, from, to: form.id });
    } catch (err) {
      console.warn(`\n⚠ scene ${scene + 1}: no new form designed (${(err as Error).message})`);
    }
  }
  return { cast, changes };
}
