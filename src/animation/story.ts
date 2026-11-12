/**
 * A whole story as a cartoon: the project's scene scripts (projects/<name>/anim/sNN.json)
 * rendered and joined, over the project's narration (one file per storyboard scene), with
 * music by mood, sound effects taken from the scripts' actions and effects, captions and
 * chapter cards. With the channel's brand (assets/brand/brand.json) the film opens with its
 * intro, carries its logo in a corner, ends with its outro and gets a thumbnail.
 *
 *   node src/animation/story.ts projects/thanh-giong [--vertical]
 *
 * Script names say which storyboard scenes they cover: s05 is scene 5, s04a + s04b share
 * scene 4, s11-12 covers scenes 11 and 12. Each picture is cached by its script and the
 * runtime, so after an edit only the changed scenes render again.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderSoundtrack, type MusicMood, type MusicSection, type SfxEvent } from "../audio/soundtrack.ts";
import { AUDIO_SAMPLE_RATE, FFMPEG, FONTS_DIR, ROOT } from "../config.ts";
import { exists, slugify } from "../utils/fs.ts";
import { run } from "../utils/process.ts";
import { capture } from "./capture.ts";
import { brandClip, brandStills, loadBrand, thumbnail } from "./brand/brand.ts";
import { withBackdrop } from "./backdrops.ts";
import { loadScene } from "./render.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAYER = path.join(HERE, "player.html");
const FPS = 30;
const CHAPTER_FADE = 0.4;

interface Script {
  name: string;
  file: string;
  covers: number[];
  scene: Record<string, any> & { duration: number; timeScale?: number };
}

async function runtimeHash(): Promise<string> {
  const h = createHash("sha256");
  const dir = path.join(HERE, "runtime");
  for (const f of (await fs.readdir(dir)).sort()) h.update(await fs.readFile(path.join(dir, f)));
  h.update(await fs.readFile(PLAYER));
  return h.digest("hex");
}

/** "s04a" → [3], "s11-12" → [10, 11] (zero-based storyboard indexes). */
function covers(name: string): number[] | undefined {
  const m = /^s(\d+)[a-z]?(?:-(\d+))?$/.exec(name);
  if (!m) return undefined;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i);
}

/** Sounds that go with what a script shows, in clip seconds. */
function sfxOf(s: Script): SfxEvent[] {
  const k = 1 / (s.scene.timeScale ?? 1), out: SfxEvent[] = [];
  for (const e of (s.scene.audio?.sfx ?? []) as SfxEvent[]) out.push({ ...e, at: e.at * k });
  // A board: a soft pop as each picture appears (at most one every quarter second).
  if (s.scene.board?.svg) {
    const times = [...String(s.scene.board.svg).matchAll(/data-in\s*=\s*["']([\d.]+)["']/g)].map((m) => Number(m[1])).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    let last = -1;
    for (const t of times) if (t - last >= 0.25) { out.push({ type: "pop", at: t * k }); last = t; }
  }
  if (s.scene.audio?.sfx) return out;
  for (const f of s.scene.fx ?? []) {
    const at = f.at * k;
    if (f.fx === "transform") out.push({ type: "shimmer", at: at - 0.4 * k }, { type: "wind", at: at - 0.1 }, { type: "boom", at: at + 0.27 * k }, { type: "shimmer", at: at + 0.6 * k });
    if (f.fx === "fire") out.push({ type: "whoosh", at });
    if (f.fx === "impact") out.push({ type: "boom", at });
    if (f.fx === "flash") out.push({ type: "boom", at });
    if (f.fx === "sparkle" || f.fx === "glow") out.push({ type: "shimmer", at });
    if (f.fx === "pop") out.push({ type: "whoosh", at });
  }
  const galloping = new Set<string>();
  for (const a of s.scene.actions ?? []) {
    if (a.do === "gallop" && !galloping.has(a.actor)) { out.push({ type: "drums", at: Math.max(0, a.at * k) }); galloping.add(a.actor); }
    if (a.do === "leap" && (a.dur ?? 0.7) > 0.1) out.push({ type: "whoosh", at: a.at * k });
    if (a.do === "fall") out.push({ type: "boom", at: a.at * k + 0.3 });
    if (a.do === "fly") out.push({ type: "wind", at: a.at * k });
  }
  return out.filter((e) => e.at >= 0 && e.at < s.scene.duration);
}

const stamp = (s: number) => {
  const cs = Math.max(0, Math.round(s * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, "0")}:${String(Math.floor((cs % 6000) / 100)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

interface Cue { text: string; from: number; to: number; who?: string; mood?: string }

/** Captions from the timed cues: the narrator in white, characters' lines in warm yellow. */
export function subtitles(cues: Cue[], cards: { at: number; title: string; no: number }[], W: number, H: number): string {
  const vertical = H > W;
  const events: string[] = [];
  for (const c of cues) {
    const parts = c.text.split(/(?<=[,.;:!?])\s+/).filter(Boolean), total = parts.reduce((n, p) => n + p.length, 0);
    let t = c.from;
    for (const p of parts) {
      const d = ((c.to - c.from) * p.length) / total;
      events.push(`Dialogue: 0,${stamp(t)},${stamp(t + d)},${c.who ? "dlg" : "cap"},,0,0,0,,${c.who ? `“${p}”` : p}`);
      t += d;
    }
  }
  for (const k of cards) {
    const fade = "{\\fad(400,500)}";
    events.push(`Dialogue: 1,${stamp(k.at + 0.35)},${stamp(k.at + 3.6)},kicker,,0,0,0,,${fade}PHẦN ${k.no}`);
    events.push(`Dialogue: 1,${stamp(k.at + 0.45)},${stamp(k.at + 3.6)},card,,0,0,0,,${fade}${k.title}`);
  }
  // Vertical (Shorts, TikTok, Reels): big, and inside the apps' safe zone: above the caption and
  // name they lay over the bottom ~20 %, clear of the button column on the right.
  const capSize = vertical ? 74 : 62, capMargin = vertical ? 400 : 64, outline = vertical ? 6 : 5;
  const [capL, capR] = vertical ? [90, 170] : [140, 140];
  const cardSize = vertical ? 92 : 88, top = vertical ? 300 : 120;
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: cap,Noto Sans,${capSize},&H00FFFFFF,&H00FFFFFF,&H00201008,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},2,2,${capL},${capR},${capMargin},1`,
    `Style: dlg,Noto Sans,${capSize},&H0070E6FF,&H00FFFFFF,&H00201008,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},2,2,${capL},${capR},${capMargin},1`,
    `Style: kicker,Noto Sans,${Math.round(cardSize * 0.45)},&H0040C8F0,&H00FFFFFF,&H00201008,&H80000000,-1,0,0,0,100,100,6,0,1,4,2,8,80,80,${top},1`,
    `Style: card,Noto Sans,${cardSize},&H00FFFFFF,&H00FFFFFF,&H00201008,&H80000000,-1,0,0,0,100,100,0,0,1,7,3,8,80,80,${top + Math.round(cardSize * 0.62)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...events, "",
  ].join("\n");
}

/** The vowel of each syllable, for mouth shapes (a, o, u, i, e; m when none). */
export function visemesOf(text: string): string[] {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/đ/g, "d").split(/[^a-z]+/).filter(Boolean).map((w) => {
    const v = w.match(/[aeiouy]+/)?.[0] ?? "";
    return /o/.test(v) ? "o" : /u/.test(v) && !/[ai]/.test(v) ? "u" : /a/.test(v) ? "a" : /e/.test(v) ? "e" : /[iy]/.test(v) ? "i" : "m";
  });
}

/** Loudness of the voice track per video frame, 0–1 (for lip-sync). */
async function envelope(wav: string, work: string): Promise<number[]> {
  const raw = path.join(work, "voice.s16");
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", wav, "-ac", "1", "-ar", "8000", "-f", "s16le", raw], { timeoutMs: 60_000 });
  const buf = await fs.readFile(raw), pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2), per = 8000 / FPS;
  const rms: number[] = [];
  for (let i = 0; i * per < pcm.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.floor(i * per); j < Math.min(pcm.length, Math.floor((i + 1) * per)); j++) { sum += pcm[j]! * pcm[j]!; n++; }
    rms.push(Math.sqrt(sum / Math.max(1, n)));
  }
  const ref = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.95)] || 1;
  return rms.map((v) => Math.min(1, v / ref));
}

export interface StoryOptions {
  vertical?: boolean;
  anim?: string;
  /** Mark the chapters (title cards, fades through black, a chime). Off: one seamless film. */
  chapters?: boolean;
  /** Added to the file name, so a new version never overwrites an earlier one. */
  tag?: string;
  /** Only storyboard scenes a..b (0-based, inclusive): a short cut from the story. */
  range?: [number, number];
  /** Only these storyboard scenes (0-based), in order, not necessarily next to each other: a
   * question channel's Short (the question, the answer, the fun fact). Wins over range. */
  scenes?: number[];
  /** A short (Reels, Shorts, TikTok): no intro, a 2.5 s end card instead of the outro, no thumbnail. */
  short?: boolean;
  /** The brand's language (brand.json "languages"): "en" for the English version. */
  lang?: string;
  /** Intro, logo, outro and thumbnail of the channel (default: on when assets/brand/brand.json exists). */
  brand?: boolean;
  onLog?: (s: string) => void;
}

export async function renderStory(projectDir: string, opts: StoryOptions = {}): Promise<string> {
  const log = opts.onLog ?? ((s: string) => console.log(s));
  const dir = path.resolve(projectDir);
  const storyboard = JSON.parse(await fs.readFile(path.join(dir, "storyboard.json"), "utf8"));
  const timeline = JSON.parse(await fs.readFile(path.join(dir, "timeline.json"), "utf8"));
  // The scenes kept (all, a range, or a list) and where each lands in the cut.
  const all = storyboard.scenes.length;
  const keep: number[] = opts.scenes ? [...new Set(opts.scenes)].filter((i) => i >= 0 && i < all).sort((a, b) => a - b)
    : opts.range ? Array.from({ length: opts.range[1] - opts.range[0] + 1 }, (_, k) => opts.range![0] + k)
    : Array.from({ length: all }, (_, k) => k);
  const at = new Map(keep.map((i, k) => [i, k]));
  if (keep.length !== all) {
    storyboard.scenes = keep.map((i) => storyboard.scenes[i]);
    timeline.scenes = keep.map((i) => timeline.scenes[i]);
  }
  const [W, H] = opts.vertical ? [1080, 1920] : [1920, 1080];
  const shape = opts.vertical ? "9x16" : "16x9";
  const durations: number[] = timeline.scenes.map((s: { durationFrames: number }) => s.durationFrames / timeline.fps);
  const chapters: (string | undefined)[] = storyboard.scenes.map((s: { chapter?: string }) => s.chapter);

  // Scripts in story order, with what they cover.
  const animDir = path.join(dir, opts.anim ?? "anim");
  const scripts: Script[] = [];
  for (const f of (await fs.readdir(animDir)).sort()) {
    const name = path.basename(f, ".json"), cov = f.endsWith(".json") ? covers(name) : undefined;
    if (!cov || cov.some((i) => !at.has(i))) continue;
    scripts.push({ name, file: path.join(animDir, f), covers: cov.map((i) => at.get(i)!), scene: (await withBackdrop(await loadScene(path.join(animDir, f)))) as Script["scene"] });
  }
  const missing = durations.map((_, i) => i).filter((i) => !scripts.some((s) => s.covers.includes(i)));
  if (missing.length) throw new Error(`no scene script covers storyboard scene(s) ${missing.map((i) => i + 1).join(", ")}`);
  // Each group of scripts lasts exactly as long as the narration it covers: when the voice
  // changes (another voice, another speed), the action is stretched or squeezed to fit.
  for (const i of new Set(scripts.map((s) => s.covers[0]!))) {
    const group = scripts.filter((s) => s.covers[0] === i), want = group[0]!.covers.reduce((n, k) => n + durations[k]!, 0);
    const got = group.reduce((n, s) => n + s.scene.duration, 0), ratio = want / got;
    if (Math.abs(ratio - 1) < 0.002) continue;
    if (ratio < 0.6 || ratio > 1.6) log(`⚠ ${group.map((s) => s.name).join("+")}: ${got.toFixed(2)} s of picture for ${want.toFixed(2)} s of narration (stretched ×${ratio.toFixed(2)}; consider re-timing it)`);
    for (const s of group) {
      s.scene.duration = Math.round(s.scene.duration * ratio * 1000) / 1000;
      s.scene.timeScale = (s.scene.timeScale ?? 1) / ratio;
    }
  }
  // The film fades in and out; with chapters marked, it also fades through black between them.
  const chapterStart = (i: number) => i === 0 || (!!opts.chapters && chapters[i] !== chapters[i - 1]);
  scripts.forEach((s, j) => {
    const first = j === 0 || scripts[j - 1]!.covers[0] !== s.covers[0];
    const last = j === scripts.length - 1 || scripts[j + 1]!.covers[0] !== s.covers[0];
    if (first && chapterStart(s.covers[0]!)) s.scene.fadeIn = CHAPTER_FADE;
    const end = s.covers[s.covers.length - 1]! + 1;
    if (last && (end >= durations.length || chapterStart(end))) s.scene.fadeOut = end >= durations.length ? 1.0 : CHAPTER_FADE;
  });

  const variant = (opts.anim && opts.anim !== "anim" ? `-${opts.anim}` : "") + (opts.tag ? `-${slugify(opts.tag)}` : "") + (keep.length !== all ? `-short-${opts.scenes ? keep.map((i) => i + 1).join("-") : `${keep[0]! + 1}-${keep.at(-1)! + 1}`}` : "");
  const work = path.join(dir, "build", "anim", `${shape}${variant}-work`);
  await fs.mkdir(work, { recursive: true });
  // Narration first (the voice decides lip-sync and close-ups): each scene's voice at its start.
  const total = durations.reduce((a, b) => a + b, 0);
  const voices = timeline.scenes.map((s: { audio: { src: string } }) => path.join(dir, s.audio.src));
  const voice = path.join(work, "voice.wav");
  await run(FFMPEG, [
    "-hide_banner", "-nostdin", "-y", "-v", "error", ...voices.flatMap((v: string) => ["-i", v]),
    "-filter_complex", `${voices.map((_: string, i: number) => `[${i}:a]aresample=${AUDIO_SAMPLE_RATE},apad=whole_dur=${durations[i]!.toFixed(4)}[v${i}]`).join(";")};${voices.map((_: string, i: number) => `[v${i}]`).join("")}concat=n=${voices.length}:v=0:a=1[a]`,
    "-map", "[a]", "-ac", "1", voice,
  ], { timeoutMs: 2 * 60_000 });


  // Who says what, when (film seconds), from the timed cues of the voice build.
  const project = (await exists(path.join(dir, "project.json"))) ? JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8")) : {};
  const speakers: Record<string, string[]> = Object.fromEntries(Object.entries(project.speakers ?? {}).map(([k, v]) => [k, ([] as string[]).concat(v as string)]));
  const cues: Cue[] = [];
  let at0 = 0;
  timeline.scenes.forEach((sc: { captionCues?: { text: string; startFrame: number; endFrame: number; who?: string; mood?: string }[] }, i: number) => {
    for (const c of sc.captionCues ?? []) cues.push({ text: c.text, from: at0 + c.startFrame / timeline.fps, to: at0 + c.endFrame / timeline.fps, who: c.who, mood: c.mood });
    at0 += durations[i]!;
  });
  const dialogue = cues.filter((c) => c.who);
  if (dialogue.length) {
    const env = await envelope(voice, work);
    let clipStart = 0;
    for (const s of scripts) {
      const D = s.scene.duration, ts = s.scene.timeScale ?? 1;
      const ids = new Set((s.scene.cast ?? []).map((c: { id: string }) => c.id));
      const speech: Record<string, unknown>[] = [];
      for (const c of dialogue) {
        const from = Math.max(0, c.from - clipStart), to = Math.min(D, c.to - clipStart);
        if (to - from < 0.2) continue;
        const actor = (speakers[c.who!] ?? []).find((id) => ids.has(id));
        if (!actor) { if (!speakers[c.who!]) log(`⚠ no actor for "${c.who}" (project.json "speakers")`); continue; }
        const f0 = Math.round((clipStart + from) * FPS), f1 = Math.round((clipStart + to) * FPS);
        speech.push({ actor, from, to, env: env.slice(f0, f1).map((v) => Math.round(v * 100) / 100), visemes: visemesOf(c.text), ...(c.mood ? { face: c.mood } : {}) });
      }
      if (speech.length) {
        s.scene.speech = speech;
        // A scene can keep its own framing (speakerShots: false), e.g. a presenter beside a board.
        if (s.scene.speakerShots === false) { clipStart += D; continue; }
        // Cut to the speaker for the line, then back to the shot that was running.
        // While someone speaks the close-up on them wins: shots planned inside a line give way.
        const long = (speech as { from: number; to: number }[]).filter((sp) => sp.to - sp.from >= 0.8);
        const shots: { at: number; [k: string]: unknown }[] = (s.scene.shots ?? []).map((x: object) => ({ ...x }))
          .filter((x: { at: number }) => !long.some((sp) => x.at > sp.from * ts + 0.01 && x.at < sp.to * ts - 0.01));
        const active = (t: number) => [...shots].filter((x) => x.at <= t).sort((a, b) => a.at - b.at).at(-1);
        const added: typeof shots = [];
        for (const sp of speech as { actor: string; from: number; to: number }[]) {
          if (sp.to - sp.from < 0.8) continue;
          const back = active(sp.to * ts);
          added.push({ at: sp.from * ts, type: "close", on: sp.actor, push: 0.04 });
          if (back && sp.to < D - 0.3) added.push({ ...back, at: sp.to * ts, ease: undefined });
        }
        s.scene.shots = [...shots, ...added].sort((a, b) => a.at - b.at);
      }
      clipStart += D;
    }
  }

  // Pictures, cached by script + runtime.
  const cache = path.join(dir, "build", "anim", shape);
  await fs.mkdir(cache, { recursive: true });
  const rt = await runtimeHash();
  const clips: string[] = [];
  for (const s of scripts) {
    const key = createHash("sha256").update(rt).update(JSON.stringify(s.scene)).update(shape).digest("hex").slice(0, 12);
    const clip = path.join(cache, `${s.name}-${key}.mp4`);
    if (!(await exists(clip))) {
      const t0 = Date.now();
      await capture({ page: PLAYER, width: W, height: H, fps: FPS, seconds: s.scene.duration, output: `${clip}.part.mp4`, params: { scene: s.scene, width: W, height: H } });
      await fs.rename(`${clip}.part.mp4`, clip);
      log(`  ${s.name}: ${s.scene.duration.toFixed(1)} s rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } else log(`  ${s.name}: cached`);
    clips.push(clip);
  }
  const list = path.join(work, "clips.txt");
  await fs.writeFile(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
  const picture = path.join(work, "picture.mp4");
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", picture], { timeoutMs: 5 * 60_000 });

  // Music by mood (consecutive moods merge), effects from the scripts, a chime per chapter.
  const sections: MusicSection[] = [];
  const sfx: SfxEvent[] = [];
  let t = 0;
  for (const s of scripts) {
    // `mood`, or `moods: [{ at, mood }]` (scene seconds) for a change inside the scene.
    const k = 1 / (s.scene.timeScale ?? 1);
    const parts: { at: number; mood: MusicMood }[] = s.scene.moods ?? [{ at: 0, mood: (s.scene.mood as MusicMood) || "calm" }];
    parts.forEach((m, i) => {
      const a = t + m.at * k, b = t + (parts[i + 1] ? parts[i + 1]!.at * k : s.scene.duration), last = sections.at(-1);
      if (last && (last.mood === m.mood || b - a < 3)) last.duration = b - last.start;
      else sections.push({ start: a, duration: b - a, mood: m.mood });
    });
    for (const e of sfxOf(s)) sfx.push({ ...e, at: t + e.at });
    if (s.scene.fadeIn && opts.chapters) sfx.push({ type: "chime", at: t + 0.15 });
    t += s.scene.duration;
  }
  const bed = path.join(work, "bed.wav");
  await renderSoundtrack(sections, sfx.sort((a, b) => a.at - b.at), total, bed);

  // Captions (timed by the voice) and, if asked, chapter cards.
  const cards: { at: number; title: string; no: number }[] = [];
  let cardAt = 0;
  for (let i = 0; i < durations.length; i++) {
    if (opts.chapters && chapterStart(i) && chapters[i]) cards.push({ at: cardAt, title: chapters[i]!, no: cards.length + 1 });
    cardAt += durations[i]!;
  }
  const subs = path.join(work, "captions.ass");
  await fs.writeFile(subs, subtitles(cues, cards, W, H));

  const out = path.join(dir, "out", `${slugify(storyboard.title || path.basename(dir))}-hoat-hinh${variant}_${shape}.mp4`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  // The channel's brand: project.json "brandId" for another channel's own (Ask Huy), else the first.
  const brand = opts.brand === false ? undefined : await loadBrand(opts.lang, project.brandId);
  const esc = (p: string) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const mix = [
    "[1:a]apad,asplit=2[voice][key]",
    "[2:a]volume=0.5[bedq]",
    "[bedq][key]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=450[ducked]",
    `[voice][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=${AUDIO_SAMPLE_RATE}`,
  ];
  const caption = `[0:v]subtitles='${esc(subs)}':fontsdir='${esc(FONTS_DIR)}'`;
  let inputs: string[] = [], graph: string[], length = total;
  if (brand) {
    // Intro, the film with the logo faint in the top corner, outro: one encode.
    const { watermark } = await brandStills(brand);
    // A short starts on the story at once (no intro) and ends on a short card.
    // The intro and outro the user picked (project.json "brand": { "intro", "outro" }).
    const intro = opts.short ? undefined : await brandClip(brand, "intro", !!opts.vertical, project.brand?.intro);
    const outro = await brandClip(brand, opts.short ? "end" : "outro", !!opts.vertical, project.brand?.outro);
    const mark = Math.round(Math.min(W, H) * 0.11), pad = Math.round(Math.min(W, H) * 0.035);
    const norm = `aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo`;
    inputs = ["-loop", "1", "-i", watermark, "-i", outro.file, ...(intro ? ["-i", intro.file] : [])];
    graph = [
      `${caption}[cap]`,
      `[3:v]scale=${mark}:${mark},format=rgba,colorchannelmixer=aa=0.6[mark]`,
      `[cap][mark]overlay=W-w-${pad}:${pad}:shortest=1,setsar=1,fps=${FPS}[film]`,
      ...mix.slice(0, 3), `${mix[3]},${norm}[filma]`,
      `[4:v]scale=${W}:${H},setsar=1,fps=${FPS}[ov]`, `[4:a]${norm}[oa]`,
      ...(intro ? [`[5:v]scale=${W}:${H},setsar=1,fps=${FPS}[iv]`, `[5:a]${norm}[ia]`, "[iv][ia][film][filma][ov][oa]concat=n=3:v=1:a=1[v][a]"] : ["[film][filma][ov][oa]concat=n=2:v=1:a=1[v][a]"]),
    ];
    length = total + (intro?.seconds ?? 0) + outro.seconds;
  } else graph = [`${caption}[v]`, ...mix.slice(0, 3), `${mix[3]}[a]`];
  await run(FFMPEG, [
    "-hide_banner", "-nostdin", "-y", "-v", "error", "-i", picture, "-i", voice, "-i", bed, ...inputs,
    "-filter_complex", graph.join(";"),
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "19", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-t", length.toFixed(3), "-movflags", "+faststart", out,
  ], { timeoutMs: 20 * 60_000 });
  if (brand && !opts.short) {
    // project.json "thumbnail": { "at": seconds into the story, "title", "subtitle" }.
    const th = project.thumbnail ?? {};
    // Default: the close-up on the longest strong line (a big, telling face), else 60 % in.
    const strong = dialogue.filter((c) => /determined|shout|angry|surprised|proud|happy|laugh/.test(c.mood ?? "")).sort((a, b) => (b.to - b.from) - (a.to - a.from))[0];
    const at = Math.min(total - 0.5, th.at ?? (strong ? (strong.from + strong.to) / 2 : total * 0.6));
    const jpg = out.replace(/\.mp4$/, "_thumbnail.jpg");
    await thumbnail(brand, picture, at, th.title ?? storyboard.title ?? path.basename(dir), th.subtitle ?? brand.tagline, jpg);
    log(`  thumbnail: ${path.relative(dir, jpg)}`);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const project = args.find((a) => !a.startsWith("--"));
  if (!project) {
    console.error("usage: node src/animation/story.ts <projects/name> [--vertical]");
    process.exit(2);
  }
  const t0 = Date.now();
  const out = await renderStory(project, { vertical: args.includes("--vertical"), chapters: args.includes("--chapters"), brand: !args.includes("--no-brand"), anim: args.includes("--anim") ? args[args.indexOf("--anim") + 1] : undefined });
  console.log(`✔ ${path.relative(ROOT, out)} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
}
