import fs from "node:fs/promises";
import path from "node:path";
import { AUDIO_SAMPLE_RATE, FFMPEG, TIMEOUTS } from "../config.ts";
import { exists, sha256, tmpPathFor } from "../utils/fs.ts";
import type { Logger } from "../utils/log.ts";
import { run } from "../utils/process.ts";
import { probe } from "../utils/probe.ts";
import type { SynthOptions, TtsEngine } from "./engines.ts";
import { normalizeForSpeech, splitSentences } from "./normalize-vi.ts";

/** Breathing room around and between sentences, in seconds. */
export const PACING = { lead: 0.2, gap: 0.3, tail: 0.5, minScene: 2.0 };

export interface CaptionCue {
  text: string;
  startFrame: number;
  endFrame: number;
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
  fps: number;
  /** Per-sentence TTS cache, shared by all scenes of the project. */
  ttsDir: string;
  /** Where scene audio files are written. */
  audioDir: string;
  log: Logger;
}

/** Synthesize one sentence, cached by engine fingerprint + spoken text. Returns path and duration. */
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

  const parts: { caption: string; file: string; seconds: number }[] = [];
  for (const sentence of splitSentences(narration)) {
    const spoken = normalizeForSpeech(sentence);
    if (!/[\p{L}\d]/u.test(spoken)) continue;
    parts.push({ caption: sentence, ...(await sentenceAudio(spoken, ctx, fingerprint)) });
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
    cues.push({ text: p.caption, startFrame, endFrame: Math.max(endFrame, startFrame + 1) });
  });

  const key = sha256(JSON.stringify({ fingerprint, parts: parts.map((p) => p.file), PACING, fps: ctx.fps })).slice(0, 12);
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
