/**
 * Story → scene plans, with a small local LLM choosing only from the runtime's menus
 * (sets, motions, faces, effects…), and fixed rules that check its choices against the
 * Vietnamese narration (the words are the truth: "bay" means flying, "nằm ngửa" lying down).
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ChatMessage, LlmProvider } from "../../script/providers.ts";
import { hasWords, says, transformationScenes } from "../../story/rules.ts";
import type { ParsedStory } from "../../story/parse.ts";
import { ask } from "../../story/shots.ts";
import { EFFECTS, ENTRIES, FACES, MOODS, MOTIONS, OBJECTS, PLACES, SETS, SHOTS, TIMES, type CastMember, type Motion, type ScenePlan } from "./scene.ts";

const SYSTEM = [
  "You are the director of a 2D cartoon for children that tells a Vietnamese folk tale.",
  "You only choose from the menus given (JSON enums); the animation library does the drawing.",
  "Respect the era: ancient Vietnam (Văn Lang), villages of stilt houses, rice fields, bamboo.",
  "Output only the JSON object.",
].join("\n");

const COLORS: Record<string, string> = { brown: "#8a5a2a", orange: "#c06a2c", red: "#a8322a", yellow: "#c9902a", green: "#4f6a3a", teal: "#2f6a5a", blue: "#3a5a8a", white: "#efe4cc", black: "#2e2420", purple: "#6a3a6a" };
const LookPlan = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,23}$/),
  name: z.string().min(1).max(40),
  kind: z.enum(["human", "horse"]),
  body: z.enum(["child", "man", "strong", "woman", "elder"]),
  outfit: z.enum(["tunic", "robe", "armor", "dress", "loincloth", "enemy"]),
  color: z.enum(Object.keys(COLORS) as [string, ...string[]]),
  hair: z.enum(["traidao", "bun", "long", "short", "turban", "bald"]),
  headwear: z.enum(["none", "nonla", "helmet", "feather", "enemy_helmet", "crown"]),
  beard: z.boolean(),
  cape: z.boolean(),
  prop: z.enum(["none", "iron_whip", "bamboo", "spear", "sword", "scroll", "stick", "basket", "bowl"]),
  size: z.enum(["small", "normal", "giant"]),
  group: z.boolean(),
  formOf: z.string(),
});
type LookPlan = z.infer<typeof LookPlan>;

function story(parsed: ParsedStory): string {
  return parsed.scenes.map((s, i) => `Scene ${i + 1} [${parsed.chapters[s.chapter] || "-"}]: ${s.narration}`).join("\n");
}

/** The library look of a planned character. */
function toCast(p: LookPlan): CastMember {
  const scale = p.size === "giant" ? 2.4 : p.size === "small" ? 0.8 : 1;
  if (p.kind === "horse") return { id: p.id, name: p.name, kind: "horse", scale, look: { kind: /sắt|iron/i.test(p.name) ? "iron" : "plain" } };
  const look: Record<string, unknown> = {
    body: p.body, outfit: { type: p.outfit, color: COLORS[p.color], ...(p.outfit === "dress" ? { skirt: "#2e2420" } : {}) },
    hair: { style: p.hair, color: p.body === "elder" ? "#8a8478" : "#2a1a12" },
    ...(p.headwear !== "none" ? { headwear: p.headwear } : {}), ...(p.beard ? { beard: p.body === "elder" ? "#ece8e0" : "#2a1a12" } : {}),
    ...(p.cape ? { cape: true } : {}), ...(p.prop !== "none" ? { prop: { type: p.prop, hand: p.prop === "scroll" ? "back" : "front" } } : {}),
  };
  if (p.prop === "iron_whip") look.props = [{ type: "broken_whip" }, { type: "bamboo" }];
  if (p.prop === "bowl" || p.prop === "basket") { look.props = [{ type: p.prop }]; delete look.prop; }
  return { id: p.id, name: p.name, kind: "human", scale, ...(p.group ? { group: true } : {}), ...(p.formOf && p.formOf !== "none" ? { formOf: p.formOf } : {}), look };
}

export async function designCartoonCast(parsed: ParsedStory, provider: LlmProvider, onProgress?: (n: number) => void): Promise<CastMember[]> {
  const schema = z.object({ characters: z.array(LookPlan).min(1).max(10) });
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        story(parsed), "",
        "List the characters to draw (2–10), each from the menus:",
        "- id: snake_case; name: the Vietnamese name used in the story.",
        "- kind: human or horse. body: child / man / strong (a warrior) / woman / elder.",
        "- outfit: tunic (peasant), robe (king, messenger), armor (warrior), dress (woman), loincloth (Văn Lang soldier), enemy (invaders).",
        "- color, hair, headwear (nonla = conical hat, feather = the Hùng kings' feather crown), beard, cape, prop.",
        "- size: small (a baby), normal, giant (a giant and the giant's horse). group: true for an army or villagers (drawn as a crowd).",
        "- formOf: if this character is another form of an earlier one (a boy who becomes a giant warrior), that character's id; otherwise \"none\".",
        "Only characters the story names; ancient Vietnamese clothing, never modern.",
      ].join("\n"),
    },
  ];
  const { characters } = await ask(provider, messages, schema, (v) => {
    const ids = new Set<string>(), errors: string[] = [];
    v.characters.forEach((c, i) => {
      if (ids.has(c.id)) errors.push(`characters[${i}].id "${c.id}" is used twice`);
      ids.add(c.id);
    });
    v.characters.forEach((c, i) => { if (c.formOf !== "none" && !ids.has(c.formOf)) errors.push(`characters[${i}].formOf "${c.formOf}" is not an id`); });
    return errors;
  }, onProgress);
  const text = parsed.scenes.map((s) => s.narration).join(" ");
  return characters.filter((c) => hasWords(text, c.name) || c.formOf !== "none").map(toCast);
}

const ActorSchema = (ids: [string, ...string[]]) =>
  z.object({ id: z.enum(ids), place: z.enum(PLACES), enter: z.enum(ENTRIES), act: z.enum(MOTIONS), face: z.enum(FACES), then: z.enum(["none", ...MOTIONS]), thenFace: z.enum(FACES) });

export async function planChapter(parsed: ParsedStory, cast: CastMember[], indexes: number[], provider: LlmProvider, onProgress?: (n: number) => void): Promise<ScenePlan[]> {
  const ids = cast.map((c) => c.id) as [string, ...string[]];
  const plan = z.object({
    set: z.enum(SETS), time: z.enum(TIMES), mood: z.enum(MOODS),
    actors: z.array(ActorSchema(ids)).min(1).max(4),
    crowd: z.object({ id: z.enum(ids), count: z.number().int().min(0).max(6), act: z.enum(MOTIONS), then: z.enum(["none", ...MOTIONS]) }),
    fx: z.array(z.enum(EFFECTS)).max(3), objects: z.array(z.enum(OBJECTS)).max(2), shot: z.enum(SHOTS),
  });
  const schema = z.object({ scenes: z.array(plan).min(indexes.length).max(indexes.length) });
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: [
        story(parsed), "",
        `Characters: ${cast.map((c) => `${c.id} (${c.name}${c.formOf ? `, later form of ${c.formOf}` : ""})`).join(", ")}.`,
        `Plan exactly ${indexes.length} scenes, one for each of scenes ${indexes.map((i) => i + 1).join(", ")}, in order. Each scene is one shot of 5–8 seconds.`,
        "- set, time of day, mood of the music.",
        "- actors: 1–4 characters on screen: place (left/center/right), enter (walks in from a side, or none), act = what they do first, then = what they do in the second half (or none), with faces.",
        "  Motions: walk run talk call (shout while walking) point wave cheer bow kneel sit lie sit_up stretch heroic raise worry eat give carry march charge swing fall fly ride undress.",
        "- crowd: an army or villagers (a group character) with count 0 if none, what they do, then.",
        "- fx: transform (magic growth), sparkle, glow, fire (from a horse), smoke, embers, flash, shake, rays (light from the sky), pop.",
        "- objects in the set, and the shot: wide, full, medium, or track (following a run or gallop).",
        "Show exactly what the sentence says; keep each character in the same form until the story changes it.",
      ].join("\n"),
    },
  ];
  const { scenes } = await ask(provider, messages, schema, () => [], onProgress);
  return scenes.map((s) => ({ ...s, crowd: s.crowd.count > 0 ? s.crowd : undefined })) as ScenePlan[];
}

/** Words of a name that tell nothing on their own. */
const GENERIC = new Set(["của", "thứ", "một", "hai", "ba", "sáu", "người", "con", "cái", "các", "những", "và", "ông", "bà"]);
const tokensOf = (s: string) => s.normalize("NFC").toLowerCase().match(/\p{L}+/gu) ?? [];

/**
 * The sentence with what does not put anyone on stage taken out: names of places and eras
 * ("làng Gióng", "núi Trâu", "vào đời Vua Hùng thứ sáu"), denied actions ("không biết nói") and
 * aims ("để đi đánh giặc": the enemy is not there yet).
 */
export function onStage(narration: string): string {
  return narration.normalize("NFC")
    .replace(/(vào )?đời\s+[^,.;]+/giu, " ")
    .replace(/(để|mong|muốn)[^,.;]*đánh giặc/giu, " ")
    .replace(/(làng|xã|núi|sông|chân núi|đỉnh núi)\s+\p{Lu}\p{L}*(\s+\p{Lu}\p{L}*)?/gu, " ")
    .replace(/(không|chưa|chẳng)\s+(biết\s+|hề\s+)?\p{L}+/giu, " ");
}

/** The sentence speaks of this character: at least half of the telling words of its name. */
export function mentions(narration: string, name: string): boolean {
  const have = new Set(tokensOf(onStage(narration))), want = tokensOf(name).filter((w) => !GENERIC.has(w));
  if (!want.length) return tokensOf(name).every((w) => have.has(w));
  return want.filter((w) => have.has(w)).length >= Math.ceil(want.length / 2);
}

/** Where the words put the scene; undefined when they don't say. */
export function setFromWords(narration: string): ScenePlan["set"] | undefined {
  if (says(narration, "bay về trời|bay thẳng lên trời|cõi bất tử|trở về cõi")) return says(narration, "núi") ? "mountain" : "sky";
  if (says(narration, "núi|đỉnh núi|chân núi")) return "mountain";
  if (says(narration, "cung|triều đình|kinh đô")) return "palace";
  if (says(narration, "bụi tre|rừng tre|nhổ tre")) return "bamboo";
  if (says(narration, "ra đồng|cánh đồng|ruộng|đồng lúa")) return "field";
  if (says(narration, "làng|nhà|xóm")) return "village";
  return undefined;
}

/**
 * Folk-tale archetypes, recognised by name: the look a Vietnamese child expects of them.
 * The model's own choice is kept only for characters none of these describe.
 */
const ARCHETYPES: [RegExp, (c: CastMember) => unknown][] = [
  [/tráng sĩ|dũng sĩ|chiến binh|tướng/i, () => ({ body: "strong", outfit: { type: "armor" }, headwear: "helmet", cape: true, prop: { type: "iron_whip" }, props: [{ type: "broken_whip" }, { type: "bamboo" }] })],
  [/vua|hoàng đế/i, () => ({ body: "man", skin: "#e0aa74", outfit: { type: "robe", color: "#c9902a", trim: "#8a2a1a", sash: "#8a2a1a" }, hair: { style: "bun", color: "#2a1a12" }, headwear: "feather", beard: "#2a1a12" })],
  [/sứ giả|quan/i, () => ({ body: "man", outfit: { type: "robe", color: "#2f6a5a", trim: "#e8b93a", sash: "#e8b93a" }, hair: { style: "bun", color: "#2a1a12" }, prop: { type: "scroll", hand: "back" } })],
  [/giặc|quân địch|kẻ thù/i, () => ({ body: "man", skin: "#d0a070", outfit: { type: "enemy" }, headwear: "enemy_helmet", prop: { type: "spear" } })],
  [/quân lính|binh lính|lính/i, () => ({ body: "man", skin: "#d8a070", outfit: { type: "loincloth", color: "#8a5a2a" }, hair: { style: "bun", color: "#2a1a12" }, prop: { type: "spear" } })],
  [/dân làng|bà con|làng xóm|láng giềng/i, () => ({ body: "man", skin: "#d9a06c", outfit: { type: "tunic", color: "#6a5a3a" }, pants: "#3a3020", headwear: "nonla", hair: { style: "short" }, props: [{ type: "basket" }] })],
  [/^(bà|mẹ|vợ|cô|nàng|chị)|\b(bà mẹ|người mẹ|người vợ|bà vợ)\b/i, () => ({ body: "woman", skin: "#e8b27c", outfit: { type: "dress", color: "#8a4a2a", skirt: "#2e2420", sash: "#c9902a" }, hair: { style: "bun", color: "#4a3a32" } })],
  [/ông lão|ông cụ|cụ ông|ông già|người cha|cha\b/i, () => ({ body: "elder", skin: "#d9a06c", outfit: { type: "tunic", color: "#7a5a3a" }, pants: "#4a3a2a", hair: { style: "turban", color: "#4a3a2a" }, beard: "#ece8e0", prop: { type: "stick" } })],
  [/cậu bé|em bé|chú bé|đứa trẻ|con trai/i, () => ({ body: "child", outfit: { type: "tunic", color: "#c06a2c" }, hair: { style: "traidao" }, props: [{ type: "bowl" }] })],
];

/** Eras of Vietnamese history and the looks that belong to them (library/eras.json). */
export const ERAS: Record<string, { name: string; archetypes: Record<string, unknown> }> = JSON.parse(readFileSync(new URL("../library/eras.json", import.meta.url), "utf8"));
/** Which archetype a name describes (the keys of an era's archetypes). */
const ROLES: [RegExp, string][] = [
  [/tráng sĩ|dũng sĩ|chiến binh|tướng/i, "hero"], [/vua|hoàng đế/i, "king"], [/sứ giả|quan|lạc hầu|lạc tướng/i, "lord"],
  [/giặc|quân địch|kẻ thù/i, "enemy"], [/quân lính|binh lính|lính/i, "soldier"], [/dân làng|bà con|làng xóm|láng giềng/i, "villager_man"],
  [/^(bà|mẹ|vợ|cô|nàng|chị)|\b(bà mẹ|người mẹ|người vợ|bà vợ)\b/i, "mother"], [/ông lão|ông cụ|cụ ông|ông già|người cha|cha\b/i, "elder"],
  [/cậu bé|em bé|chú bé|đứa trẻ|con trai/i, "boy"],
];

/**
 * The archetype look for a character, from its name or, for a child, its body: the era's
 * (period-accurate) when the story has one, the general folk-tale look otherwise.
 */
export function archetype(c: CastMember, era?: string): unknown | undefined {
  if (c.kind !== "human") return undefined;
  const role = ROLES.find(([re]) => re.test(c.name))?.[1] ?? ((c.look as { body?: string })?.body === "child" ? "boy" : undefined);
  const eraLook = era && role ? ERAS[era]?.archetypes[role] : undefined;
  if (eraLook) return JSON.parse(JSON.stringify(eraLook));
  for (const [re, look] of ARCHETYPES) if (re.test(c.name)) return look(c);
  if ((c.look as { body?: string })?.body === "child") return ARCHETYPES.at(-1)![1](c);
  return undefined;
}

/**
 * The cast completed where the model forgot: one horse (duplicates merged), and for every
 * transformation the story tells ("trở thành một tráng sĩ khổng lồ") a new form if none.
 * Returns the cast and the ids merged away (old → kept).
 */
export function completeCast(cast: CastMember[], parsed: ParsedStory, era?: string): { cast: CastMember[]; merged: Map<string, string> } {
  const merged = new Map<string, string>(), out: CastMember[] = [];
  const firstHorse = cast.find((c) => c.kind === "horse");
  for (const c of cast) {
    if (c.kind === "horse" && firstHorse && c !== firstHorse) { merged.set(c.id, firstHorse.id); continue; }
    const look = archetype(c, era);
    out.push(look ? { ...c, look } : c);
  }
  const text = parsed.scenes.map((s) => s.narration).join(" ");
  for (const i of transformationScenes(parsed)) {
    const line = parsed.scenes[i]!.narration;
    const who = out.find((c) => c.kind === "human" && !c.group && !c.formOf && mentions(line, c.name));
    if (!who || out.some((c) => c.formOf === who.id)) continue;
    const giant = says(line, "khổng lồ|to lớn|cao lớn");
    const warrior = says(line, "tráng sĩ|chiến binh|tướng|dũng sĩ");
    const into = /(?:trở thành|biến thành|hóa thành|hoá thành)\s+(?:một\s+)?([^,.;]+)/iu.exec(line)?.[1]?.trim() ?? `${who.name} lớn`;
    const look = warrior && era && ERAS[era]?.archetypes.hero ? ERAS[era]!.archetypes.hero : warrior
      ? { body: "strong", outfit: { type: "armor" }, headwear: "helmet", cape: true, ...(says(text, "roi sắt") ? { prop: { type: "iron_whip" }, props: [{ type: "broken_whip" }, { type: "bamboo" }] } : {}) }
      : { ...(who.look as object), body: "strong" };
    out.push({ id: `${who.id}_form`, name: into, kind: "human", scale: giant ? 2.4 : 1.4, formOf: who.id, look });
  }
  // "Cả làng", "bà con": the villagers, as a crowd, if the model left them out.
  if (says(text, "dân làng|bà con|cả làng|làng xóm|láng giềng") && !out.some((c) => c.group && !/giặc|quân/i.test(c.name))) {
    out.push({ id: "villagers", name: "bà con dân làng", kind: "human", scale: 1, group: true, look: { body: "man", outfit: { type: "tunic", color: "#6a5a3a" }, pants: "#3a3020", headwear: "nonla", hair: { style: "short" }, props: [{ type: "basket" }] } });
  }
  // The giant's horse is a giant's horse.
  const giant = out.find((c) => c.formOf && c.scale > 2);
  if (firstHorse && giant) firstHorse.scale = giant.scale;
  return { cast: out, merged };
}

/**
 * The narration overrides the model where it is explicit. Pure, so it can be tested.
 * Returns the plan fixed, and the transformation of this scene if any.
 */
export function fixPlan(
  plan: ScenePlan, narration: string, cast: CastMember[], formFrom: Map<string, string>, isTransformation: boolean,
  previous?: ScenePlan, current: Map<string, string> = new Map(),
): { plan: ScenePlan; transform?: { from: string; to: string } } {
  const p: ScenePlan = JSON.parse(JSON.stringify(plan));
  const byId = new Map(cast.map((c) => [c.id, c]));
  // Characters already changed (the boy is now the warrior) are drawn in their new form.
  const now = (id: string) => (isTransformation ? id : current.get(id) ?? id);
  for (const a of p.actors) a.id = now(a.id);
  const named = [...new Set(cast.filter((c) => mentions(narration, c.name)).map((c) => now(c.id)))];
  // On screen: who the sentence names. Nobody named ("Cậu bé lên ba tuổi…"): the last scene's lead.
  const keep = new Set(named);
  if (!named.some((id) => !byId.get(id)?.group) && previous?.actors[0]) keep.add(previous.actors[0].id);
  p.actors = p.actors.filter((a) => keep.has(a.id) || byId.get(a.id)?.kind === "horse" && named.includes(a.id));
  if (p.crowd && !keep.has(p.crowd.id)) p.crowd = undefined;
  for (const id of keep) if (!named.includes(id) && !p.actors.some((a) => a.id === id) && byId.has(id)) {
    const prev = previous!.actors[0]!;
    p.actors.unshift({ ...prev, enter: "none", then: "none" });
  }
  // The place from the words, else the last scene's; the time of day holds within a chapter.
  const where = isTransformation ? undefined : setFromWords(narration);
  if (where) p.set = where;
  else if (previous) p.set = previous.set;
  if (previous && !where) p.time = previous.time;
  // Everyone the sentence names is on screen (up to four), once.
  for (const id of named) {
    const c = byId.get(id)!;
    if (c.formOf && named.includes(c.formOf) && !isTransformation) continue;
    if (c.group) {
      if (!p.crowd) p.crowd = { id, count: 4, act: "idle", then: "none" };
      continue;
    }
    if (!p.actors.some((a) => a.id === id) && p.crowd?.id !== id && p.actors.length < 4) {
      p.actors.push({ id, place: p.actors.length % 2 ? "right" : "left", enter: "none", act: "idle", face: "neutral", then: "none", thenFace: "neutral" });
    }
  }
  // Groups the model put on stage as one person go to the crowd instead.
  for (const a of p.actors) if (byId.get(a.id)?.group && !p.crowd) p.crowd = { id: a.id, count: 4, act: a.act, then: a.then };
  const seen = new Set<string>();
  p.actors = p.actors.filter((a) => !byId.get(a.id)?.group && (seen.has(a.id) ? false : (seen.add(a.id), true)));
  const main = p.actors[0];
  const set = (pred: (m: Motion) => boolean, then: Motion, face?: (typeof plan.actors)[number]["face"]) => {
    if (main && !pred(main.act) && !(main.then !== "none" && pred(main.then as Motion))) { main.then = then; if (face) main.thenFace = face; }
  };
  const words = onStage(narration);
  const flies = says(words, "bay") && says(words, "trời|lên");
  // Lying, flying, sitting up only when the words say so.
  for (const a of p.actors) {
    if (a.act === "lie" && !says(words, "nằm|nằm ngửa")) a.act = "idle";
    if (a.then === "lie" && !says(words, "nằm|nằm ngửa")) a.then = "none";
    if ((a.act === "fly" || a.then === "fly") && !flies) { if (a.act === "fly") a.act = "idle"; if (a.then === "fly") a.then = "none"; }
    if (a.then === "sit_up" && a.act !== "lie") a.then = "none";
    if (a.act === "sit_up") a.act = "sit";
    // Riding and striking are what people do; a horse given them just stands.
    if (byId.get(a.id)?.kind === "horse") { if (a.act === "ride" || a.act === "swing") a.act = "still"; if (a.then === "ride" || a.then === "swing") a.then = "none"; }
  }
  if (flies) set((m) => m === "fly", "fly", "proud");
  if (says(words, "nằm|nằm ngửa") && main) { main.act = "lie"; main.then = "none"; }
  if (says(words, "cất tiếng|dõng dạc|bảo|nói") && main && main.act === "lie") main.then = "sit_up";
  if (says(words, "rao")) { const m = p.actors.find((a) => byId.get(a.id)?.name && /sứ/i.test(byId.get(a.id)!.name)); if (m) { m.act = "call"; m.enter = "from_right"; } }
  if (says(words, "lo lắng|lo|buồn") && main) { main.face = main.face === "neutral" ? "worried" : main.face; if (main.act === "idle") main.act = "worry"; }
  if (says(words, "vui|vui vẻ|mừng") && main && main.face === "neutral") main.face = "happy";
  if (says(words, "ăn|cơm") && main && (main.act === "idle" || main.act === "stretch")) main.act = "eat";
  if (says(words, "lớn nhanh|lớn lên|lớn như thổi|lớn bổng") && !isTransformation) { p.grow = true; if (!p.fx.includes("sparkle")) p.fx.push("sparkle"); }
  if (says(words, "căng đứt|đứt chỉ|bung") && !p.fx.includes("pop")) p.fx.push("pop");
  // The village helping: the crowd is the villagers, not the enemy only spoken of.
  const villagers = cast.find((c) => c.group && !/giặc|quân/i.test(c.name));
  if (villagers && says(words, "bà con|cả làng|dân làng|láng giềng|góp")) p.crowd = { id: villagers.id, count: 3, act: says(words, "góp|mang|đem") ? "carry" : "cheer", then: says(words, "góp|mang|đem") ? "give" : "none" };
  if (says(words, "góp|mang|đem") && p.crowd && p.crowd.act === "idle") p.crowd.act = "carry";
  if (says(words, "vết chân") && !p.objects.includes("footprint")) { p.objects.push("footprint"); if (!p.fx.includes("sparkle")) p.fx.push("sparkle"); }
  if (says(words, "tan|tan tác|thua|đánh tan") && p.crowd && p.crowd.then === "none") p.crowd.then = "fall";
  if (says(words, "xâm lược|kéo sang|kéo đến") && p.crowd) p.crowd.act = "march";
  if (says(words, "phun lửa") && !p.fx.includes("fire")) p.fx.push("fire");
  if (says(words, "ngựa") && says(words, "nhảy lên|cưỡi|lên ngựa|một ngựa|xông")) {
    const horse = cast.find((c) => c.kind === "horse"), rider = p.actors.find((a) => byId.get(a.id)?.kind === "human" && (byId.get(a.id)!.scale >= 2 || byId.get(a.id)!.formOf));
    if (horse && rider) {
      if (!p.actors.some((a) => a.id === horse.id)) p.actors.push({ id: horse.id, place: "center", enter: "none", act: "run", face: "neutral", then: "none", thenFace: "neutral" });
      rider.act = "ride";
    }
  }
  // A giant beside the horse rides it; a horse nobody rides stands (it is only spoken of).
  const horseNow = p.actors.find((a) => byId.get(a.id)?.kind === "horse");
  const giant = p.actors.find((a) => byId.get(a.id)?.kind === "human" && !byId.get(a.id)?.group && ((byId.get(a.id)!.scale ?? 1) >= 2 || byId.get(a.id)!.formOf));
  if (horseNow && giant && giant.act !== "ride") { if (giant.act === "swing") giant.then = "swing"; giant.act = "ride"; }
  if (horseNow && !p.actors.some((a) => a.act === "ride" && byId.get(a.id)?.kind === "human") && !flies && !says(words, "phi|chạy|lao")) { horseNow.act = "still"; horseNow.then = "none"; }
  // Someone riding into battle: the horse gallops, the rider strikes.
  const riderNow = p.actors.find((a) => a.act === "ride" && byId.get(a.id)?.kind === "human");
  if (riderNow && horseNow && !flies) {
    if (says(words, "xông|phi|lao|đánh|nhổ|quật|dẹp|đuổi")) horseNow.act = "run";
    if (says(words, "đánh|nhổ|quật|vung")) riderNow.then = "swing";
  }
  if (says(words, "nhổ tre|bụi tre") && riderNow) p.objects = [...new Set([...p.objects, "stumps" as const])];
  if (p.set === "sky" && main && main.act !== "ride") { main.act = "fly"; main.face = "proud"; }
  // Fly together: a rider flies with the horse.
  const horseA = p.actors.find((a) => byId.get(a.id)?.kind === "horse");
  if (horseA && p.actors.some((a) => a.then === "fly" || a.act === "fly")) {
    horseA.then = "fly";
    if (horseA.act === "fly") horseA.act = "walk";
    for (const a of p.actors) if (a !== horseA && byId.get(a.id)?.kind === "human" && !byId.get(a.id)?.group && (byId.get(a.id)!.formOf || byId.get(a.id)!.scale >= 2 || a.act === "ride" || a.then === "fly")) { a.act = "ride"; a.then = "none"; }
  }
  // A form change named by the story.
  let transform: { from: string; to: string } | undefined;
  if (isTransformation) {
    for (const [to, from] of formFrom) if (p.actors.some((a) => a.id === from || a.id === to) || named.includes(from)) transform = { from, to };
    if (transform) p.actors = p.actors.filter((a) => a.id !== transform!.from && a.id !== transform!.to);
  }
  // Never an empty stage.
  if (!p.actors.length && !p.crowd && !transform && cast[0]) p.actors.push({ id: cast[0].id, place: "center", enter: "none", act: "idle", face: "neutral", then: "none", thenFace: "neutral" });
  return { plan: p, transform };
}

export { transformationScenes };
