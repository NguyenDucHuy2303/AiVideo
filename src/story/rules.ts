import type { ParsedStory } from "./parse.ts";
import { plainLetters, type Character, type Shot } from "./shots.ts";

/**
 * Fixed rules that correct what a small model gets wrong in a story design, checked against
 * the narration (Vietnamese, word for word from the script): no people painted into the
 * backgrounds, no invented characters, actions only when the words call for them, and a hero
 * who stays transformed once the story says so. Pure functions, no LLM calls.
 */

/** Someone in the picture: people are drawn as silhouettes, never painted into the scenery. */
const PEOPLE =
  /\b(man|men|woman|women|boy|girl|child|children|kid|baby|infant|person|people|villagers?|crowd|soldiers?|army|troops|warriors?|king|queen|emperor|messengers?|mother|father|parents|couple|family|hero|he|she|his|her|him|they|their|them|horses?|figures?|silhouettes?|giant)\b/i;
/** Painted backgrounds stay short: the style words follow them in the same prompt. */
const BACKGROUND_MAX_WORDS = 32;
/** Less than this is not a setting ("The ground trembles."): borrow a neighbour's instead. */
const BACKGROUND_MIN_WORDS = 6;
/** "Giong village", "Mount Giong", "the village of Giong": a place named after someone. */
const PLACE = new Set(["village", "villages", "mount", "mountain", "hill", "river", "lake", "temple", "shrine", "hamlet", "commune", "district", "land", "region", "valley", "road"]);

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** Letters only, lowercase, for comparing Vietnamese words ("Gióng," ~ "gióng"). */
const tokens = (s: string) => s.normalize("NFC").toLowerCase().match(/\p{L}+/gu) ?? [];

export function hasWords(text: string, phrase: string): boolean {
  const have = new Set(tokens(text));
  const want = tokens(phrase);
  return want.length > 0 && want.every((w) => have.has(w));
}

/** Vietnamese phrase as whole words, so "bay" does not match inside another word. */
export function says(text: string, pattern: string): boolean {
  return new RegExp(`(^|[^\\p{L}])(${pattern})(?=$|[^\\p{L}])`, "iu").test(text.normalize("NFC"));
}

/** A character the story names. The model likes to add a phoenix or a dragon of its own. */
export function namedInStory(c: Character, parsed: ParsedStory): boolean {
  return hasWords(parsed.scenes.map((s) => s.narration).join(" "), c.name);
}

/** Sentences of a model reply; an unfinished last one (cut by the length limit) is dropped. */
function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1 && !/[.!?]$/.test(parts.at(-1)!)) parts.pop();
  return parts;
}

/**
 * Only the scenery of a background description: sentences about people (or naming the cast)
 * are dropped. Undefined when nothing is left, so the caller can reuse a nearby background.
 */
export function cleanBackground(text: string, names: string[]): string | undefined {
  const ascii = plainLetters(text).replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  const nameWords = names.flatMap((n) => tokens(plainLetters(n))).filter((w) => w.length > 2);
  const mentions = (s: string) => {
    if (PEOPLE.test(s)) return true;
    const t = tokens(s);
    return t.some((w, i) => nameWords.includes(w) && !PLACE.has(t[i + 1] ?? "") && !PLACE.has(t[i - 1] ?? "") && !(t[i - 1] === "of" && PLACE.has(t[i - 2] ?? "")));
  };
  const kept: string[] = [];
  for (const s of sentences(ascii)) {
    if (mentions(s)) continue;
    if (kept.length && words([...kept, s].join(" ")) > BACKGROUND_MAX_WORDS) break;
    kept.push(s);
  }
  const out = kept.join(" ").replace(/[.\s]+$/, "");
  return words(out) >= BACKGROUND_MIN_WORDS ? out : undefined;
}

/** A silhouette description, without the unfinished clause a length limit leaves behind. */
export function cleanSilhouette(text: string): string {
  const t = plainLetters(text).replace(/\s+/g, " ").trim();
  if (/[.!?]$/.test(t)) return t.replace(/[.]+$/, "");
  const cut = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  return (cut > 20 ? t.slice(0, cut) : t).trim();
}

/** Scenes where someone turns into something else ("trở thành một tráng sĩ"). */
export function transformationScenes(parsed: ParsedStory): number[] {
  return parsed.scenes.flatMap((s, i) => (says(s.narration, "trở thành|biến thành|hóa thành|hoá thành|biến ra|hóa ra|hoá ra") ? [i] : []));
}

export interface FormChange {
  /** Scene where the change happens. */
  scene: number;
  from: string;
  to: string;
}

const GROWS = "lớn|lớn nhanh|lớn bổng|vươn vai|khổng lồ|trở thành|biến thành|hóa thành|hoá thành";
const FLIES = "bay";
/** "bay thẳng lên trời", "bay về trời": the scene ends with someone leaving into the sky. */
const FLIES_AWAY = /(^|[^\p{L}])bay(?=[^\p{L}])[^.!?]*(lên|trời|mây)/iu;

/**
 * Make the shots agree with the words:
 * - fly_up only where someone flies, grow only where someone grows or transforms;
 * - a scene that ends with someone flying away shows them (the character the scene names);
 * - from a form change on, the new form replaces the old one, starting with a grow.
 */
export function applyStoryRules(parsed: ParsedStory, cast: Character[], shots: Shot[], changes: FormChange[]): Shot[] {
  const ids = new Set(cast.map((c) => c.id));
  // Base characters only: a form is found through the character it came from.
  const forms = new Set(changes.map((c) => c.to));
  const named = (narration: string) => cast.filter((c) => !forms.has(c.id) && hasWords(narration, c.name)).map((c) => c.id);
  const sorted = [...changes].sort((a, b) => a.scene - b.scene);
  const current = (id: string, scene: number) => sorted.reduce((who, ch) => (ch.scene <= scene && ch.from === who ? ch.to : who), id);

  return shots.map((shot, i) => {
    const narration = parsed.scenes[i]!.narration;
    let { actor, action } = shot;
    if (!ids.has(actor)) actor = "none";
    if (action === "fly_up" && !says(narration, FLIES)) action = "appear";
    if (action === "grow" && !says(narration, GROWS)) action = "appear";
    if (FLIES_AWAY.test(narration.normalize("NFC"))) {
      const who = named(narration)[0];
      if (who || actor !== "none") {
        actor = who ?? actor;
        action = "fly_up";
      }
    }
    if (actor !== "none") actor = current(actor, i);
    const change = sorted.find((c) => c.scene === i);
    if (change && (actor === "none" || actor === change.from || actor === change.to)) {
      actor = change.to;
      action = "grow";
    }
    return { ...shot, actor, action };
  });
}

/** Backgrounds that lost everything to cleanBackground borrow the closest one in the chapter. */
export function fillBackgrounds(parsed: ParsedStory, cleaned: (string | undefined)[], fallback: string): string[] {
  return cleaned.map((bg, i) => {
    if (bg) return bg;
    const ch = parsed.scenes[i]!.chapter;
    for (let d = 1; d < cleaned.length; d++) {
      for (const j of [i - d, i + d]) {
        if (cleaned[j] && parsed.scenes[j]!.chapter === ch) return cleaned[j]!;
      }
    }
    return cleaned.find(Boolean) ?? fallback;
  });
}
