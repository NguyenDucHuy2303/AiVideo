import fs from "node:fs/promises";
import path from "node:path";
import { AUDIO_SAMPLE_RATE, FFMPEG, TIMEOUTS } from "../config.ts";
import { exists, sha256, tmpPathFor } from "../utils/fs.ts";
import type { Logger } from "../utils/log.ts";
import { run } from "../utils/process.ts";
import { probe } from "../utils/probe.ts";
import type { SynthOptions, TtsEngine } from "./engines.ts";
import { normalizeForSpeech, splitSentences } from "./normalize-vi.ts";
import { ENGINES, engineLang } from "./engines.ts";

/** Breathing room around and between sentences, in seconds. */
export const PACING = { lead: 0.2, gap: 0.3, tail: 0.5, minScene: 2.0 };
/**
 * A line wholly in English: no Vietnamese letter once the regulars' names are taken out ("Hùng,
 * look!" is English, "Cat là con mèo" is not), and some English word in it.
 */
export function isEnglishLine(text: string): boolean {
  const t = text.normalize("NFC").replace(/\b(?:Huy|Hùng|Bối|Beo|Mai|Emma)\b/gu, " ");
  if (/[^A-Za-z0-9\s.,!?'’\-…]/.test(t)) return false;
  return /[A-Za-z]{2,}|\b[AI]\b/.test(t);
}
/**
 * English inside a Vietnamese line, marked by the writer with asterisks ("*Cat!* Là con mèo!"):
 * the line in runs, each read in its own language (a Vietnamese voice reads "cat" as "cát").
 */
export function langRuns(text: string): { en: boolean; text: string }[] {
  const out: { en: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/\*([^*]+)\*/g)) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ en: false, text: before });
    if (m[1]!.trim()) out.push({ en: true, text: m[1]!.trim() });
    last = m.index! + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push({ en: false, text: rest });
  return out;
}
/** The line as shown in the captions: the marks taken out. */
export const unmark = (text: string) => text.replace(/\*([^*]+)\*/g, "$1");
/** A silence written in the script ("[3s]", outside any quote): time for the viewers to answer. */
export const PAUSE = /\[(\d+(?:\.\d+)?)s\]/g;
/** Narrator text cut at its pauses: words, and the pauses' lengths in seconds (at most 6). */
export function splitPauses(text: string): (string | number)[] {
  const out: (string | number)[] = [];
  let last = 0;
  for (const m of text.matchAll(PAUSE)) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push(before);
    out.push(Math.min(6, Math.max(0.5, Number(m[1]))));
    last = m.index! + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push(rest);
  return out;
}

export interface CaptionCue {
  text: string;
  startFrame: number;
  endFrame: number;
  /** Who says it: a character's name from the script; absent for the narrator. */
  who?: string;
  /** How they say it, from `Tên (mừng rỡ): "…"`: a face expression name (see face.js). */
  mood?: string;
}

/** Vietnamese words for how a line is said → the face that goes with it. */
const MOODS: [RegExp, string][] = [
  // English versions first (their words contain Vietnamese ones: "slowly" has "lo").
  [/laugh|giggl/i, "laugh"], [/overjoyed|delighted|thrilled|joyful/i, "joy"], [/happ|glad|cheerful/i, "happy"], [/\bcr(y|ies|ying)\b|sob/i, "crying"],
  [/\bsad|sigh/i, "sad"], [/worried|anxious/i, "worried"], [/scared|afraid|frightened|terrified/i, "scared"], [/angr|furious/i, "angry"],
  [/surprised|amazed|astonished|shocked/i, "surprised"], [/shout|yell|roar/i, "shout"], [/determined|firm|resolute|bold/i, "determined"], [/proud/i, "proud"], [/tired|sleepy/i, "sleepy"],
  [/cười|khúc khích/i, "laugh"], [/mừng rỡ|hớn hở|sung sướng|rạng rỡ|reo/i, "joy"], [/mừng|vui|phấn khởi/i, "happy"], [/khóc|nức nở|mếu/i, "crying"], [/buồn|rầu|thở dài/i, "sad"],
  [/lo|băn khoăn|sốt ruột/i, "worried"], [/sợ|hoảng|run/i, "scared"], [/giận|tức|quát/i, "angry"], [/ngạc nhiên|sửng sốt|kinh ngạc|bất ngờ/i, "surprised"],
  [/hét|hô|thét|gầm/i, "shout"], [/quyết|dõng dạc|cương quyết|nghiêm/i, "determined"], [/tự hào|kiêu hãnh/i, "proud"], [/ngái ngủ|mệt/i, "sleepy"],
];
export function moodOf(words: string): string | undefined {
  return MOODS.find(([re]) => re.test(words))?.[1];
}

/**
 * A scene's text split into the narrator's words and lines spoken by characters, written
 * as `Tên: "…"` (straight or curly quotes): «Mẹ: "Con ơi!" Gióng bỗng cất tiếng.» →
 * [{ who: "Mẹ", text: "Con ơi!" }, { text: "Gióng bỗng cất tiếng." }].
 */
export function splitSpeakers(text: string): { who?: string; mood?: string; text: string }[] {
  const out: { who?: string; mood?: string; text: string }[] = [];
  const re = /(\p{Lu}[\p{L}\p{M} ]{0,30}?)\s*(?:\(([^)]{1,30})\))?\s*:\s*["“]([^"”]+)["”]/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const before = text.slice(last, m.index).trim();
    if (before) out.push({ text: before });
    const mood = m[2] ? moodOf(m[2]) : undefined;
    out.push({ who: m[1]!.trim(), ...(mood ? { mood } : {}), text: m[3]!.trim() });
    last = m.index! + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push({ text: rest });
  return out;
}

export interface Narration {
  /** Scene audio file (absolute). */
  audioFile: string;
  durationFrames: number;
  cues: CaptionCue[];
  /** Every part in order, the pauses too: when it starts and ends (seconds into the scene). */
  marks?: { at: number; end: number; pause?: boolean; who?: string }[];
}

export interface NarrateContext {
  engine: TtsEngine;
  synth: SynthOptions;
  /** Voices of the characters, by the name used in the script (project.json "voices"). */
  speakers?: Record<string, SynthOptions>;
  fps: number;
  /** Per-sentence TTS cache, shared by all scenes of the project. */
  ttsDir: string;
  /** Where scene audio files are written. */
  audioDir: string;
  log: Logger;
}

/** Synthesize one sentence, cached by engine fingerprint + spoken text. Returns path and duration. */
/**
 * Text as an engine should read it: Vietnamese numbers, ranges and signs written out for the
 * Vietnamese engines; for English (Kokoro reads numbers itself) only the signs it would spell.
 */
export function speakable(text: string, lang: "vi" | "en"): string {
  if (lang === "vi") return normalizeForSpeech(text);
  return text.normalize("NFC").replace(/(\d)\s?[-–]\s?(\d)/g, "$1 to $2").replace(/&/g, " and ").replace(/[*_#"“”«»()[\]]/g, " ").replace(/\s+/g, " ").trim();
}

async function sentenceAudio(spoken: string, ctx: NarrateContext, fingerprint: string): Promise<{ file: string; seconds: number }> {
  const file = path.join(ctx.ttsDir, `${sha256(`${fingerprint}\n${spoken}`).slice(0, 16)}.wav`);
  if (!(await exists(file))) {
    const tmp = tmpPathFor(file);
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        ctx.log.detail(`tts(${ctx.engine.id}) attempt ${attempt}: ${spoken}`);
        await ctx.engine.synthesize(spoken, tmp, ctx.synth);
        const info = await probe(tmp);
        if (!info.streams.some((s) => s.codec_type === "audio") || info.durationSec < 0.15) {
          throw new Error(`TTS produced no usable audio (${info.durationSec.toFixed(2)}s)`);
        }
        await fs.rename(tmp, file);
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        ctx.log.warn(`tts(${ctx.engine.id}) attempt ${attempt} failed: ${(err as Error).message}`);
        await fs.rm(tmp, { force: true });
      }
    }
    if (lastError) throw new Error(`TTS failed for "${spoken.slice(0, 60)}…": ${(lastError as Error).message}`);
  }
  return { file, seconds: (await probe(file)).durationSec };
}

/** An English recording's words and speaker beside it (file.en.json): the English check (englishcheck.ts) hears it. */
async function markEnglish(file: string, text: string, who?: string): Promise<void> {
  const side = `${file}.en.json`;
  if (!(await exists(side))) await fs.writeFile(side, JSON.stringify({ text, who }));
}

/**
 * A line in two languages, run by run in the speaker's two voices (Vietnamese, then "<who>@en"),
 * joined with a breath between them into one recording (cached by its runs).
 */
async function mixedAudio(text: string, who: string, ctx: NarrateContext, fingerprint: string): Promise<{ file: string; seconds: number }> {
  const files: string[] = [];
  for (const run of langRuns(text)) {
    const synth = run.en ? ctx.speakers?.[`${who}@en`] ?? ctx.speakers?.[who] : ctx.speakers?.[who];
    const engine = synth?.engine && ENGINES[synth.engine] ? ENGINES[synth.engine]! : ctx.engine;
    const runCtx = synth ? { ...ctx, synth, engine } : ctx;
    const spoken = speakable(run.text, engineLang(engine.id));
    if (!/[\p{L}\d]/u.test(spoken)) continue;
    const a = await sentenceAudio(spoken, runCtx, synth ? await engine.fingerprint(synth) : fingerprint);
    if (run.en && engineLang(engine.id) === "en") await markEnglish(a.file, spoken, who);
    files.push(a.file);
  }
  const out = path.join(ctx.ttsDir, `mix-${sha256(files.join("|")).slice(0, 16)}.wav`);
  if (!(await exists(out))) {
    const BREATH = 0.12, graph: string[] = [], seq: string[] = [];
    files.forEach((_, i) => {
      graph.push(`[${i}:a]aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=mono[r${i}]`);
      seq.push(`[r${i}]`);
      if (i < files.length - 1) { graph.push(`anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=mono,atrim=end_sample=${Math.round(BREATH * AUDIO_SAMPLE_RATE)}[b${i}]`); seq.push(`[b${i}]`); }
    });
    graph.push(`${seq.join("")}concat=n=${seq.length}:v=0:a=1[out]`);
    const tmp = tmpPathFor(out);
    await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "warning", ...files.flatMap((f) => ["-i", f]), "-filter_complex", graph.join(";"), "-map", "[out]", "-c:a", "pcm_s16le", tmp], { timeoutMs: TIMEOUTS.assembleMs });
    await fs.rename(tmp, out);
  }
  return { file: out, seconds: (await probe(out)).durationSec };
}

/**
 * Narration for one scene. Each sentence is synthesized separately, so we know exactly when
 * it starts and ends: captions follow the voice without any speech-to-text alignment, and
 * the scene lasts as long as its narration — never the duration an LLM guessed.
 */
export async function narrateScene(sceneId: string, narration: string, ctx: NarrateContext): Promise<Narration> {
  await fs.mkdir(ctx.ttsDir, { recursive: true });
  await fs.mkdir(ctx.audioDir, { recursive: true });
  const fingerprint = await ctx.engine.fingerprint(ctx.synth);

  // The narrator reads the story; a character speaks its own lines in its own voice.
  const parts: { caption: string; file: string; seconds: number; who?: string; mood?: string; pause?: boolean }[] = [];
  for (const piece of splitSpeakers(narration).flatMap((seg) => (seg.who ? [seg] : splitPauses(seg.text).map((x): number | { who?: string; mood?: string; text: string } => (typeof x === "number" ? x : { text: x }))))) {
    // A pause: silence, no caption (the line before it leaves the screen when it is said).
    if (typeof piece === "number") { parts.push({ caption: "", file: `pause:${piece}`, seconds: piece, pause: true }); continue; }
    const seg = piece;
    // A line with English marked inside it (*Cat!* Là con mèo!): each run in its own voice, joined.
    const enVoice = seg.who ? ctx.speakers?.[`${seg.who}@en`] : undefined;
    // (marked means mixed: what is outside the marks is Vietnamese even without accents, "*Cat!* Meo meo!")
    if (seg.who && /\*[^*]+\*/.test(seg.text) && unmark(seg.text).trim() !== langRuns(seg.text).filter((r) => r.en).map((r) => r.text).join(" ").trim()) {
      if (!enVoice) ctx.log.warn(`"${seg.who}" has no English voice ("${seg.who}@en" in project.json): its marked English is read in its own voice`);
      parts.push({ caption: unmark(seg.text), who: seg.who, mood: seg.mood, ...(await mixedAudio(seg.text, seg.who, ctx, fingerprint)) });
      continue;
    }
    // A character with an English voice too ("Bối@en", a Vietnamese lesson) says a line wholly
    // in English with it.
    if (seg.who && /\*/.test(seg.text)) seg.text = unmark(seg.text);
    const en = seg.who && enVoice && isEnglishLine(seg.text) ? enVoice : undefined;
    const synth = en ?? (seg.who ? ctx.speakers?.[seg.who] : undefined);
    if (seg.who && !synth) ctx.log.warn(`no voice for "${seg.who}" in project.json "voices": the narrator reads it`);
    // A voice may have its own engine (an English teacher in a Vietnamese lesson).
    const engine = synth?.engine && ENGINES[synth.engine] ? ENGINES[synth.engine]! : ctx.engine;
    const segCtx = synth ? { ...ctx, synth, engine } : ctx;
    const fp = synth ? await engine.fingerprint(synth) : fingerprint;
    for (const sentence of seg.who ? [seg.text] : splitSentences(seg.text)) {
      const spoken = speakable(sentence, engineLang(engine.id));
      if (!/[\p{L}\d]/u.test(spoken)) continue;
      const audio = await sentenceAudio(spoken, segCtx, fp);
      // (every sentence an English voice says is heard back, the narrator's too: englishcheck.ts)
      if (engineLang(engine.id) === "en") await markEnglish(audio.file, spoken, seg.who);
      parts.push({ caption: sentence, who: seg.who, mood: seg.mood, ...audio });
    }
  }
  if (!parts.some((p) => !p.pause)) throw new Error(`${sceneId}: narration has nothing to say`);

  // Timing: lead, sentence, gap, sentence, …, tail.
  const cues: CaptionCue[] = [];
  let t = PACING.lead;
  const starts: number[] = [];
  for (const p of parts) {
    starts.push(t);
    t += p.seconds + PACING.gap;
  }
  const speechEnd = t - PACING.gap;
  const totalSec = Math.max(PACING.minScene, speechEnd + PACING.tail);
  const durationFrames = Math.ceil(totalSec * ctx.fps);

  parts.forEach((p, i) => {
    if (p.pause) return;
    const startFrame = Math.floor(starts[i]! * ctx.fps);
    // Keep each caption up until the next sentence starts, so text doesn't blink off between
    // sentences; before a pause (or a pause ending the scene) it goes when it is said.
    const next = starts[i + 1], pauseNext = parts[i + 1]?.pause;
    const endFrame = pauseNext ? Math.ceil((starts[i]! + p.seconds + PACING.gap * 0.5) * ctx.fps)
      : next !== undefined ? Math.floor(next * ctx.fps) : Math.min(durationFrames, Math.ceil((speechEnd + PACING.tail * 0.6) * ctx.fps));
    cues.push({ text: p.caption, startFrame, endFrame: Math.max(endFrame, startFrame + 1), ...(p.who ? { who: p.who } : {}), ...(p.mood ? { mood: p.mood } : {}) });
  });

  const key = sha256(JSON.stringify({ fingerprint, parts: parts.map((p) => p.file), PACING, fps: ctx.fps })).slice(0, 12);
  // (Each part's file name already encodes its voice, so the key covers every speaker.)
  const audioFile = path.join(ctx.audioDir, `${sceneId}-${key}.wav`);
  if (!(await exists(audioFile))) {
    const inputs: string[] = [];
    const graph: string[] = [];
    const seq: string[] = [];
    const silence = (label: string, sec: number) =>
      graph.push(`anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=mono,atrim=end_sample=${Math.round(sec * AUDIO_SAMPLE_RATE)}[${label}]`);
    silence("lead", PACING.lead);
    seq.push("[lead]");
    let n = 0;
    parts.forEach((p, i) => {
      if (p.pause) silence(`s${i}`, p.seconds);
      else {
        inputs.push("-i", p.file);
        graph.push(`[${n++}:a]aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=mono[s${i}]`);
      }
      seq.push(`[s${i}]`);
      if (i < parts.length - 1) {
        silence(`g${i}`, PACING.gap);
        seq.push(`[g${i}]`);
      }
    });
    silence("tail", totalSec - speechEnd);
    seq.push("[tail]");
    graph.push(`${seq.join("")}concat=n=${seq.length}:v=0:a=1[out]`);

    const tmp = tmpPathFor(audioFile);
    await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "warning", ...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", "-c:a", "pcm_s16le", tmp], { timeoutMs: TIMEOUTS.assembleMs });
    const got = (await probe(tmp)).durationSec;
    if (Math.abs(got - totalSec) > 0.05) throw new Error(`${sceneId}: scene audio is ${got.toFixed(3)}s, expected ${totalSec.toFixed(3)}s`);
    await fs.rename(tmp, audioFile);
  }

  const marks = parts.map((p, i) => ({ at: Math.round(starts[i]! * 1000) / 1000, end: Math.round((starts[i]! + p.seconds) * 1000) / 1000, ...(p.pause ? { pause: true } : {}), ...(p.who ? { who: p.who } : {}) }));
  return { audioFile, durationFrames, cues, marks };
}
