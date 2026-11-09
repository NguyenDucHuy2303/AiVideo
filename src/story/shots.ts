import { z } from "zod";
import { extractJson } from "../script/generate.ts";
import { MOODS } from "../script/prompt.ts";
import type { ChatMessage, LlmProvider } from "../script/providers.ts";
import { ACTOR_ACTIONS, EFFECT_TYPES } from "../schema/timeline.ts";
import type { ParsedStory } from "./parse.ts";

/**
 * The LLM designs the pictures of a story; it never touches the words. Two small requests
 * instead of one big one: first the cast (so a character looks the same in every scene),
 * then one shot per scene that may only use that cast.
 */

export const TIMES = ["dawn", "day", "dusk", "night"] as const;
/** "Phù Đổng village" → "Phu Dong village": image models read plain letters better, and a
 * place name with diacritics in an English prompt is not an error worth a slow repair round. */
export function plainLetters(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Mostly Vietnamese words (not just a name or two): the model wrote in the wrong language. */
const VIETNAMESE_WORDS = /(^|\s)(của|và|là|những|một|các|trong|với|người|được|không|có)(\s|$)/i;

const Character = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,23}$/),
  name: z.string().min(1).max(40),
  silhouette: z.string().min(10).max(240),
});
export type Character = z.infer<typeof Character>;

export interface Shot {
  background: string;
  time: (typeof TIMES)[number];
  mood: (typeof MOODS)[number];
  actor: string;
  action: (typeof ACTOR_ACTIONS)[number];
  effects: (typeof EFFECT_TYPES)[number][];
}

const SYSTEM = [
  "You are the art director of an animated Vietnamese storytelling video.",
  "Each scene is a painted background (generated from your English description) with animated character silhouettes and effects drawn on top.",
  "Write every description in English. Respect the era and culture of the story: for ancient Vietnam, show thatched stilt houses, rice fields, bamboo groves, bronze-age clothing and weapons, not medieval Europe or China.",
  "Output only the JSON object.",
].join("\n");

function story(parsed: ParsedStory): string {
  return parsed.scenes.map((s, i) => `Scene ${i + 1} [${parsed.chapters[s.chapter] || "-"}]: ${s.narration}`).join("\n");
}

/** Ask for JSON until `check` finds no problems; problems are sent back to the model. */
export async function ask<T>(
  provider: LlmProvider,
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  check: (value: T) => string[],
  onProgress?: (chars: number) => void,
  maxAttempts = 3,
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);
  let problems: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await provider.chat({ messages, schema: jsonSchema, temperature: attempt === 1 ? 0.6 : 0.3, onProgress });
    messages.push({ role: "assistant", content: reply });
    try {
      const parsed = schema.safeParse(extractJson(reply));
      problems = parsed.success ? check(parsed.data) : parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
      if (parsed.success && !problems.length) return parsed.data;
    } catch (err) {
      problems = [`the reply is not valid JSON (${(err as Error).message})`];
    }
    messages.push({ role: "user", content: `Your JSON has problems. Fix all of them and return the complete corrected JSON only:\n${problems.map((p) => `- ${p}`).join("\n")}` });
  }
  throw new Error(`the model did not produce valid JSON in ${maxAttempts} attempts: ${problems.join("; ")}`);
}

export async function designCast(parsed: ParsedStory, provider: LlmProvider, onProgress?: (chars: number) => void): Promise<Character[]> {
  const schema = z.object({ characters: z.array(Character).min(1).max(6) });
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        story(parsed),
        "",
        "List the 2–6 characters, creatures or groups that should appear as animated silhouettes in this story (main hero, important companions, an army…).",
        "If the hero changes form (e.g. a child who becomes a giant warrior), list each form as its own character.",
        "- id: short snake_case id, e.g. \"giong_child\".",
        "- name: the Vietnamese name.",
        "- silhouette: one English sentence (under 25 words) describing the full-body shape as a black silhouette seen from the side, standing or moving: pose, clothing outline, hair, props. No colours, no faces.",
        "  Clothing of the story's era and culture (ancient Vietnam: loose tunics, loincloths, headscarves, topknots, conical hats, bare feet), never modern or Western clothes.",
        "Only characters the story names; do not invent creatures.",
      ].join("\n"),
    },
  ];
  const { characters } = await ask(provider, messages, schema, (v) => {
    const errors: string[] = [];
    const ids = new Set<string>();
    v.characters.forEach((c, i) => {
      if (ids.has(c.id)) errors.push(`characters[${i}].id "${c.id}" is used twice`);
      ids.add(c.id);
      if (VIETNAMESE_WORDS.test(c.silhouette)) errors.push(`characters[${i}].silhouette must be in English`);
    });
    return errors;
  }, onProgress);
  return characters.map((c) => ({ ...c, silhouette: plainLetters(c.silhouette) }));
}

/**
 * The form a character turns into in a scene ("Gióng vươn vai… trở thành một tráng sĩ khổng
 * lồ"). Asked on its own: a small model listing the cast forgets the second form, but answers
 * a question about one sentence well.
 */
export async function designForm(
  parsed: ParsedStory,
  cast: Character[],
  scene: number,
  provider: LlmProvider,
  onProgress?: (chars: number) => void,
): Promise<{ from: string; form: Character }> {
  const ids = cast.map((c) => c.id) as [string, ...string[]];
  const schema = z.object({ from: z.enum(ids), form: Character });
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        story(parsed),
        "",
        `Characters: ${cast.map((c) => `${c.id} (${c.name}): ${c.silhouette}`).join("; ")}.`,
        `In scene ${scene + 1}, a character changes into a new form: "${parsed.scenes[scene]!.narration}"`,
        "- from: the id of the character who changes.",
        "- form: the new form as a new character: a new snake_case id, the Vietnamese name of the new form, and a one-sentence English silhouette (under 25 words) seen from the side, with the clothing, weapons or mount the story gives this form. No colours, no faces.",
      ].join("\n"),
    },
  ];
  return ask(provider, messages, schema, (v) => {
    const errors: string[] = [];
    if (ids.includes(v.form.id)) errors.push(`form.id "${v.form.id}" is already used; choose a new id`);
    if (VIETNAMESE_WORDS.test(v.form.silhouette)) errors.push("form.silhouette must be in English");
    return errors;
  }, onProgress);
}

/**
 * One request per chapter: a small model fixes a short answer far more reliably, and a failed
 * repair only costs that chapter. The whole story is still in every prompt for context.
 */
export async function designShots(
  parsed: ParsedStory,
  cast: Character[],
  provider: LlmProvider,
  onProgress?: (chars: number, chapter: number) => void,
): Promise<Shot[]> {
  const shots: Shot[] = [];
  const chapters = [...new Set(parsed.scenes.map((s) => s.chapter))];
  for (const ch of chapters) {
    const indexes = parsed.scenes.flatMap((s, i) => (s.chapter === ch ? [i] : []));
    shots.push(...(await designChapter(parsed, cast, indexes, provider, (c) => onProgress?.(c, ch))));
  }
  return shots;
}

async function designChapter(parsed: ParsedStory, cast: Character[], indexes: number[], provider: LlmProvider, onProgress?: (chars: number) => void): Promise<Shot[]> {
  const n = indexes.length;
  const actorIds: [string, ...string[]] = ["none", ...cast.map((c) => c.id)];
  const shot = z.object({
    background: z.string().min(20).max(400),
    time: z.enum(TIMES),
    mood: z.enum(MOODS),
    actor: z.enum(actorIds),
    action: z.enum(ACTOR_ACTIONS),
    effects: z.array(z.enum(EFFECT_TYPES)).max(2),
  });
  const schema = z.object({ shots: z.array(shot).min(n).max(n) });
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        story(parsed),
        "",
        `Characters: ${cast.map((c) => `${c.id} (${c.name})`).join(", ")}.`,
        `Design exactly ${n} shots, one for each of scenes ${indexes.map((i) => i + 1).join(", ")}, in order.`,
        "- background: one or two short English sentences (under 30 words) describing the painted setting only: landscape, buildings, sky, light. Never people, animals or the characters: those are the silhouettes. No text.",
        "- time and mood of the scene.",
        "- actor: the one character shown as a silhouette, or \"none\".",
        "- action: how the silhouette moves. appear = fades in; enter_left / enter_right = walks in; grow = becomes huge (transformation); charge = rushes across (battle); rise = comes up from below; fly_up = flies up into the sky.",
        "- effects: 0–2 of embers (fire, battle), dust (march, charge), stars (night, magic), mist (morning, mystery), light_rays (divine, wonder), leaves (wind, nature), rain, flash (sudden event), shake (impact, giant steps).",
        "Vary the backgrounds and actions; keep scenes of the same place consistent.",
      ].join("\n"),
    },
  ];
  const { shots } = await ask(provider, messages, schema, (v) => {
    // Shots are numbered within this chapter; name them by scene for the model.
    const errors: string[] = [];
    v.shots.forEach((s, i) => {
      if (VIETNAMESE_WORDS.test(s.background)) errors.push(`shots[${i}] (scene ${indexes[i]! + 1}): background must be in English`);
    });
    return errors;
  }, onProgress);
  return (shots as Shot[]).map((s) => ({ ...s, background: plainLetters(s.background) }));
}
