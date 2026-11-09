/**
 * The English version of a story: the brain translates the approved script scene by scene
 * and part by part (same scenes, same order: the Vietnamese version's pictures are reused and
 * only stretched to the English voice), names translated once and kept, the way each line is
 * said chosen from words the face library understands. Writes plan.en.json and script.en.txt.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { splitSpeakers } from "../tts/narrate.ts";
import { jobDir } from "./jobs.ts";
import { toScript, type Plan } from "./write.ts";

const HOW = "happily, joyfully, laughing, sadly, crying, worried, scared, angrily, surprised, shouting, firmly, proudly, tired";

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    names: { type: "array", items: { type: "object", properties: { vi: { type: "string" }, en: { type: "string" } }, required: ["vi", "en"] } },
    scenes: { type: "array", items: { type: "object", properties: { parts: { type: "array", items: { type: "object", properties: { who: { type: "string" }, how: { type: "string" }, text: { type: "string" } }, required: ["who", "how", "text"] } } }, required: ["parts"] } },
  },
  required: ["title", "names", "scenes"],
};

export async function translateJob(slug: string, log: (s: string) => void = console.log): Promise<Plan & { names: { vi: string; en: string }[] }> {
  const dir = jobDir(slug);
  const plan: Plan = JSON.parse(await fs.readFile(path.join(dir, "plan.json"), "utf8"));
  const system = "You translate Vietnamese children's stories into warm, simple English for children aged 4–10, for an animated YouTube channel. Keep Vietnamese names and places (with diacritics removed only if hard to read: King Hùng → King Hung), keep cultural words with a short gloss when needed (bánh chưng, a square sticky-rice cake). Never add or drop events.";
  const prompt = [
    `Translate this story script (JSON) into English. Rules:`,
    `- Exactly the same number of scenes, and in each scene the same parts in the same order (the pictures are already made for them).`,
    `- Narration parts: who = "" and how = "". Dialogue parts: who = the speaker's English name (the same everywhere, from "names"), how = one of: ${HOW}.`,
    `- No quotation marks and no colons in the text.`,
    `- The first scene greets the viewers as "Huy's Story Time"; the last asks them to subscribe to Huy's Story Time.`,
    `- names: every speaker's Vietnamese name and the English one used.`,
    "",
    JSON.stringify({ title: plan.title, scenes: plan.scenes }),
  ].join("\n");
  const { data } = await think<{ title: string; names: { vi: string; en: string }[]; scenes: Plan["scenes"] }>({ job: slug, phase: "produce", step: "translate-en", model: "sonnet", system, prompt, schema: SCHEMA }, log);
  if (data.scenes.length !== plan.scenes.length) throw new Error(`translation has ${data.scenes.length} scenes, the script ${plan.scenes.length}`);
  const en = { ...plan, title: data.title, scenes: data.scenes, names: data.names, cast: plan.cast.map((c) => ({ ...c, name: data.names.find((n) => n.vi === c.name)?.en ?? c.name })) };
  const script = toScript(en);
  // Every line must still split into the same speakers (the voices and lip-sync depend on it).
  script.split("\n").slice(1).forEach((line, i) => {
    const want = plan.scenes[i]?.parts.filter((p) => p.who.trim()).length ?? 0, got = splitSpeakers(line).filter((p) => p.who).length;
    if (line && want !== got) log(`  ⚠ scene ${i + 1}: ${got} lines in English, ${want} in Vietnamese`);
  });
  await fs.writeFile(path.join(dir, "plan.en.json"), JSON.stringify(en, null, 2));
  await fs.writeFile(path.join(dir, "script.en.txt"), script);
  return en;
}
