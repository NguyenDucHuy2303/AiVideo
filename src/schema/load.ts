import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Timeline } from "./timeline.ts";

export class TimelineError extends Error {}

export interface LoadedTimeline {
  timeline: Timeline;
  /** Directory of timeline.json; every relative path in it resolves from here. */
  projectDir: string;
  warnings: string[];
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️]/gu;

/**
 * Make text safe and consistent for rendering:
 * NFC (macOS/LLM output is often NFD and breaks Vietnamese diacritics in libass),
 * no emoji (the bundled font has no glyphs for them), no ASS control characters.
 */
export function sanitizeText(input: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  let text = input.normalize("NFC");
  if (text !== input) notes.push("normalized to NFC");

  const noEmoji = text.replace(EMOJI, "");
  if (noEmoji !== text) notes.push("removed emoji (no glyphs in bundled font)");
  text = noEmoji;

  const noAss = text.replace(/[{]/g, "(").replace(/[}]/g, ")").replace(/\\/g, "/");
  if (noAss !== text) notes.push("replaced { } \\ characters");
  text = noAss;

  return { text: text.replace(/\s+/g, " ").trim(), notes };
}

export function parseTimeline(raw: unknown): { timeline: Timeline; warnings: string[] } {
  const parsed = Timeline.safeParse(raw);
  if (!parsed.success) {
    throw new TimelineError(`timeline.json is invalid:\n${z.prettifyError(parsed.error)}`);
  }
  const timeline = parsed.data;
  const warnings: string[] = [];

  const clean = (where: string, value: string): string => {
    const { text, notes } = sanitizeText(value);
    if (notes.length) warnings.push(`${where}: ${notes.join(", ")}`);
    if (!text) throw new TimelineError(`${where}: text is empty after sanitizing`);
    return text;
  };

  timeline.title = clean("title", timeline.title);
  timeline.scenes.forEach((scene, i) => {
    scene.texts.forEach((t, j) => {
      t.text = clean(`scenes[${i}].texts[${j}]`, t.text);
      if (t.endFrame !== undefined && t.startFrame >= scene.durationFrames) {
        warnings.push(`scenes[${i}].texts[${j}]: starts after the scene ends, it will not be visible`);
      }
    });
    if (scene.caption !== undefined) scene.caption = clean(`scenes[${i}].caption`, scene.caption);
    const g = scene.graphic;
    const gw = `scenes[${i}].graphic`;
    const opt = (where: string, v: string | undefined) => (v ? clean(where, v) : undefined);
    if (g?.type === "big_number") {
      g.value = clean(`${gw}.value`, g.value);
      g.unit = opt(`${gw}.unit`, g.unit);
      g.label = opt(`${gw}.label`, g.label);
    } else if (g?.type === "list") {
      g.items.forEach((item, j) => (item.text = clean(`${gw}.items[${j}]`, item.text)));
    } else if (g?.type === "compare") {
      for (const side of [g.left, g.right]) {
        side.title = clean(`${gw}.title`, side.title);
        side.points = side.points.map((p) => clean(`${gw}.points`, p));
      }
    } else if (g?.type === "icon") {
      g.label = opt(`${gw}.label`, g.label);
    }
    scene.captionCues?.forEach((cue, j) => (cue.text = clean(`scenes[${i}].captionCues[${j}]`, cue.text)));
  });

  const last = timeline.scenes.at(-1)!;
  if (last.transitionOut.type !== "cut" || last.transitionOut.frames > 0) {
    warnings.push(`scenes[${timeline.scenes.length - 1}]: transitionOut on the last scene is ignored`);
    last.transitionOut = { type: "cut", frames: 0 };
  }
  for (const scene of timeline.scenes) {
    // A zero-length transition is a cut, whatever its type says.
    if (scene.transitionOut.frames === 0) scene.transitionOut.type = "cut";
    if (scene.transitionOut.type === "cut") scene.transitionOut.frames = 0;
  }
  return { timeline, warnings };
}

export async function loadTimeline(file: string): Promise<LoadedTimeline> {
  const abs = path.resolve(file);
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(abs, "utf8"));
  } catch (err) {
    throw new TimelineError(`cannot read ${file}: ${(err as Error).message}`);
  }
  const { timeline, warnings } = parseTimeline(raw);
  return { timeline, projectDir: path.dirname(abs), warnings };
}

/** Resolve a timeline path and make sure it cannot escape the project directory. */
export function resolveInProject(projectDir: string, rel: string): string {
  const abs = path.resolve(projectDir, rel);
  const relative = path.relative(projectDir, abs);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new TimelineError(`path escapes the project folder: ${rel}`);
  }
  return abs;
}
