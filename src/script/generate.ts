import { Storyboard, StoryboardGraphic } from "../storyboard/schema.ts";
import { readInteger } from "../tts/normalize-vi.ts";
import { llmSchema, repairPrompt, systemPrompt, userPrompt, WORDS_PER_SECOND, type ScriptRequest } from "./prompt.ts";
import type { ChatMessage, LlmProvider } from "./providers.ts";

export interface GenerateResult {
  storyboard: Storyboard;
  warnings: string[];
  attempts: number;
  /** Full conversation, for the log. */
  transcript: ChatMessage[];
}

export class ScriptError extends Error {
  readonly transcript: ChatMessage[];
  constructor(message: string, transcript: ChatMessage[]) {
    super(message);
    this.transcript = transcript;
  }
}

/** Pull the JSON object out of a reply that may be wrapped in ``` fences or chatter. */
export function extractJson(reply: string): unknown {
  const text = reply.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("the reply contains no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

const VIETNAMESE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const syllables = (text: string) => text.toLocaleLowerCase("vi").match(/[\p{L}\p{N}]+/gu) ?? [];

/** Share of `text`'s syllables that also occur in `other`. */
function overlap(text: string, other: string): number {
  const words = syllables(text);
  if (!words.length) return 0;
  const pool = new Set(syllables(other));
  return words.filter((w) => pool.has(w)).length / words.length;
}

const isUpper = (w: string) => w[0] !== w[0]!.toLocaleLowerCase("vi");

/**
 * "Vì Sao Ta Cần Ngủ", "Thiếu Ngủ" — every word capitalized, which reads as translated
 * English. Two-word names ("Hà Nội") survive the fix when the narration capitalizes them.
 */
export function isTitleCase(text: string): boolean {
  const words = text.match(/\p{L}+/gu) ?? [];
  return words.length >= 2 && words.every(isUpper);
}

/** Words written capitalized in the middle of a narration sentence: proper names to keep. */
function properNames(texts: string[]): Set<string> {
  const names = new Set<string>();
  for (const text of texts) {
    for (const sentence of text.split(/[.!?…]+/)) {
      (sentence.match(/\p{L}+/gu) ?? []).slice(1).forEach((w) => isUpper(w) && names.add(w));
    }
  }
  return names;
}

/** "Tại Sao Ta Cần Ngủ Ở Việt Nam" → "Tại sao ta cần ngủ ở Việt Nam" (names and acronyms kept). */
export function sentenceCase(text: string, keep: Set<string>): string {
  let first = true;
  // Digits count as the first word too: "7-9 Tiếng Mỗi Đêm" → "7-9 tiếng mỗi đêm".
  return text.replace(/[\p{L}\p{N}]+/gu, (w) => {
    const isFirst = first;
    first = false;
    if (isFirst || keep.has(w) || (w.length > 1 && w === w.toLocaleUpperCase("vi"))) return w;
    return w.toLocaleLowerCase("vi");
  });
}

/**
 * "none" and empty strings mean nothing to draw; anything else keeps its shape for the
 * builder (and the lint) to check. Text gets the same capitalization fix as titles.
 */
function tidyGraphic(raw: unknown, fix: (text: string, where: string) => string): unknown {
  if (!raw || typeof raw !== "object" || (raw as { type?: unknown }).type === "none") return undefined;
  const walk = (v: unknown, where: string): unknown => {
    if (typeof v === "string") return v.trim() ? fix(v.trim(), where) : undefined;
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${where}[${i}]`)).filter((x) => x !== undefined);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, k === "type" || k === "icon" || k === "tone" ? x : walk(x, `${where}.${k}`)])
          .filter(([, x]) => x !== undefined),
      );
    }
    return v;
  };
  return walk(raw, "");
}

/** Digit groups of a number as written ("7–9" → 7, 9; "1.500" → 1500). */
const numbersIn = (text: string) => (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/\.(?=\d{3}\b)/g, ""));

/** True when every number of a graphic is said in the narration, as digits or as words. */
export function numbersSpoken(value: string, narration: string): boolean {
  const said = new Set(numbersIn(narration));
  const lower = narration.toLocaleLowerCase("vi");
  return numbersIn(value).every((n) => said.has(n) || (/^\d+$/.test(n) && lower.includes(readInteger(n))));
}

/**
 * Deterministic cleanup of the model's output, so small-model quirks don't need a slow repair
 * round: empty strings mean "no value", kickers are uppercased by code (models mix cases), and
 * a body that only repeats the narration is dropped because it clutters the screen.
 */
export function tidyStoryboard(sb: Storyboard): { storyboard: Storyboard; notes: string[] } {
  const notes: string[] = [];
  const names = properNames(sb.scenes.map((s) => s.narration));
  const fixCase = (text: string, where: string) => {
    if (!isTitleCase(text)) return text;
    const fixed = sentenceCase(text, names);
    if (fixed !== text) notes.push(`${where}: Title Case changed to "${fixed}"`);
    return fixed;
  };
  const clean = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => !(typeof v === "string" && v.trim() === ""))) as T;
  const scenes = sb.scenes.map((s, i) => {
    const onScreen = clean({ ...s.onScreen });
    if (onScreen.kicker) onScreen.kicker = onScreen.kicker.trim().toLocaleUpperCase("vi");
    if (onScreen.title) onScreen.title = fixCase(onScreen.title.trim(), `scenes[${i}].onScreen.title`);
    if (onScreen.body && overlap(onScreen.body, `${s.narration} ${onScreen.title ?? ""}`) >= 0.7) {
      notes.push(`scenes[${i}].onScreen.body repeated the narration and was removed`);
      delete onScreen.body;
    }
    const graphic = tidyGraphic(s.graphic, (text, where) => fixCase(text, `scenes[${i}].graphic${where}`));
    return clean({ ...s, onScreen, visual: clean(s.visual), graphic });
  });
  return { storyboard: { title: fixCase(sb.title.trim(), "title"), scenes }, notes };
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Checks the schema can't express. Errors are sent back to the model; warnings are only
 * reported. `length` problems are sent back too, but a storyboard that only has those is
 * still usable: small models can't count words, so we ask, and accept the closest try.
 */
export function lintStoryboard(sb: Storyboard, req: ScriptRequest): { errors: string[]; warnings: string[]; length: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (Math.abs(sb.scenes.length - req.scenes) > 2) {
    errors.push(`there are ${sb.scenes.length} scenes; write ${req.scenes} scenes`);
  }
  if (!VIETNAMESE.test(sb.title)) errors.push("`title` must be in Vietnamese with diacritics");
  const titles = [sb.title, ...sb.scenes.map((s) => s.onScreen.title ?? "")];
  if (titles.filter(isTitleCase).length) warnings.push("some titles use Title Case; Vietnamese normally capitalizes only the first word");
  sb.scenes.forEach((s, i) => {
    if (!VIETNAMESE.test(s.narration)) errors.push(`scenes[${i}].narration must be in Vietnamese with diacritics`);
    if (s.onScreen.title && s.onScreen.title.trim() === s.narration.trim()) {
      errors.push(`scenes[${i}].onScreen.title repeats the narration; write a short headline instead`);
    }
    if (s.graphic !== undefined) {
      const g = StoryboardGraphic.safeParse(s.graphic);
      if (!g.success) {
        errors.push(...g.error.issues.map((e) => `scenes[${i}].graphic.${e.path.join(".")}: ${e.message}`));
      } else if (g.data.type === "big_number" && !numbersSpoken(g.data.value, s.narration)) {
        errors.push(`scenes[${i}].graphic.value "${g.data.value}" is not said in the narration; use a number the narration states, or another graphic`);
      }
    }
    if (/[\p{Extended_Pictographic}]/u.test(s.narration)) warnings.push(`scenes[${i}].narration contains emoji (they will be removed)`);
  });

  const length: string[] = [];
  const words = sb.scenes.reduce((n, s) => n + wordCount(s.narration), 0);
  const target = req.durationSec * WORDS_PER_SECOND;
  if (words < target * 0.8 || words > target * 1.2) {
    const perScene = Math.round(target / sb.scenes.length);
    length.push(`the narration has ${words} words in total; it must have about ${Math.round(target)} so the video lasts ${req.durationSec} seconds`);
    sb.scenes.forEach((s, i) => {
      const n = wordCount(s.narration);
      if (Math.abs(n - perScene) > perScene * 0.25) {
        length.push(`scenes[${i}].narration has ${n} words; ${n > perScene ? "shorten" : "lengthen"} it to about ${perScene} words`);
      }
    });
  }
  return { errors, warnings, length };
}

/** Seconds of narration a storyboard will produce, roughly. */
export const estimateSeconds = (sb: Storyboard) => Math.round(sb.scenes.reduce((n, s) => n + wordCount(s.narration), 0) / WORDS_PER_SECOND);

/**
 * Ask the model for a storyboard, validate it, and send concrete problems back until it is
 * valid or attempts run out. The model's output is only ever data: it is parsed and checked,
 * never executed.
 */
export async function generateStoryboard(
  req: ScriptRequest,
  provider: LlmProvider,
  opts: { maxAttempts?: number; temperature?: number; onProgress?: (chars: number, attempt: number) => void } = {},
): Promise<GenerateResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const schema = llmSchema(req);
  const transcript: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: userPrompt(req) },
  ];

  // Best storyboard so far whose only problem is its length.
  let closest: (GenerateResult & { off: number }) | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await provider.chat({
      messages: transcript,
      schema,
      // Repairs should change only what is wrong, so cool down after the first try.
      temperature: attempt === 1 ? (opts.temperature ?? 0.7) : 0.3,
      onProgress: (chars) => opts.onProgress?.(chars, attempt),
    });
    transcript.push({ role: "assistant", content: reply });

    let problems: string[];
    try {
      const parsed = Storyboard.safeParse(extractJson(reply));
      if (!parsed.success) {
        problems = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      } else {
        const { storyboard, notes } = tidyStoryboard(parsed.data);
        const { errors, warnings, length } = lintStoryboard(storyboard, req);
        const result = { storyboard, warnings: [...notes, ...warnings], attempts: attempt, transcript };
        if (!errors.length && !length.length) return result;
        if (!errors.length) {
          const off = Math.abs(estimateSeconds(storyboard) - req.durationSec);
          if (!closest || off < closest.off) closest = { ...result, off };
        }
        problems = [...errors, ...length];
      }
    } catch (err) {
      problems = [`the reply is not valid JSON (${(err as Error).message})`];
    }
    transcript.push({ role: "user", content: repairPrompt(problems) });
  }

  if (closest) {
    const { off: _, ...result } = closest;
    result.warnings.push(`the model missed the target length; the video will be ~${estimateSeconds(result.storyboard)}s instead of ${req.durationSec}s (edit the narration to adjust)`);
    return { ...result, attempts: maxAttempts, transcript };
  }
  const last = transcript.at(-1)!.content;
  throw new ScriptError(`the model did not produce a valid storyboard in ${maxAttempts} attempts. Last problems:\n${last}`, transcript);
}
