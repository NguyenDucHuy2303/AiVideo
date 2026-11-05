import path from "node:path";
import { FFMPEG, ROOT } from "../config.ts";
import { exists, hashFile } from "../utils/fs.ts";
import { run } from "../utils/process.ts";

export const PIPER_DIR = process.env.PIPER_DIR ?? path.join(ROOT, "vendor", "piper");
export const VOICES_DIR = process.env.VOICES_DIR ?? path.join(ROOT, "vendor", "voices");

export interface VoiceInfo {
  id: string;
  quality: string;
  sampleRate: number;
  license: string;
  /** Whether the training data license allows commercial use. */
  commercial: boolean | "unknown";
  note: string;
}

/** Vietnamese Piper voices (from their MODEL_CARD files on huggingface.co/rhasspy/piper-voices). */
export const VOICES: VoiceInfo[] = [
  { id: "vi_VN-vais1000-medium", quality: "medium", sampleRate: 22050, license: "CC BY 4.0 (VAIS-1000 dataset)", commercial: true, note: "best quality; credit the VAIS-1000 corpus" },
  { id: "vi_VN-25hours_single-low", quality: "low", sampleRate: 16000, license: "unknown (InfoRe Technology 1)", commercial: "unknown", note: "check the dataset license before publishing" },
  { id: "vi_VN-vivos-x_low", quality: "x_low", sampleRate: 16000, license: "CC BY-NC-SA 4.0 (VIVOS)", commercial: false, note: "non-commercial only" },
];

export const DEFAULT_VOICE = "vi_VN-vais1000-medium";

export interface SynthOptions {
  voice: string;
  /** 1 = normal; 1.1 = 10% faster. */
  speed: number;
}

export interface TtsEngine {
  id: string;
  /** Everything that changes the audio for the same text: used in the cache key. */
  fingerprint(opts: SynthOptions): Promise<string>;
  synthesize(text: string, outWav: string, opts: SynthOptions): Promise<void>;
}

const TIMEOUT_MS = 120_000;

export const piper: TtsEngine = {
  id: "piper",
  async fingerprint(opts) {
    const model = path.join(VOICES_DIR, `${opts.voice}.onnx`);
    if (!(await exists(model))) {
      throw new Error(`voice "${opts.voice}" is not installed (${model}). Run: bash scripts/setup-tts.sh`);
    }
    return `piper:${opts.voice}:${opts.speed}:${await hashFile(model)}`;
  },
  async synthesize(text, outWav, opts) {
    const bin = path.join(PIPER_DIR, "piper");
    if (!(await exists(bin))) throw new Error(`piper is not installed (${bin}). Run: bash scripts/setup-tts.sh`);
    const model = path.join(VOICES_DIR, `${opts.voice}.onnx`);
    await run(
      bin,
      ["--model", model, "--config", `${model}.json`, "--output_file", outWav, "--length_scale", (1 / opts.speed).toFixed(3)],
      {
        // One line of text = one utterance; newlines were removed by sanitizing.
        input: `${text}\n`,
        timeoutMs: TIMEOUT_MS,
        env: { ...process.env, LD_LIBRARY_PATH: [PIPER_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") },
      },
    );
  },
};

/**
 * Development stand-in: a soft pulsing tone about as long as the sentence would take to read
 * (~14 characters per second). Lets the whole pipeline — durations, caption timing,
 * rendering — be tested without a real voice.
 */
export const dummy: TtsEngine = {
  id: "dummy",
  async fingerprint(opts) {
    return `dummy:1:${opts.speed}`;
  },
  async synthesize(text, outWav, opts) {
    const seconds = Math.max(0.6, text.length / 14 / opts.speed).toFixed(3);
    await run(
      FFMPEG,
      [
        "-hide_banner", "-nostdin", "-y", "-v", "error",
        "-f", "lavfi", "-i", `aevalsrc='0.25*sin(2*PI*220*t)*(0.55+0.45*sin(2*PI*3.5*t))':s=22050:d=${seconds}`,
        "-af", "afade=t=in:d=0.05,areverse,afade=t=in:d=0.08,areverse",
        "-ac", "1",
        outWav,
      ],
      { timeoutMs: TIMEOUT_MS },
    );
  },
};

export const ENGINES: Record<string, TtsEngine> = { piper, dummy };
