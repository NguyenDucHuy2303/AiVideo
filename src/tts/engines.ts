import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  /** Semitones up (a child from a woman's voice: +3…+4) or down. */
  pitch?: number;
  /** Another engine for this voice than the project's (an English word read by Kokoro in a Vietnamese lesson). */
  engine?: string;
}

/** The language an engine speaks: how its text is prepared (numbers read in that language). */
export const engineLang = (id: string): "vi" | "en" => (id === "kokoro" ? "en" : "vi");

/**
 * ffmpeg filters for a speed and a pitch change (pitch by resampling, tempo restored). The audio
 * is brought to 48 kHz first: asetrate needs to know the rate it starts from (Kokoro speaks at
 * 24 kHz; reading it as 48 kHz made a child's voice an octave too high and twice too fast).
 */
export function voiceFilters(speed: number, pitch = 0): string[] {
  const f: string[] = [];
  let tempo = speed;
  if (pitch) {
    const k = Math.pow(2, pitch / 12);
    f.push("aresample=48000", `asetrate=48000*${k.toFixed(5)}`, "aresample=48000");
    tempo /= k;
  }
  // atempo accepts 0.5–2 per stage.
  while (tempo < 0.5) { f.push("atempo=0.5"); tempo /= 0.5; }
  while (tempo > 2) { f.push("atempo=2"); tempo /= 2; }
  if (Math.abs(tempo - 1) > 1e-3) f.push(`atempo=${tempo.toFixed(5)}`);
  return f;
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

/**
 * VieNeu-TTS v3 Turbo (scripts/setup-vieneu.sh): natural, expressive Vietnamese on the CPU.
 * One Python worker keeps the model loaded for the whole build; sentences go to it one by
 * one. Preset voices (e.g. "Ngọc Huyền", "Minh Đức") are cleared for commercial use.
 */
export const VIENEU_DIR = process.env.VIENEU_DIR ?? path.join(ROOT, "vendor", "vieneu");
export const VIENEU_DEFAULT_VOICE = "Ngọc Huyền";
const VIENEU_PYTHON = path.join(VIENEU_DIR, "venv", "bin", "python");
const VIENEU_WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "vieneu_worker.py");
/** The model loads in the first request: allow for it. */
const VIENEU_FIRST_MS = 10 * 60_000;

type Worker = { proc: ChildProcess; queue: ((reply: { ok?: boolean; error?: string; ready?: boolean }) => void)[]; ready: Promise<void> };
const workers = new Map<string, Worker>();

/** A Python worker kept alive for the build (one per engine): JSON lines in, JSON lines out. */
function pyWorker(name: string, python: string, script: string): Worker {
  const running = workers.get(name);
  if (running && running.proc.exitCode === null) return running;
  const proc = spawn(python, [script], { stdio: ["pipe", "pipe", "pipe"] });
  const queue: Worker["queue"] = [];
  let buffer = "", stderr = "";
  proc.stdout!.setEncoding("utf8").on("data", (d: string) => {
    buffer += d;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("{")) continue; // library chatter
      queue.shift()?.(JSON.parse(line));
    }
  });
  proc.stderr!.setEncoding("utf8").on("data", (d: string) => (stderr = (stderr + d).slice(-2000)));
  proc.on("exit", (code) => { for (const q of queue.splice(0)) q({ error: `${name} worker exited (${code}): ${stderr.trim().split("\n").slice(-3).join(" ")}` }); });
  // Don't keep Node alive for it (its pipes neither), and don't leave it behind.
  proc.unref();
  for (const s of [proc.stdin, proc.stdout, proc.stderr]) (s as unknown as { unref?: () => void })?.unref?.();
  process.once("exit", () => proc.kill());
  const ready = new Promise<void>((resolve, reject) => queue.push((r) => (r.ready ? resolve() : reject(new Error(r.error ?? `${name} worker did not start`)))));
  const w = { proc, queue, ready };
  workers.set(name, w);
  return w;
}

function workerRequest(w: Worker, name: string, text: string, voice: string, out: string): Promise<void> {
  // The timer also keeps Node waiting while the model loads (the worker itself is unref'd).
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} took too long`)), VIENEU_FIRST_MS);
    w.ready.then(() => {
      w.queue.push((r) => { clearTimeout(timer); r.ok ? resolve() : reject(new Error(r.error ?? `${name} failed`)); });
      w.proc.stdin!.write(`${JSON.stringify({ text, voice, out })}\n`);
    }, (err: Error) => { clearTimeout(timer); reject(err); });
  });
}

export const vieneu: TtsEngine = {
  id: "vieneu",
  async fingerprint(opts) {
    if (!(await exists(VIENEU_PYTHON))) throw new Error(`VieNeu-TTS is not installed (${VIENEU_DIR}). Run: bash scripts/setup-vieneu.sh`);
    const version = (await fs.readFile(path.join(VIENEU_DIR, "VERSION"), "utf8").catch(() => "?")).trim();
    return `vieneu:${version}:${opts.voice}:${opts.speed}${opts.pitch ? `:p${opts.pitch}` : ""}`;
  },
  async synthesize(text, outWav, opts) {
    const raw = `${outWav}.raw.wav`;
    try {
      await workerRequest(pyWorker("VieNeu", VIENEU_PYTHON, VIENEU_WORKER), "VieNeu", text, opts.voice, raw);
      // 48 kHz from the model; speed changes keep the pitch (atempo).
      const af = voiceFilters(opts.speed, opts.pitch);
      await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", raw, ...(af.length ? ["-af", af.join(",")] : []), "-ac", "1", outWav], { timeoutMs: TIMEOUT_MS });
    } finally {
      await fs.rm(raw, { force: true });
    }
  },
};

/**
 * Kokoro-82M (scripts/setup-kokoro.sh, Apache-2.0): English (American af_/am_, British bf_/bm_)
 * and a few other languages, for the English versions of the videos.
 */
export const KOKORO_DIR = process.env.KOKORO_DIR ?? path.join(ROOT, "vendor", "kokoro");
export const KOKORO_DEFAULT_VOICE = "af_heart";
const KOKORO_PYTHON = path.join(KOKORO_DIR, "venv", "bin", "python");
const KOKORO_WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), "kokoro_worker.py");

/**
 * Vietnamese names Kokoro cannot read (it spells out "ố" letter by letter): written as they
 * are on screen, said through an English spelling of the same sound.
 */
const KOKORO_SAY: [RegExp, string][] = [[/\bBối\b/gu, "Boy"], [/\bbối\b/gu, "boy"]];
export const kokoroText = (text: string) => KOKORO_SAY.reduce((t, [re, say]) => t.replace(re, say), text);

export const kokoro: TtsEngine = {
  id: "kokoro",
  async fingerprint(opts) {
    if (!(await exists(KOKORO_PYTHON))) throw new Error(`Kokoro is not installed (${KOKORO_DIR}). Run: bash scripts/setup-kokoro.sh`);
    return `kokoro:v1.0:${opts.voice}:${opts.speed}${opts.pitch ? `:p${opts.pitch}r48` : ""}`;
  },
  async synthesize(text, outWav, opts) {
    const raw = `${outWav}.raw.wav`;
    try {
      await workerRequest(pyWorker("Kokoro", KOKORO_PYTHON, KOKORO_WORKER), "Kokoro", kokoroText(text), opts.voice, raw);
      const af = voiceFilters(opts.speed, opts.pitch);
      await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", raw, ...(af.length ? ["-af", af.join(",")] : []), "-ar", "48000", "-ac", "1", outWav], { timeoutMs: TIMEOUT_MS });
    } finally {
      await fs.rm(raw, { force: true });
    }
  },
};

export const ENGINES: Record<string, TtsEngine> = { piper, dummy, vieneu, kokoro };
