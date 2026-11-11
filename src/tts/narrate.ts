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
  const parts: { caption: string; file: string; seconds: number; who?: string; mood?: string }[] = [];
  for (const seg of splitSpeakers(narration)) {
    const synth = seg.who ? ctx.speakers?.[seg.who] : undefined;
    if (seg.who && !synth) ctx.log.warn(`no voice for "${seg.who}" in project.json "voices": the narrator reads it`);
    // A voice may have its own engine (an English teacher in a Vietnamese lesson).
    const engine = synth?.engine && ENGINES[synth.engine] ? ENGINES[synth.engine]! : ctx.engine;
    const segCtx = synth ? { ...ctx, synth, engine } : ctx;
    const fp = synth ? await engine.fingerprint(synth) : fingerprint;
    for (const sentence of seg.who ? [seg.text] : splitSentences(seg.text)) {
      const spoken = speakable(sentence, engineLang(engine.id));
      if (!/[\p{L}\d]/u.test(spoken)) continue;
      parts.push({ caption: sentence, who: seg.who, mood: seg.mood, ...(await sentenceAudio(spoken, segCtx, fp)) });
    }
  }
  if (!parts.length) throw new Error(`${sceneId}: narration has nothing to say`);

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
    const startFrame = Math.floor(starts[i]! * ctx.fps);
    // Keep each caption up until the next sentence starts, so text doesn't blink off during pauses.
    const next = starts[i + 1];
    const endFrame = next !== undefined ? Math.floor(next * ctx.fps) : Math.min(durationFrames, Math.ceil((speechEnd + PACING.tail * 0.6) * ctx.fps));
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
    parts.forEach((p, i) => {
      inputs.push("-i", p.file);
      graph.push(`[${i}:a]aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=mono[s${i}]`);
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

  return { audioFile, durationFrames, cues };
}
