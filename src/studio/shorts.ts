/**
 * Shorts (Reels, YouTube Shorts, TikTok) cut from a finished story: the best runs of scenes,
 * 30–57 s each, rendered again in 9:16 (the camera frames the vertical picture itself), with no
 * intro and a 2.5 s "watch the whole story" card. Picked by what holds a child's eye: lines
 * spoken, battle and wonder (transformations, fire, light), never the opening or the ending.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { renderStory } from "../animation/story.ts";

const MIN_S = 30, MAX_S = 57;
const MOOD: Record<string, number> = { battle: 3, tense: 2, majestic: 1.5, calm: 0 };
const WONDER = /"fx":\s*"(transform|fire|flash|rays|glow|sparkle|impact)"/g;

export interface ShortPick { from: number; to: number; seconds: number; score: number }

/** The best non-overlapping runs of scenes (storyboard indexes, inclusive). */
export async function pickShorts(projectDir: string, count = 3): Promise<ShortPick[]> {
  const timeline = JSON.parse(await fs.readFile(path.join(projectDir, "timeline.json"), "utf8"));
  const durations: number[] = timeline.scenes.map((s: { durationFrames: number }) => s.durationFrames / timeline.fps);
  const n = durations.length;
  // Each scene's interest: its lines, the mood of its music, its effects.
  const anim = path.join(projectDir, "anim");
  const files = (await fs.readdir(anim)).filter((f) => /^s\d/.test(f) && f.endsWith(".json"));
  const score = durations.map((_, i) => 2 * (timeline.scenes[i].captionCues ?? []).filter((c: { who?: string }) => c.who).length);
  for (const f of files) {
    const m = /^s(\d+)/.exec(f)!, i = Number(m[1]) - 1;
    if (i < 0 || i >= n) continue;
    const text = await fs.readFile(path.join(anim, f), "utf8"), sc = JSON.parse(text);
    score[i]! += (MOOD[sc.mood] ?? 0) + Math.min(4, (text.match(WONDER) ?? []).length * 1.5);
  }
  // Every run that fits the length, best interest per second first; the first and last scenes
  // (the channel's greeting and goodbye) are left out.
  const runs: ShortPick[] = [];
  for (let a = 1; a < n - 1; a++) {
    let t = 0, s = 0;
    for (let b = a; b < n - 1; b++) {
      t += durations[b]!; s += score[b]!;
      if (t > MAX_S) break;
      if (t >= MIN_S) runs.push({ from: a, to: b, seconds: Math.round(t * 10) / 10, score: Math.round((s / t) * 100) / 100 });
    }
  }
  runs.sort((x, y) => y.score - x.score);
  const picked: ShortPick[] = [];
  for (const r of runs) {
    if (picked.length >= count) break;
    if (picked.some((p) => r.from <= p.to && r.to >= p.from)) continue;
    picked.push(r);
  }
  return picked.sort((x, y) => x.from - y.from);
}

/** Render the shorts of a project; returns the files. */
export async function makeShorts(projectDir: string, count = 3, log: (s: string) => void = console.log): Promise<string[]> {
  const out: string[] = [];
  for (const p of await pickShorts(projectDir, count)) {
    log(`  short: scenes ${p.from + 1}–${p.to + 1} (${p.seconds} s, interest ${p.score})`);
    out.push(await renderStory(projectDir, { vertical: true, range: [p.from, p.to], short: true, onLog: log }));
  }
  return out;
}

/** Shorts linked into the job folder (shorts/1.mp4 …). */
export async function linkShorts(files: string[], jobDir: string): Promise<string[]> {
  const dir = path.join(jobDir, "shorts");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const names: string[] = [];
  for (const [i, f] of files.entries()) {
    const name = `${i + 1}.mp4`, target = path.join(dir, name);
    if (await exists(target)) await fs.rm(target);
    await fs.link(f, target).catch(() => fs.copyFile(f, target));
    names.push(`shorts/${name}`);
  }
  return names;
}
