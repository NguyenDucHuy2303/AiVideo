/**
 * The English version of a story: the brain translates the approved script scene by scene
 * and part by part (same scenes, same order: the Vietnamese version's pictures are reused and
 * only stretched to the English voice), names translated once and kept, the way each line is
 * said chosen from words the face library understands. Writes plan.en.json and script.en.txt.
 */
import { syncArt } from "./art.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { splitSpeakers } from "../tts/narrate.ts";
import { jobDir, loadJob } from "./jobs.ts";
import { ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { run } from "../utils/process.ts";
import { renderStory } from "../animation/story.ts";
import { castVoicesEn } from "./cast.ts";
import type { Designed } from "./design.ts";
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
    `- The first scene greets the viewers to "Huy Tells Tales" (the series); the last asks them to subscribe to the channel Ask Huy (the YouTube channel it is on, not the series).`,
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

const EN_NARRATOR = "bm_fable";
export const englishProject = (slug: string) => path.join(ROOT, "projects", `${slug}-en`);

/**
 * The English project next to the Vietnamese one: its scenes (the pictures) copied, the English
 * script as the narration, Kokoro voices by character, then the English voice build.
 */
export async function prepareEnglish(slug: string, log: (s: string) => void = console.log, test?: { vi: string; en: string; scenes: number }): Promise<string> {
  const dir = jobDir(slug), vi = test?.vi ?? path.join(ROOT, "projects", slug), en = test?.en ?? englishProject(slug);
  if (!(await exists(path.join(vi, "anim")))) throw new Error("the Vietnamese version is not made yet");
  const plan = (await exists(path.join(dir, "plan.en.json"))) ? JSON.parse(await fs.readFile(path.join(dir, "plan.en.json"), "utf8")) : await translateJob(slug, log);
  await fs.mkdir(path.join(en, "anim"), { recursive: true });
  for (const f of await fs.readdir(path.join(vi, "anim"))) if (/^s\d.*\.json$|^cast/.test(f)) await fs.copyFile(path.join(vi, "anim", f), path.join(en, "anim", f));
  const script = await fs.readFile(path.join(dir, "script.en.txt"), "utf8");
  await fs.writeFile(path.join(en, "script.txt"), script);
  const lines = script.trim().split("\n").slice(1, test ? test.scenes + 1 : undefined);
  await fs.writeFile(path.join(en, "storyboard.json"), JSON.stringify({ title: plan.title, kind: "story", scenes: lines.map((narration) => ({ narration, chapter: plan.title, onScreen: {}, visual: { description: "ancient Vietnam", mood: "calm" }, camera: "ken_burns", transition: "cut" })) }, null, 2));
  // The same actors speak, under their English names.
  const cast: Designed[] = JSON.parse(await fs.readFile(path.join(dir, "cast.json"), "utf8"));
  const speakers: Record<string, string[]> = {};
  for (const c of cast) for (const viName of c.speaks) {
    const enName = (plan.names as { vi: string; en: string }[]).find((n) => n.vi === viName)?.en ?? viName;
    (speakers[enName] ??= []).push(c.id);
  }
  const job = await loadJob(slug);
  const vproj = JSON.parse(await fs.readFile(path.join(vi, "project.json"), "utf8"));
  await fs.writeFile(path.join(en, "project.json"), JSON.stringify({ ...vproj, engine: "kokoro", voice: EN_NARRATOR, speed: 1.0, voices: castVoicesEn(plan.cast, EN_NARRATOR), speakers, thumbnail: { title: plan.title, subtitle: job.kind === "lịch sử" ? "Vietnamese History for Kids" : "Vietnamese Folk Tales" } }, null, 2));
  log("  English voices");
  await run(process.execPath, [path.join(ROOT, "src", "cli.ts"), "build", path.join(en, "storyboard.json"), "--voice-only"], { cwd: ROOT, timeoutMs: 60 * 60_000 });
  return en;
}

/** The English film (heavy), linked into the job folder as video.en.mp4 and thumbnail.en.jpg. */
export async function renderEnglish(slug: string, log: (s: string) => void = console.log, project?: string): Promise<string> {
  if (!project) await syncArt(await loadJob(slug), englishProject(slug));
  const out = await renderStory(project ?? englishProject(slug), { lang: "en", onLog: log });
  if (project) return out;
  for (const [from, to] of [[out, "video.en.mp4"], [out.replace(/\.mp4$/, "_thumbnail.jpg"), "thumbnail.en.jpg"]] as const) {
    const target = path.join(jobDir(slug), to);
    await fs.rm(target, { force: true });
    await fs.link(from, target).catch(() => fs.copyFile(from, target));
  }
  return out;
}
