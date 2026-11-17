/**
 * "Học tiếng Anh cùng Huy": English for Vietnamese children (about 5–9), one theme per video
 * (animals at home, colours, school things, greetings…), made by the question pipeline
 * (qaproduce.ts: boards, presenters, paintings). Huy teaches in Vietnamese (VieNeu), his brother
 * Hùng acts the words out, Bối repeats
 * and tries (her little brother Beo too, with funny slips), and an English voice, Emma (Kokoro, slow), reads every word and sentence as a
 * model: she is the voice of the word cards, not on screen.
 *
 * Each lesson has a format (formats.ts: word cards, a story, a game show, a role play, guess the
 * shadow, Beo's mistakes): its beats, its length and its drawing. Lines the four say wholly in
 * English are read by their English voices (Kokoro, as on Ask Huy: project.json "Bối@en"…), so
 * a child hears every English line said right; "[3s]" in a script is a pause for the viewers.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { moodOf, splitSpeakers } from "../tts/narrate.ts";
import { castVoices, castVoicesEn, type CastMember } from "./cast.ts";
import { jobDir, loadJob, saveJob } from "./jobs.ts";
import { PROFILES, VISUALS, type QAPlan, type QAScene } from "./qa.ts";
import { toScript, type Part } from "./write.ts";
import { FORMATS, formatOf, type FormatId, type LessonFormat } from "./formats.ts";

export const TEACHER: CastMember = { name: "Emma", gender: "female", age: "adult", role: "the English voice of the word cards: reads every word and sentence slowly and clearly", villain: false };
/** Emma's voice: American English, slow for children. */
export const TEACHER_VOICE = { voice: "af_heart", engine: "kokoro", speed: 0.85 };

const PART = { type: "object", properties: { who: { type: "string" }, how: { type: "string" }, text: { type: "string" } }, required: ["who", "how", "text"] };
const schemaOf = (F: LessonFormat) => ({
  type: "object",
  properties: {
    title: { type: "string" }, question: { type: "string" }, answer: { type: "string" },
    words: { type: "array", items: { type: "object", properties: { en: { type: "string" }, vi: { type: "string" } }, required: ["en", "vi"] } },
    scenes: { type: "array", items: { type: "object", properties: { beat: { enum: [...F.beats] }, visual: { type: "object", properties: { kind: { enum: [...VISUALS] }, what: { type: "string" } }, required: ["kind", "what"] }, parts: { type: "array", items: PART }, ...(F.scoring ? { point: { type: "string" } } : {}) }, required: ["beat", "visual", "parts", ...(F.scoring ? ["point"] : [])] } },
    shorts: { type: "array", items: { type: "number" } },
    thumbnail: { type: "string" }, description: { type: "string" },
  },
  required: ["title", "question", "answer", "words", "scenes", "shorts", "thumbnail", "description"],
});

export type LessonPlan = QAPlan & { words: { en: string; vi: string }[]; format?: string };

/** A pause for the viewers: a part nobody says, "[3s]". */
export const isPause = (p: Part) => !p.who.trim() && /^\[\d+(\.\d+)?s\]$/.test(p.text.trim());
/** The Kokoro voices of the four for their English lines: the same as on Ask Huy. */
export function englishVoices(): Record<string, { voice: string; engine: string; speed: number; pitch?: number }> {
  const Q = PROFILES.qa, out: Record<string, { voice: string; engine: string; speed: number; pitch?: number }> = {};
  for (const [name, v] of Object.entries(castVoicesEn([Q.host, Q.helper, Q.kid, Q.little], Q.narrator))) {
    out[`${name}@en`] = { ...(typeof v === "string" ? { voice: v } : v), engine: "kokoro", speed: 0.88 };
  }
  return out;
}

const words = (scenes: QAScene[]) => scenes.flatMap((s) => s.parts).reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);

/** What is wrong with a lesson, in words the writer can fix (by its format's rules). */
export function checkLesson(plan: LessonPlan): string[] {
  const F = formatOf(plan.format), problems: string[] = [];
  const w = words(plan.scenes), [lo, hi] = F.length, [a, b] = F.items, [s0, s1] = F.scenes;
  if (w < Math.round(lo * 0.88)) problems.push(`The lesson is too short (${w} words): it needs about ${lo}–${hi}.`);
  if (w > Math.round(hi * 1.16)) problems.push(`The lesson is too long (${w} words): it needs about ${lo}–${hi}.`);
  if (plan.words.length < a - 1 || plan.words.length > b + 2) problems.push(`The lesson teaches ${plan.words.length} ${F.teaches}: it needs ${a}–${b}.`);
  if (plan.scenes.length < s0 - 3 || plan.scenes.length > s1 + 4) problems.push(`The lesson has ${plan.scenes.length} scenes: it needs ${s0}–${s1}.`);
  for (const beat of F.beats) if (!plan.scenes.some((s) => s.beat === beat)) problems.push(`The beat "${beat}" is missing.`);
  const pauses = plan.scenes.reduce((n, s) => n + s.parts.filter(isPause).length, 0);
  if (F.pauses && pauses < F.pauses) problems.push(`The lesson has ${pauses} pauses for the viewers: it needs at least ${F.pauses} (a part with who "" and text "[3s]").`);
  const names = new Set(plan.cast.map((c) => c.name));
  plan.scenes.forEach((sc, i) => {
    for (const p of sc.parts) {
      if (isPause(p)) continue;
      if (!names.has(p.who.trim())) problems.push(`Scene ${i + 1}: "${p.who}" speaks but is not in the cast.`);
      if (p.who !== TEACHER.name && p.how.trim() && !moodOf(p.how)) problems.push(`Scene ${i + 1}: the way of speaking "${p.how}" is not in the list.`);
      if (p.who === TEACHER.name && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(p.text)) problems.push(`Scene ${i + 1}: Emma speaks only English (she said "${p.text.slice(0, 40)}").`);
    }
    if (F.emma.includes(sc.beat as string) && !sc.parts.some((p) => p.who === TEACHER.name)) problems.push(`Scene ${i + 1}: a ${sc.beat} scene where Emma does not read the ${F.teaches === "words" ? "word" : "phrase"}.`);
    if (F.scoring && sc.point && !["Bối", "Beo", "both", ""].includes(sc.point.trim())) problems.push(`Scene ${i + 1}: point "${sc.point}" must be "Bối", "Beo", "both" or "".`);
    const line = toScript({ title: "", scenes: [sc], cast: [], facts: [], look: "" }).split("\n")[1]!;
    if (splitSpeakers(line).filter((x) => x.who).length !== sc.parts.filter((p) => !isPause(p)).length) problems.push(`Scene ${i + 1}: the lines do not read back (check for quotes or colons in the text).`);
  });
  return [...new Set(problems)];
}

/** Write (or rewrite with the user's notes) an English lesson; returns the problems left. */
export async function writeLesson(slug: string, log: (s: string) => void = console.log): Promise<string[]> {
  let job = await loadJob(slug);
  const dir = jobDir(slug), P = PROFILES["qa-vi"];
  const notes = job.notes.filter((n) => n.on === "script").map((n) => n.text);
  const prevFile = path.join(dir, "script.txt");
  const previous = job.status === "rewrite" && (await fs.stat(prevFile).catch(() => null)) ? await fs.readFile(prevFile, "utf8") : undefined;
  const system = `You write "Học tiếng Anh cùng Huy", an animated series of the YouTube channel "${P.home}" that teaches English to Vietnamese children aged 5–9. When Huy invites the viewers to subscribe, he names the channel "${P.home}". Huy (a young man of 25) teaches in warm, simple Vietnamese; his younger brother Hùng (21) is always there as his hands-on helper: he shows the things, acts the words out and plays the quiz, now and then with a funny little mishap; Bối (a girl of 8) repeats, tries and sometimes makes a funny mistake; her little brother Beo (5) is always there too: he repeats after her, in short lines, now and then a cute slip that Bối or Huy gently fixes; Emma is the English voice of the word cards: she says only English, slowly and clearly. Correct, natural English (American spelling), words a child can use, no slang. Vietnamese forms of address: Huy is a young man, like a big brother: he calls the viewers "các bạn", Bối and Beo "em", and himself "anh" or "mình"; Bối and Beo call him "anh Huy", Hùng "anh Hùng", and themselves "em" (never "con"); Hùng calls his brother "anh Huy" or "anh", Huy calls him "Hùng" or "em"; Beo calls his sister "chị Bối", she calls him "Beo" or "em"; nobody calls the viewers "con".`;
  const F = formatOf(job.format);
  const { data, by } = await think<Omit<LessonPlan, "cast" | "look" | "facts">>({ job: slug, system, schema: schemaOf(F), step: previous ? "lesson-rewrite" : "lesson-write", model: "sonnet", effort: "medium", prompt: [
    `Write the lesson: "${job.topic}"${job.summary ? ` (${job.summary})` : ""}.`,
    `Format: ${F.name} (${F.teaches === "words" ? `${F.items[0]}–${F.items[1]} words` : `${F.items[0]}–${F.items[1]} short phrases`}).`,
    "",
    "Beats, in order (each scene has a beat):",
    ...F.plan,
    "",
    `Length: ${F.scenes[0]}–${F.scenes[1]} scenes, about ${F.length[0]}–${F.length[1]} words in all (Vietnamese syllables and English words count alike).`,
    `Parts: who = "Huy", "Hùng", "Bối", "Beo" or "Emma" (only these). how for Huy, Hùng, Bối and Beo chosen from: ${P.how} (or empty); Emma's how is empty. Emma says ONLY English. Huy, Hùng, Bối and Beo speak Vietnamese, and say English lines when they repeat, answer or play in English. English as children really say it: "Let's play!", "I'm eight.", "What's your name?" (straight apostrophes), never "Let us play".`,
    "- A line wholly in English (\"Cat!\", \"How much is it?\") is read by the character's English voice, so it is said right: keep such a line English only, with no Vietnamese word in it. In a Vietnamese line, an English word may be named, but the model to copy is always Emma's or a wholly English line.",
    `- A pause for the viewers to answer (before an answer is given): a part with who "", how "" and text "[3s]" (2–4 seconds, "[2s]" to "[4s]"), right after the question.${F.pauses ? ` At least ${F.pauses} pauses.` : ""}`,
    "- No quotation marks and no colons inside text.",
    ...(F.scoring ? ["- point (every scene): who won a point in that scene, \"Bối\", \"Beo\", \"both\", or \"\" (most scenes)."] : []),
    "visual: kind (labels for a word or phrase card: the picture with the English and the Vietnamese meaning under it; scene for a moment somewhere; compare, count when they fit; host for Huy talking) and what to draw exactly (for cards: the thing, the English in big letters, the meaning).",
    `words: the ${F.teaches} taught, each { en, vi }.`,
    `question: the theme as a short title in Vietnamese ("Con vật trong nhà"). answer: the ${F.teaches} taught, listed. title: ${F.title} or similar, under 80 characters.`,
    `shorts: the scene numbers (1-based) of a 45–60 second Short: ${F.shorts}.`,
    `thumbnail: at most 5 words, ${F.thumbnail}. description: 2 sentences in Vietnamese for parents.`,
    ...(previous ? ["", "The previous version (rewrite following the notes):", previous] : []),
    ...(notes.length ? ["", "Notes to fix:", ...notes.map((n) => `- ${n}`)] : []),
  ].join("\n") }, log);
  const plan: LessonPlan = { ...data, format: F.id, scenes: data.scenes.map((s) => ({ ...s, beat: s.beat as QAScene["beat"], ...(s.point?.trim() ? { point: s.point.trim() } : { point: undefined }) })), cast: [P.host, P.helper, P.kid, P.little, TEACHER], look: "", facts: [] };

  // The English checked by a second reader: spelling, meaning, grammar, what a child can say.
  const { data: check } = await think<{ issues: { scene: number; quote: string; problem: string; fix: string }[] }>({ job: slug, system, step: "lesson-check", model: "sonnet",
    schema: { type: "object", properties: { issues: { type: "array", items: { type: "object", properties: { scene: { type: "number" }, quote: { type: "string" }, problem: { type: "string" }, fix: { type: "string" } }, required: ["scene", "quote", "problem", "fix"] } } }, required: ["issues"] },
    prompt: ["Check this English lesson for Vietnamese children: wrong English (spelling, grammar, unnatural phrasing), a wrong Vietnamese meaning of an English word, or a word too hard for the age. Quote exactly, give the fix. An empty list is a fine answer.", "",
      ...plan.scenes.map((s, i) => `${i + 1}: ${s.parts.map((p) => `${p.who}: ${p.text}`).join(" / ")}`)].join("\n") }, log);
  log(`  English check: ${check.issues.length} issue(s)`);
  const toFix = [...new Set([...check.issues.map((x) => x.scene - 1), ...checkLesson(plan).filter((p) => /^Scene \d+:/.test(p)).map((p) => Number(/^Scene (\d+):/.exec(p)![1]) - 1)])].filter((i) => plan.scenes[i]);
  if (toFix.length) {
    const { data: fixed } = await think<{ scenes: { index: number; parts: Part[] }[] }>({ job: slug, system, step: "lesson-fix", model: "sonnet",
      schema: { type: "object", properties: { scenes: { type: "array", items: { type: "object", properties: { index: { type: "number" }, parts: { type: "array", items: PART } }, required: ["index", "parts"] } } }, required: ["scenes"] },
      prompt: ["Fix these scenes (Emma speaks only English; Huy, Hùng, Bối and Beo Vietnamese, or lines wholly in English; a pause is a part with who \"\" and text \"[3s]\"), keep everything else; return them with their index.", ...check.issues.map((x) => `- scene ${x.scene}: "${x.quote}" — ${x.problem} → ${x.fix}`), ...checkLesson(plan).filter((p) => /^Scene/.test(p)).map((p) => `- ${p}`), "", JSON.stringify(toFix.map((i) => ({ index: i + 1, parts: plan.scenes[i]!.parts })))].join("\n") }, log);
    for (const sc of fixed.scenes) if (plan.scenes[sc.index - 1]) plan.scenes[sc.index - 1]!.parts = sc.parts;
  }
  const problems = checkLesson(plan);
  await fs.writeFile(path.join(dir, "factcheck.json"), JSON.stringify(check, null, 2));
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, "script.txt"), toScript(plan));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ engine: P.engine, voice: P.narrator, speed: P.speed, imageGen: "off", onlineImages: false, profiles: ["16x9"], channel: P.channel,
    voices: { ...castVoices([P.host, P.helper, P.kid, P.little], P.narrator), ...englishVoices(), [TEACHER.name]: TEACHER_VOICE } }, null, 2));
  job = await loadJob(slug);
  job.by = by;
  await saveJob(job);
  return problems;
}

/** Themes for the next lessons, one for each format given, in order (~3k tokens a batch). */
export async function proposeLessons(count: number, made: { topic: string }[], log?: (s: string) => void, hints: string[] = [], formats: FormatId[] = Array(count).fill("cards")): Promise<{ question: string; area: string; why: string; format: FormatId }[]> {
  const { data } = await think<{ themes: { theme: string; why: string }[] }>({
    job: "topics-lesson", step: "propose-lessons", model: "sonnet",
    system: "You plan \"Học tiếng Anh cùng Huy\", English lessons for Vietnamese children aged 5–9 (beginners), in several formats.",
    schema: { type: "object", properties: { themes: { type: "array", items: { type: "object", properties: { theme: { type: "string" }, why: { type: "string" } }, required: ["theme", "why"] } } }, required: ["themes"] },
    prompt: [
      `Propose ${count} themes for the next lessons, in Vietnamese ("Con vật trong nhà", "Màu sắc", "Đi chợ mua hoa quả", "Chào hỏi"…), from the easiest and most useful for a beginner, one for each of these formats, in this order:`,
      ...formats.slice(0, count).map((f, k) => `  ${k + 1}. ${FORMATS[f].name}: ${FORMATS[f].fits}.`),
      "- Each theme with everyday words or phrases that can be drawn.",
      "- Not any of these:", ...made.map((m) => `  - ${m.topic}`),
      ...(hints.length ? ["- In season now (when it fits, e.g. words for a festival):", ...hints.map((h) => `  - ${h}`)] : []),
      "- why: one line on why parents will choose it.",
    ].join("\n"),
  }, log);
  const seen = new Set(made.map((m) => m.topic.toLowerCase().trim()));
  return data.themes.slice(0, count).map((t, k) => ({ question: t.theme, area: "lesson", why: t.why, format: formats[k] ?? "cards" })).filter((t) => !seen.has(t.question.toLowerCase().trim()));
}
