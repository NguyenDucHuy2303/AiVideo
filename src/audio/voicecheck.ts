/**
 * The voice check: Whisper listens to every scene's narration (src/tts/asr_worker.py) and the
 * words it hears are compared with the script, syllable by syllable (Vietnamese words are
 * syllables). A scene whose voice says something else (a word mispronounced, skipped, made up,
 * a garbled stretch) has a high error rate and is listed. No brain, no tokens: the CPU, about
 * a minute or two a film.
 *
 *   node src/audio/voicecheck.ts projects/<name> [--lang en]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../config.ts";
import { run } from "../utils/process.ts";

const PY = path.join(ROOT, "vendor", "whisper", "venv", "bin", "python");
const WORKER = path.join(ROOT, "src", "tts", "asr_worker.py");

/** Lower case, no punctuation, syllables (or English words); numbers in Vietnamese words. */
export function syllables(text: string, lang = "vi"): string[] {
  const t = text.normalize("NFC").toLowerCase().replace(/[“”"'‘’.,!?;:()…\-–—]/g, " ");
  return (lang === "vi" ? t.replace(/\d+/g, (n) => ` ${viNumber(Number(n))} `) : t).split(/\s+/).filter(Boolean);
}

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
/** 0–999 999 in words, as a narrator reads them ("18" → "mười tám", "100" → "một trăm"). */
export function viNumber(n: number): string {
  if (!Number.isFinite(n) || n >= 1_000_000) return String(n);
  if (n >= 1000) { const k = Math.floor(n / 1000), r = n % 1000; return `${viNumber(k)} nghìn${r ? (r < 100 ? " không trăm " : " ") + viNumber(r) : ""}`; }
  if (n >= 100) { const h = Math.floor(n / 100), r = n % 100; return `${DIGITS[h]} trăm${r ? (r < 10 ? " linh " + DIGITS[r] : " " + viNumber(r)) : ""}`; }
  if (n >= 10) { const t = Math.floor(n / 10), u = n % 10; return `${t === 1 ? "mười" : DIGITS[t] + " mươi"}${u ? " " + (u === 5 ? "lăm" : u === 1 && t > 1 ? "mốt" : u === 4 && t > 1 ? "tư" : DIGITS[u]) : ""}`; }
  return DIGITS[n]!;
}

/**
 * The sound of a syllable in the northern voice: r, d and gi are one sound, as are s and x, tr
 * and ch. What Whisper writes for them is a guess, not a mistake of the voice.
 */
export function heardAs(syl: string): string {
  return syl.replace(/^gi(?=\S)/, "d").replace(/^r/, "d").replace(/^s/, "x").replace(/^tr/, "ch");
}

/** Edit distance between two lists, and the share of the expected one it amounts to. */
export function errorRate(expected: string[], heard: string[]): number {
  if (!expected.length) return heard.length ? 1 : 0;
  let prev = Array.from({ length: heard.length + 1 }, (_, j) => j);
  for (let i = 1; i <= expected.length; i++) {
    const cur = [i];
    for (let j = 1; j <= heard.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (expected[i - 1] === heard[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[heard.length]! / expected.length;
}

export interface SceneVoice { id: string; expected: string; heard: string; rate: number }
export interface VoiceReport { film: string; scenes: SceneVoice[]; rate: number; bad: string[]; seconds: number }

/** The share of a scene's syllables the voice got wrong (northern homophones are not wrong). */
export function sceneRate(expected: string, heard: string, lang = "vi"): number {
  const fold = (t: string) => syllables(t, lang).map((x) => (lang === "vi" ? heardAs(x) : x));
  return Math.round(errorRate(fold(expected), fold(heard)) * 1000) / 1000;
}

/** A scene sounds wrong past this share of syllables (Whisper itself misses a few). */
export const BAD = 0.15;

export async function checkVoice(projectDir: string, lang = "vi", log: (s: string) => void = () => {}): Promise<VoiceReport> {
  const dir = path.resolve(projectDir);
  const timeline = JSON.parse(await fs.readFile(path.join(dir, "timeline.json"), "utf8"));
  const items = timeline.scenes.map((s: { id: string; audio: { src: string }; captionCues?: { text: string }[] }) => ({ id: s.id, wav: path.join(dir, s.audio.src), expected: (s.captionCues ?? []).map((c) => c.text).join(" ") }));
  const t0 = Date.now();
  const heard = new Map<string, string>();
  const r = await run(PY, [WORKER, lang], {
    input: JSON.stringify(items.map(({ id, wav }: { id: string; wav: string }) => ({ id, wav }))),
    env: { ...process.env, WATA_ASR_HOME: path.join(ROOT, "vendor", "whisper", "hf") },
    timeoutMs: 60 * 60_000,
    onStdout: (chunk: string) => log(chunk.trimEnd()),
  });
  for (const line of r.stdout.split("\n").filter(Boolean)) { try { const o = JSON.parse(line); heard.set(o.id, o.text); } catch { /* not a result */ } }
  const scenes: SceneVoice[] = items.map((it: { id: string; expected: string }) => ({ id: it.id, expected: it.expected, heard: heard.get(it.id) ?? "", rate: sceneRate(it.expected, heard.get(it.id) ?? "", lang) }));
  const total = scenes.reduce((n, s) => n + syllables(s.expected, lang).length, 0);
  const errs = scenes.reduce((n, s) => n + s.rate * syllables(s.expected, lang).length, 0);
  const report = { film: path.basename(dir), scenes, rate: Math.round((errs / Math.max(1, total)) * 1000) / 1000, bad: scenes.filter((s) => s.rate > BAD).map((s) => s.id), seconds: Math.round((Date.now() - t0) / 1000) };
  await fs.mkdir(path.join(dir, "build"), { recursive: true });
  await fs.writeFile(path.join(dir, "build", "voicecheck.json"), JSON.stringify(report, null, 2));
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2), dir = args.find((a) => !a.startsWith("--"));
  if (!dir) { console.error("usage: node src/audio/voicecheck.ts projects/<name> [--lang en]"); process.exit(2); }
  const r = await checkVoice(dir, args.includes("--lang") ? args[args.indexOf("--lang") + 1] : "vi", (s) => console.log(s));
  console.log(`${r.film}: ${(r.rate * 100).toFixed(1)}% âm tiết nghe khác kịch bản, ${r.bad.length} cảnh trên ${BAD * 100}% (${r.seconds} s)`);
  for (const s of r.scenes.filter((x) => x.rate > BAD)) console.log(`  ${s.id} ${(s.rate * 100).toFixed(0)}%\n    kịch bản: ${s.expected}\n    nghe ra : ${s.heard}`);
}
