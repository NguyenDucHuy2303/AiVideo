/**
 * "Học tiếng Anh cùng Huy": English for Vietnamese children (about 5–9), one theme per video
 * (animals at home, colours, school things, greetings…), made by the question pipeline
 * (qaproduce.ts: boards, presenters, paintings). Huy teaches in Vietnamese (VieNeu), Bối repeats
 * and tries (her little brother Beo too, with funny slips), and an English voice, Emma (Kokoro, slow), reads every word and sentence as a
 * model: she is the voice of the word cards, not on screen.
 *
 * Beats: hook (the theme), word (8–10 words: picture, the English word, the Vietnamese meaning;
 * Emma reads it twice, Bối repeats), practice (a quiz: a picture, "What is this?", a pause, the
 * answer), sentence (one or two simple sentences with the words), recap, next.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { moodOf, splitSpeakers } from "../tts/narrate.ts";
import { castVoices, type CastMember } from "./cast.ts";
import { jobDir, loadJob, saveJob } from "./jobs.ts";
import { PROFILES, VISUALS, type QAPlan, type QAScene } from "./qa.ts";
import { toScript, type Part } from "./write.ts";

export const TEACHER: CastMember = { name: "Emma", gender: "female", age: "adult", role: "the English voice of the word cards: reads every word and sentence slowly and clearly", villain: false };
/** Emma's voice: American English, slow for children. */
export const TEACHER_VOICE = { voice: "af_heart", engine: "kokoro", speed: 0.85 };
const LESSON_BEATS = ["hook", "word", "practice", "sentence", "recap", "next"] as const;

const PART = { type: "object", properties: { who: { type: "string" }, how: { type: "string" }, text: { type: "string" } }, required: ["who", "how", "text"] };
const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" }, question: { type: "string" }, answer: { type: "string" },
    words: { type: "array", items: { type: "object", properties: { en: { type: "string" }, vi: { type: "string" } }, required: ["en", "vi"] } },
    scenes: { type: "array", items: { type: "object", properties: { beat: { enum: [...LESSON_BEATS] }, visual: { type: "object", properties: { kind: { enum: [...VISUALS] }, what: { type: "string" } }, required: ["kind", "what"] }, parts: { type: "array", items: PART } }, required: ["beat", "visual", "parts"] } },
    shorts: { type: "array", items: { type: "number" } },
    thumbnail: { type: "string" }, description: { type: "string" },
  },
  required: ["title", "question", "answer", "words", "scenes", "shorts", "thumbnail", "description"],
};

export type LessonPlan = QAPlan & { words: { en: string; vi: string }[] };

const words = (scenes: QAScene[]) => scenes.flatMap((s) => s.parts).reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);

/** What is wrong with a lesson, in words the writer can fix. */
export function checkLesson(plan: LessonPlan): string[] {
  const problems: string[] = [];
  const w = words(plan.scenes);
  if (w < 800) problems.push(`The lesson is too short (${w} words): it needs about 900–1,250.`);
  if (w > 1450) problems.push(`The lesson is too long (${w} words): it needs about 900–1,250.`);
  if (plan.words.length < 6 || plan.words.length > 12) problems.push(`The lesson teaches ${plan.words.length} words: it needs 8–10.`);
  for (const b of LESSON_BEATS) if (!plan.scenes.some((s) => s.beat === b)) problems.push(`The beat "${b}" is missing.`);
  const names = new Set(plan.cast.map((c) => c.name));
  plan.scenes.forEach((sc, i) => {
    for (const p of sc.parts) {
      if (!names.has(p.who.trim())) problems.push(`Scene ${i + 1}: "${p.who}" speaks but is not in the cast.`);
      if (p.who !== TEACHER.name && p.how.trim() && !moodOf(p.how)) problems.push(`Scene ${i + 1}: the way of speaking "${p.how}" is not in the list.`);
      if (p.who === TEACHER.name && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(p.text)) problems.push(`Scene ${i + 1}: Emma speaks only English (she said "${p.text.slice(0, 40)}").`);
    }
    if ((sc.beat as string) === "word" && !sc.parts.some((p) => p.who === TEACHER.name)) problems.push(`Scene ${i + 1}: a word scene where Emma does not read the word.`);
    const line = toScript({ title: "", scenes: [sc], cast: [], facts: [], look: "" }).split("\n")[1]!;
    if (splitSpeakers(line).filter((x) => x.who).length !== sc.parts.length) problems.push(`Scene ${i + 1}: the lines do not read back (check for quotes or colons in the text).`);
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
  const system = `You write "Học tiếng Anh cùng Huy", an animated series of the YouTube channel "${P.home}" that teaches English to Vietnamese children aged 5–9. When Huy invites the viewers to subscribe, he names the channel "${P.home}". Huy (a young man) teaches in warm, simple Vietnamese; Bối (a girl of 8) repeats, tries and sometimes makes a funny mistake; her little brother Beo (5) is always there too: he repeats after her, in short lines, now and then a cute slip that Bối or Huy gently fixes; Emma is the English voice of the word cards: she says only English, slowly and clearly. Correct, natural English (American spelling), words a child can use, no slang. Vietnamese forms of address: Huy is a young man, like a big brother: he calls the viewers "các bạn", Bối and Beo "em", and himself "anh" or "mình"; Bối and Beo call him "anh Huy" and themselves "em" (never "con"); Beo calls his sister "chị Bối", she calls him "Beo" or "em"; nobody calls the viewers "con".`;
  const { data, by } = await think<Omit<LessonPlan, "cast" | "look" | "facts">>({ job: slug, system, schema: SCHEMA, step: previous ? "lesson-rewrite" : "lesson-write", model: "sonnet", effort: "medium", prompt: [
    `Write the lesson: "${job.topic}"${job.summary ? ` (${job.summary})` : ""}.`,
    "",
    "Beats, in order:",
    "- hook (1–2 scenes): Huy greets the viewers (\"Chào các bạn!\") and says what we learn today; Bối and Beo are excited.",
    "- word (one scene per word, 8–10 words): Huy says the Vietnamese meaning and a tiny tip; Emma says the word twice (\"Cat. Cat.\"); Bối repeats it (Beo too in some scenes); sometimes Emma reads a two-to-four-word phrase with it (\"A small cat.\").",
    "- practice (3–5 scenes): a quiz: Huy asks in Vietnamese or Emma asks \"What is this?\", Bối or Beo guesses (once wrongly and fixes it), Emma says the answer.",
    "- sentence (2–4 scenes): one or two simple sentences with the words (\"I have a cat.\"), Emma reads, Bối repeats, Huy explains the meaning.",
    "- recap (1–2 scenes): Emma reads all the words once more, Bối repeats the hardest one, Beo his favourite.",
    "- next (1 scene): Huy says the next theme and asks to subscribe to the channel.",
    "",
    "Length: 28–40 scenes, about 900–1,250 words in all (Vietnamese syllables and English words count alike).",
    `Parts: who = "Huy", "Bối", "Beo" or "Emma" (only these). how for Huy, Bối and Beo chosen from: ${P.how} (or empty); Emma's how is empty. Emma says ONLY English; Huy, Bối and Beo speak Vietnamese and may say the English word they are learning. No quotation marks and no colons inside text.`,
    "visual: kind (labels for a word card: the picture with the English word and the Vietnamese meaning under it; compare, count or scene when they fit; host for Huy talking) and what to draw exactly (for word cards: the object, the word in big letters, the meaning).",
    "words: the words taught, each { en, vi }.",
    "question: the theme as a short title in Vietnamese (\"Con vật trong nhà\"). answer: the words taught, listed. title: \"Học tiếng Anh: <theme> | <3–4 English words>\" or similar, under 80 characters.",
    "shorts: the scene numbers (1-based) of a 45–60 second Short: 3–4 of the word scenes and the end.",
    "thumbnail: at most 5 words, e.g. \"CAT, DOG, FISH!\". description: 2 sentences in Vietnamese for parents.",
    ...(previous ? ["", "The previous version (rewrite following the notes):", previous] : []),
    ...(notes.length ? ["", "Notes to fix:", ...notes.map((n) => `- ${n}`)] : []),
  ].join("\n") }, log);
  const plan: LessonPlan = { ...data, scenes: data.scenes.map((s) => ({ ...s, beat: s.beat as QAScene["beat"] })), cast: [P.host, P.kid, P.little, TEACHER], look: "", facts: [] };

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
      prompt: ["Fix these scenes (Emma speaks only English; Huy, Bối and Beo Vietnamese), keep everything else; return them with their index.", ...check.issues.map((x) => `- scene ${x.scene}: "${x.quote}" — ${x.problem} → ${x.fix}`), ...checkLesson(plan).filter((p) => /^Scene/.test(p)).map((p) => `- ${p}`), "", JSON.stringify(toFix.map((i) => ({ index: i + 1, parts: plan.scenes[i]!.parts })))].join("\n") }, log);
    for (const sc of fixed.scenes) if (plan.scenes[sc.index - 1]) plan.scenes[sc.index - 1]!.parts = sc.parts;
  }
  const problems = checkLesson(plan);
  await fs.writeFile(path.join(dir, "factcheck.json"), JSON.stringify(check, null, 2));
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, "script.txt"), toScript(plan));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ engine: P.engine, voice: P.narrator, speed: P.speed, imageGen: "off", onlineImages: false, profiles: ["16x9"], channel: P.channel,
    voices: { ...castVoices([P.host, P.kid, P.little], P.narrator), [TEACHER.name]: TEACHER_VOICE } }, null, 2));
  job = await loadJob(slug);
  job.by = by;
  await saveJob(job);
  return problems;
}

/** Themes for the next lessons (~3k tokens a batch). */
export async function proposeLessons(count: number, made: { topic: string }[], log?: (s: string) => void, hints: string[] = []): Promise<{ question: string; area: string; why: string }[]> {
  const { data } = await think<{ themes: { theme: string; why: string }[] }>({
    job: "topics-lesson", step: "propose-lessons", model: "sonnet",
    system: "You plan \"Học tiếng Anh cùng Huy\", English lessons for Vietnamese children aged 5–9 (beginners).",
    schema: { type: "object", properties: { themes: { type: "array", items: { type: "object", properties: { theme: { type: "string" }, why: { type: "string" } }, required: ["theme", "why"] } } }, required: ["themes"] },
    prompt: [
      `Propose ${count} themes for the next lessons, in Vietnamese ("Con vật trong nhà", "Màu sắc", "Đồ dùng học tập", "Chào hỏi"…), from the easiest and most useful for a beginner, each with 8–10 everyday words that can be drawn.`,
      "- Not any of these:", ...made.map((m) => `  - ${m.topic}`),
      ...(hints.length ? ["- In season now (when it fits, e.g. words for a festival):", ...hints.map((h) => `  - ${h}`)] : []),
      "- why: one line on why parents will choose it.",
    ].join("\n"),
  }, log);
  const seen = new Set(made.map((m) => m.topic.toLowerCase().trim()));
  return data.themes.filter((t) => !seen.has(t.theme.toLowerCase().trim())).slice(0, count).map((t) => ({ question: t.theme, area: "lesson", why: t.why }));
}
