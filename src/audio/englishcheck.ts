/**
 * The English check: every English recording of a film (the words a character says in English,
 * narrate.ts marks them with a file.en.txt beside the .wav) is heard by Whisper in English and
 * compared word by word with what was meant. English is what the children learn: a word read
 * wrong must never reach a video (the user, 16/11/2026). No brain, no tokens; a minute or so.
 *
 *   node src/audio/englishcheck.ts projects/<name>
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../config.ts";
import { run } from "../utils/process.ts";
import { errorRate } from "./voicecheck.ts";

const PY = path.join(ROOT, "vendor", "whisper", "venv", "bin", "python");
const WORKER = path.join(ROOT, "src", "tts", "asr_worker.py");

const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
/** The sounds children's English writes that a dictionary does not have. */
const SOUNDS = new Set(["meow", "woof", "boing", "shh", "oops", "yay", "wow", "uh", "oh", "ah", "ha", "hehe", "hihi", "moo", "quack", "oink", "baa", "neigh", "tweet", "ribbit", "hop", "hooray", "bye", "okay", "ok", "hmm", "yum", "yummy", "brr", "achoo", "zzz", "whoosh", "splash", "bang", "pop", "ding", "dong"]);
/** The four's Vietnamese names: Whisper cannot write them ("Hùng" heard as "whom"), so they are not judged. */
const NAMES = /\b(huy|hùng|hung|bối|boi|beo|mai)\b/giu;
/** How many names and sound words ("boing", "meow") a line has: left out of the judging. */
export function loose(text: string): number {
  const raw = text.normalize("NFC").toLowerCase().replace(/[’‘]/g, "'").split(/[^a-zà-ỹđ']+/u).filter(Boolean);
  return raw.filter((w) => NAMES_SET.has(w) || NOISES.has(w)).length;
}
/** Animal and cartoon noises: no right way to write them ("boing", "bawing"), so not judged. */
const NOISES = new Set(["meow", "woof", "boing", "shh", "moo", "quack", "oink", "baa", "neigh", "tweet", "ribbit", "hehe", "hihi", "achoo", "zzz", "whoosh", "brr", "hmm", "uh", "ah", "ha", "yum", "splash", "bang", "ding", "dong"]);
const NAMES_SET = new Set(["huy", "hùng", "hung", "bối", "boi", "beo", "mai"]);
/** Lower case words, no punctuation, small numbers in words, "I'm" = "I am" (the four's names and sound words left out). */
export function englishWords(text: string): string[] {
  return text.normalize("NFC").toLowerCase().replace(NAMES, " ").replace(/[’‘]/g, "'")
    .replace(/\b(i|you|we|they|he|she|it|that|what|let)'(m|re|s|ve|ll|d)\b/g, (_, a, b) => `${a} ${({ m: "am", re: "are", s: "is", ve: "have", ll: "will", d: "would" } as Record<string, string>)[b]}`)
    .replace(/\blet is\b/g, "let us").replace(/\d+/g, (n) => NUM[Number(n)] ?? n)
    .replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean)
    // (a plural "s" Whisper adds or drops on a word said alone is not a word read wrong)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => !NOISES.has(w));
}

export interface EnglishCheck { file: string; meant: string; heard: string; rate: number; who?: string }
/**
 * A recording is wrong past this share of its sounds (compared as IPA phonemes, so "sun" heard as
 * "son" is right and "cat" heard as "cut" is wrong): one sound off in a short word is a mistake,
 * Whisper's odd slip in a long sentence is not.
 */
export const BAD = 0.15;

const IPA = path.join(ROOT, "src", "tts", "ipa.py"), KPY = path.join(ROOT, "vendor", "kokoro", "venv", "bin", "python");
/** English texts as IPA phonemes (espeak-ng); undefined when the phonemizer is missing. */
export async function phonemes(texts: string[]): Promise<string[] | undefined> {
  try {
    const r = await run(KPY, [IPA], { input: JSON.stringify(texts), timeoutMs: 5 * 60_000 });
    return JSON.parse(r.stdout.trim().split("\n").at(-1)!);
  } catch { return undefined; }
}
/** Edit distance between two phoneme strings (spaces ignored), as a share of the meant one. */
export function soundRate(meant: string, heard: string): number {
  return errorRate([...meant.replace(/\s+/g, "")], [...heard.replace(/\s+/g, "")]);
}

const SMALL = new Set(["a", "an", "the", "is", "am", "are", "i", "it", "to", "of", "and", "in", "on", "you", "me", "my", "we", "us", "be", "do"]);
/**
 * Words that must each be heard exactly (by sound): the lesson's taught words anywhere, and
 * every word of a short line (four words or fewer: "Cat!", "I am a cat!"), small words aside.
 */
export function keyTokens(meant: string, taught: string[]): string[] {
  const words = englishWords(meant), teach = new Set(taught.flatMap((t) => englishWords(t)));
  return words.filter((w) => !SMALL.has(w) && (teach.has(w) || words.length <= 4));
}

/** How far each heard line is from what was meant (0 right … 1 wrong), as sounds; taught words and short lines exactly. */
export async function judge(lines: { meant: string; heard: string }[], taught: string[] = []): Promise<number[]> {
  // compared as sounds (the words normalised first: numbers, contractions, a plural "s")
  const ipa = await phonemes([...lines.map((it) => englishWords(it.meant).join(" ") || "x"), ...lines.map((l) => englishWords(l.heard).join(" ") || "x")]);
  // the key words, each as sounds
  const keys = lines.map((it) => keyTokens(it.meant, taught)), heardTokens = lines.map((l) => englishWords(l.heard));
  const uniq = [...new Set([...keys.flat(), ...heardTokens.flat()])];
  const tipa = uniq.length ? await phonemes(uniq) : [];
  const soundOf = new Map(uniq.map((w, i) => [w, tipa?.[i] ?? w]));
  // the heard lines with one (or two) words left out, where a name or a noise was meant: as whole phrases
  const variants = lines.map((it) => {
    const n = loose(it.meant), hw = englishWords(it.heard), out: string[] = [];
    if (!n) return out;
    for (let a = 0; a < hw.length; a++) out.push(hw.filter((_, i) => i !== a).join(" ") || "x");
    if (n > 1) for (let a = 0; a < hw.length; a++) for (let b = a + 1; b < hw.length; b++) out.push(hw.filter((_, i) => i !== a && i !== b).join(" ") || "x");
    return out;
  });
  const vflat = variants.flat(), vipa = vflat.length ? await phonemes(vflat) : [];
  let vi = 0;
  const vsounds = variants.map((v) => v.map(() => vipa?.[vi++] ?? ""));
  return lines.map((it, k) => {
    const h = it.heard, words = errorRate(englishWords(it.meant), englishWords(h));
    let rate = ipa ? soundRate(ipa[k]!, ipa[lines.length + k]!) : words;
    // A name or a sound word left out of what was meant ("Bye bye, Hùng!", "Boing!") is still
    // heard as something ("hoong", "bawing"): the heard words are compared with one or two of
    // them left out too, the closest taken.
    if (ipa) for (const v of vsounds[k]!) if (v) rate = Math.min(rate, soundRate(ipa[k]!, v));
    const heardSounds = new Set(heardTokens[k]!.map((w) => soundOf.get(w)));
    if (keys[k]!.some((w) => !heardSounds.has(soundOf.get(w)))) rate = Math.max(rate, 1);
    return Math.round(rate * 100) / 100;
  });
}

export async function checkEnglish(projectDir: string, log: (s: string) => void = () => {}): Promise<{ checked: EnglishCheck[]; bad: EnglishCheck[] }> {
  // the lesson's taught words (project.json "words", episodes): heard exactly, wherever they are said
  const taught: string[] = await fs.readFile(path.join(path.resolve(projectDir), "project.json"), "utf8").then((t) => JSON.parse(t).words ?? []).catch(() => []);
  const tts = path.join(path.resolve(projectDir), "gen", "tts");
  const sides = (await fs.readdir(tts).catch(() => [] as string[])).filter((f) => f.endsWith(".wav.en.json") || f.endsWith(".wav.en.txt"));
  const items = await Promise.all(sides.map(async (f, i) => {
    const raw = (await fs.readFile(path.join(tts, f), "utf8")).trim(), side = f.endsWith(".json") ? JSON.parse(raw) as { text: string; who?: string } : { text: raw };
    return { id: String(i), wav: path.join(tts, f.replace(/\.en\.(json|txt)$/, "")), meant: side.text, who: side.who };
  }));
  if (!items.length) return { checked: [], bad: [] };
  const r = await run(PY, [WORKER, "en"], {
    input: JSON.stringify(items.map(({ id, wav }) => ({ id, wav }))),
    env: { ...process.env, WATA_ASR_HOME: path.join(ROOT, "vendor", "whisper", "hf") },
    timeoutMs: 30 * 60_000, onStdout: (c: string) => log(c.trimEnd()),
  });
  const heard = new Map<string, string>();
  for (const line of r.stdout.split("\n").filter(Boolean)) { try { const o = JSON.parse(line); heard.set(o.id, o.text); } catch { /* not a result */ } }
  const said = items.map((it) => heard.get(it.id) ?? "");
  const rates = await judge(items.map((it, k) => ({ meant: it.meant, heard: said[k]! })), taught);
  const checked = items.map((it, k) => ({ file: it.wav, meant: it.meant, heard: said[k]!, who: it.who, rate: rates[k]! }));
  return { checked, bad: checked.filter((c) => c.rate > BAD) };
}

let DICT: Set<string> | undefined;
/** Words of an English text not in the dictionary (/usr/share/dict, American and British), nor a children's sound. */
export async function misspelled(text: string, names: string[] = []): Promise<string[]> {
  if (!DICT) {
    DICT = new Set();
    for (const f of ["/usr/share/dict/american-english", "/usr/share/dict/british-english"]) {
      try { for (const w of (await fs.readFile(f, "utf8")).split("\n")) DICT.add(w.trim().toLowerCase()); } catch { /* not installed */ }
    }
  }
  if (DICT.size < 1000) return []; // (no dictionary on this machine: the brain's check still runs)
  const own = new Set(names.map((n) => n.toLowerCase()));
  const out: string[] = [];
  for (const raw of text.replace(/[’‘]/g, "'").split(/[^A-Za-z']+/)) {
    const w = raw.replace(/^'+|'+$/g, "").toLowerCase();
    if (!w || own.has(w) || SOUNDS.has(w) || /^(.)\1*$/.test(w)) continue;
    const base = w.replace(/'(s|m|re|ve|ll|d|t)$/, "").replace(/n$/, (m) => (w.endsWith("n't") ? "" : m));
    if (DICT.has(w) || DICT.has(base) || DICT.has(w.replace(/'s$/, ""))) continue;
    if (w.endsWith("n't") && DICT.has(w)) continue;
    out.push(raw);
  }
  return [...new Set(out)];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node src/audio/englishcheck.ts projects/<name>"); process.exit(2); }
  const { checked, bad } = await checkEnglish(dir);
  for (const c of checked) console.log(`${c.rate > BAD ? "✘" : "✔"} ${c.meant}  →  nghe ra: ${c.heard}`);
  console.log(`${checked.length} câu tiếng Anh, ${bad.length} câu đọc sai`);
  process.exit(bad.length ? 1 : 0);
}
