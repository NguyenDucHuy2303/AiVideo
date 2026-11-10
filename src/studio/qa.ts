/**
 * The question channel (English, children 6–12): one question answered per 5–8 minute video.
 * Research (Simple English + English Wikipedia) → the brain writes the script in fixed beats
 * (hook, the common wrong guess, 3–4 explained steps, imagine/try, recap and a fun fact, the
 * next question), every scene with the picture that explains it → a separate fact check of
 * every claim against the sources → fixes → script.txt, plan.json, factcheck.json, the
 * Shorts cut and the thumbnail words, then the job waits for review like a story.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { research, type Source } from "../research/wiki.ts";
import { moodOf, splitSpeakers } from "../tts/narrate.ts";
import { castVoicesEn, type CastMember } from "./cast.ts";
import { jobDir, loadJob, saveJob } from "./jobs.ts";
import { toScript, type Part } from "./write.ts";

/** The channel ("Ask Huy", chosen 2026-11-10) and its two regulars. */
export const QA = {
  channel: "Ask Huy",
  host: { name: "Huy", gender: "male", age: "young", role: "the host: curious, warm, a little funny; explains", villain: false } as CastMember,
  kid: { name: "Mai", gender: "female", age: "child", role: "an 8-year-old who asks, guesses and tries things", villain: false } as CastMember,
  narrator: "am_michael",
};

export const BEATS = ["hook", "guess", "step", "imagine", "recap", "next"] as const;
/** What the explainer pictures can show (phase 2 builds them in the vector runtime). */
export const VISUALS = ["host", "scene", "diagram", "labels", "arrows", "map", "compare", "zoom", "count", "experiment"] as const;
const HOW = "happily, joyfully, laughing, surprised, worried, firmly, proudly, sadly, scared, tired";

export interface QAScene { beat: (typeof BEATS)[number]; step?: number; visual: { kind: (typeof VISUALS)[number]; what: string }; parts: Part[] }
export interface QAPlan {
  title: string;
  question: string;
  answer: string;
  scenes: QAScene[];
  cast: CastMember[];
  facts: { claim: string; source: string }[];
  shorts: number[];
  thumbnail: string;
  description: string;
  look: string;
}

const PART = { type: "object", properties: { who: { type: "string" }, how: { type: "string" }, text: { type: "string" } }, required: ["who", "how", "text"] };
const SCENE = {
  type: "object",
  properties: {
    beat: { enum: [...BEATS] },
    step: { type: "number" },
    visual: { type: "object", properties: { kind: { enum: [...VISUALS] }, what: { type: "string" } }, required: ["kind", "what"] },
    parts: { type: "array", items: PART },
  },
  required: ["beat", "visual", "parts"],
};
const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" }, question: { type: "string" }, answer: { type: "string" },
    scenes: { type: "array", items: SCENE },
    facts: { type: "array", items: { type: "object", properties: { claim: { type: "string" }, source: { type: "string" } }, required: ["claim", "source"] } },
    shorts: { type: "array", items: { type: "number" } },
    thumbnail: { type: "string" }, description: { type: "string" },
  },
  required: ["title", "question", "answer", "scenes", "facts", "shorts", "thumbnail", "description"],
};
const CHECK_SCHEMA = {
  type: "object",
  properties: {
    issues: { type: "array", items: { type: "object", properties: { scene: { type: "number" }, quote: { type: "string" }, problem: { type: "string" }, fix: { type: "string" } }, required: ["scene", "quote", "problem", "fix"] } },
  },
  required: ["issues"],
};
const SCENES_SCHEMA = { type: "object", properties: { scenes: { type: "array", items: { type: "object", properties: { index: { type: "number" }, parts: { type: "array", items: PART } }, required: ["index", "parts"] } } }, required: ["scenes"] };

const SYSTEM = `You write scripts for "${QA.channel}", an animated YouTube channel for children aged 6–12 that answers one question per video (5–8 minutes). The host ${QA.host.name} explains; ${QA.kid.name}, 8, asks, guesses and tries things.

Rules:
- Correct above all: every claim must be supported by the sources given or be basic, settled school knowledge. Numbers rounded and said with "about". If the sources disagree or science is unsure, say so simply ("scientists think…").
- Simple words, short sentences, one idea at a time; explain any hard word the moment it appears; comparisons from a child's life (a football pitch, a school bus, a grain of rice).
- Warm and funny, never mocking a wrong guess: guessing is how scientists start.
- Safe: nothing dangerous to copy, no fire or chemicals at home, no medical advice; no gore or frightening detail.
- Every scene is one picture that can be drawn as a simple 2D explainer cartoon.`;

function prompt(question: string, sources: Source[], notes: string[], previous?: string): string {
  return [
    `Write the script for the question: "${question}"`,
    "",
    "Beats, in order (each scene has a beat):",
    "- hook (1–2 scenes): the question asked in a fun way and one surprising teaser; then the host says what we will find out today.",
    `- guess (1–3 scenes): ${QA.kid.name} says the common wrong idea (or a few); the host takes it seriously, then says why it is not the whole story.`,
    "- step (12–24 scenes): the answer in 3–4 steps, each building on the last; step = 1, 2, 3, 4. Each step ends with a one-line takeaway.",
    "- imagine (2–4 scenes): \"imagine if…\" or a safe try-at-home check.",
    "- recap (1–2 scenes): the answer in one or two sentences, then one fun fact.",
    "- next (1 scene): tease another question for next time, invite to subscribe.",
    "",
    "Length: 26–38 scenes, about 850–1,150 words in all (5–8 minutes).",
    `Parts: narration by the host to the viewer: who = "${QA.host.name}" too (he is on screen), how = "" or a word from the list. Dialogue: who = "${QA.host.name}" or "${QA.kid.name}" (only these two speak). how chosen from: ${HOW}. No quotation marks inside text, no colons inside text.`,
    "visual: kind = the kind of picture (host: the host talking to camera; scene: characters in a place; diagram: a simple labelled drawing of how it works; labels: an object with its parts named; arrows: movement or flow; map; compare: sizes or amounts side by side; zoom: going inside something small; count: numbers, a timeline; experiment), what = exactly what to draw, in one or two sentences. At most a third of the scenes may be host.",
    "facts: every factual claim in the script with the title of the source that supports it.",
    "shorts: the scene numbers (1-based) that make a 45–60 second Short on their own: the question, the core answer, the fun fact, about 120–160 words.",
    "thumbnail: at most 5 words, big and curious (the question or its surprise).",
    "description: 2–3 sentences for YouTube, for parents too.",
    "",
    "Sources:",
    ...sources.map((s) => `### ${s.title} (${s.url})\n${s.text}`),
    ...(previous ? ["", "The previous version (rewrite following the notes, keep what the notes do not touch):", previous] : []),
    ...(notes.length ? ["", "Notes to fix:", ...notes.map((n) => `- ${n}`)] : []),
  ].join("\n");
}

/** A question's key words for the search: "How do bees make honey?" → "bees honey". */
export function keyWords(question: string): string {
  const q = question.replace(/[?!.,"']/g, " ").replace(/\b(how|why|what|which|when|where|who|whose|do|does|did|is|are|was|were|can|could|would|will|a|an|the|so|much|many|make|makes|made|really|up|we|you|our|your)\b/gi, " ");
  return q.replace(/\s+/g, " ").trim() || question;
}

/**
 * Sources for a question: Simple English first (written for children), then English for the
 * details, no article twice. Wikipedia's search does not understand questions ("How can a
 * bridge hold up…" finds "Rivet"), so a small model names the articles first (~500 tokens);
 * the search by key words only fills what is missing.
 */
export async function qaSources(question: string, job = "qa-research"): Promise<Source[]> {
  const query = keyWords(question);
  let titles: string[] = [];
  try {
    ({ data: { titles } } = await think<{ titles: string[] }>({ job, step: "qa-sources", model: "haiku", system: "You know Wikipedia well.",
      schema: { type: "object", properties: { titles: { type: "array", items: { type: "string" } } }, required: ["titles"] },
      prompt: `Exact titles of the 4 English Wikipedia articles most useful to answer this question for children, most useful first, general articles before narrow ones: "${question}"` }));
  } catch { /* the search alone */ }
  const simple = await research(question, { lang: "simple", count: 2, budget: 10_000, query, titles });
  const en = await research(question, { lang: "en", count: 2, budget: 16_000, query, titles, skip: simple.map((s) => s.title) });
  return [...simple, ...en];
}

const words = (scenes: QAScene[]) => scenes.flatMap((s) => s.parts).reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);

/** What is wrong with a plan, in words the writer can fix. */
export function checkQA(plan: QAPlan): string[] {
  const problems: string[] = [];
  const w = words(plan.scenes);
  if (w < 800) problems.push(`The script is too short (${w} words): it needs about 850–1,150.`);
  if (w > 1300) problems.push(`The script is too long (${w} words): it needs about 850–1,150.`);
  if (plan.scenes.length < 22 || plan.scenes.length > 42) problems.push(`There are ${plan.scenes.length} scenes: it needs 26–38.`);
  const order = plan.scenes.map((s) => BEATS.indexOf(s.beat));
  if (order.some((b, i) => i && b < order[i - 1]!)) problems.push("The beats are out of order: hook, guess, step, imagine, recap, next.");
  for (const b of BEATS) if (!plan.scenes.some((s) => s.beat === b)) problems.push(`The beat "${b}" is missing.`);
  const hosts = plan.scenes.filter((s) => s.visual.kind === "host").length;
  if (hosts > plan.scenes.length / 2.5) problems.push(`${hosts} scenes are only the host talking: at most a third, the rest must show the answer.`);
  const names = new Set(plan.cast.map((c) => c.name));
  plan.scenes.forEach((sc, i) => {
    for (const p of sc.parts) {
      if (!names.has(p.who.trim())) problems.push(`Scene ${i + 1}: "${p.who}" speaks but is not in the cast.`);
      if (p.how.trim() && !moodOf(p.how)) problems.push(`Scene ${i + 1}: the way of speaking "${p.how}" is not in the list.`);
    }
    const line = toScript({ title: "", scenes: [sc], cast: [], facts: [], look: "" }).split("\n")[1]!;
    if (splitSpeakers(line).filter((x) => x.who).length !== sc.parts.length) problems.push(`Scene ${i + 1}: the lines do not read back (check for quotes or colons in the text).`);
  });
  const short = plan.shorts.map((n) => plan.scenes[n - 1]).filter(Boolean) as QAScene[];
  const sw = words(short);
  if (sw < 90 || sw > 190) problems.push(`The Short (scenes ${plan.shorts.join(", ")}) has ${sw} words: it needs about 120–160.`);
  return [...new Set(problems)];
}

/**
 * Write (or rewrite, with the user's notes) the script of a question job, fact-checked. Returns
 * the problems the checks left.
 */
export async function writeQA(slug: string, log: (s: string) => void = console.log): Promise<string[]> {
  let job = await loadJob(slug);
  const dir = jobDir(slug);
  const sources = await qaSources(job.topic, slug);
  await fs.writeFile(path.join(dir, "sources.json"), JSON.stringify(sources.map(({ title, url }) => ({ title, url })), null, 2));
  log(`  research: ${sources.map((s) => s.title).join(", ")}`);
  const notes = job.notes.filter((n) => n.on === "script").map((n) => n.text);
  const prevFile = path.join(dir, "script.txt");
  const previous = job.status === "rewrite" && (await fs.stat(prevFile).catch(() => null)) ? await fs.readFile(prevFile, "utf8") : undefined;
  const ask = { job: slug, system: SYSTEM };
  const { data, by } = await think<Omit<QAPlan, "cast" | "look">>({ ...ask, schema: SCHEMA, step: previous ? "qa-rewrite" : "qa-write", model: "opus", effort: "medium", prompt: prompt(job.topic, sources, previous ? notes : [], previous) }, log);
  let plan: QAPlan = { ...data, cast: [QA.host, QA.kid], look: "" };

  // The fact check: a second reader with only the sources and the script.
  const { data: fc } = await think<{ issues: { scene: number; quote: string; problem: string; fix: string }[] }>({ ...ask, schema: CHECK_SCHEMA, step: "qa-factcheck", model: "sonnet", effort: "medium", prompt: [
    "Fact-check this children's science/history script against the sources. List every statement that is wrong, not supported by the sources and not basic settled school knowledge, misleading by oversimplification, or unsafe for a child to copy. Quote it exactly, say the problem, and give the corrected sentence (same simple style). Do not list matters of style. An empty list is a fine answer.",
    "", "Script (scene number: text):",
    ...plan.scenes.map((s, i) => `${i + 1}: ${s.parts.map((p) => `${p.who}: ${p.text}`).join(" ")}`),
    "", "Sources:", ...sources.map((s) => `### ${s.title}\n${s.text}`),
  ].join("\n") }, log);
  log(`  fact check: ${fc.issues.length} issue(s)`);
  const problems0 = checkQA(plan);
  const local = problems0.filter((p) => /^Scene \d+:/.test(p));
  const toFix = [...new Set([...fc.issues.map((x) => x.scene - 1), ...local.map((p) => Number(/^Scene (\d+):/.exec(p)![1]) - 1)])].filter((i) => plan.scenes[i]);
  if (toFix.length) {
    log(`  fixing scene(s) ${toFix.map((i) => i + 1).join(", ")}`);
    const { data: fixed } = await think<{ scenes: { index: number; parts: Part[] }[] }>({ ...ask, schema: SCENES_SCHEMA, step: "qa-fix", model: "sonnet", prompt: [
      "Fix these scenes: apply the fact-check corrections and the format problems, keep everything else (tone, length, speakers). Return exactly these scenes with their index.",
      `Speakers: ${plan.cast.map((c) => c.name).join(", ")}. how chosen from: ${HOW}. No quotation marks or colons inside text.`,
      "Fact check:", ...fc.issues.map((x) => `- scene ${x.scene}: "${x.quote}" — ${x.problem} → ${x.fix}`),
      "Format:", ...local.map((p) => `- ${p}`), "",
      JSON.stringify(toFix.map((i) => ({ index: i + 1, parts: plan.scenes[i]!.parts }))),
    ].join("\n") }, log);
    for (const sc of fixed.scenes) if (plan.scenes[sc.index - 1]) plan.scenes[sc.index - 1]!.parts = sc.parts;
  }
  const problems = checkQA(plan);
  await fs.writeFile(path.join(dir, "factcheck.json"), JSON.stringify(fc, null, 2));
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, "script.txt"), toScript(plan));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ engine: "kokoro", voice: QA.narrator, speed: 1, imageGen: "off", onlineImages: false, profiles: ["16x9"], channel: QA.channel, voices: castVoicesEn(plan.cast, QA.narrator) }, null, 2));
  job = await loadJob(slug);
  job.by = by;
  await saveJob(job);
  return problems;
}

/** The four areas of questions, kept in balance by the proposer. */
export const AREAS = ["science & nature", "animals & the human body", "world history & geography", "how things work & are made"] as const;
export interface Question { question: string; area: (typeof AREAS)[number]; why: string }

/**
 * New questions for the channel: the brain proposes questions children really ask (and search
 * for), none already made, the areas with the fewest questions first (~6k tokens a batch).
 */
export async function proposeQuestions(count: number, made: { topic: string; area?: string }[], log?: (s: string) => void): Promise<Question[]> {
  const per = Object.fromEntries(AREAS.map((a) => [a, made.filter((m) => m.area === a).length]));
  const { data } = await think<{ questions: Question[] }>({
    job: "topics-qa", step: "propose-questions", model: "sonnet",
    system: `You plan the videos of "${QA.channel}", an animated YouTube channel that answers one question per video for children aged 6–12.`,
    schema: { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { question: { type: "string" }, area: { enum: [...AREAS] }, why: { type: "string" } }, required: ["question", "area", "why"] } } }, required: ["questions"] },
    prompt: [
      `Propose ${count} questions for the next videos.`,
      "- Questions children really ask and parents search for (Why…? How…? What…? Which…? When…?), each answerable in 5–8 minutes from Wikipedia-level sources, with a clear, true answer.",
      "- Visual: the answer can be shown with simple diagrams, places and comparisons.",
      "- Safe and friendly for children: no frightening, violent or medical-advice topics.",
      `- Balance the areas; so far: ${AREAS.map((a) => `${a} ${per[a]}`).join(", ")}. Give more to the areas with fewer.`,
      "- Not any of these (made or waiting), nor the same question in other words:",
      ...made.map((m) => `  - ${m.topic}`),
      "- why: one line on why children will click and watch to the end.",
    ].join("\n"),
  }, log);
  const seen = new Set(made.map((m) => m.topic.toLowerCase().replace(/[^a-z ]/g, "").trim()));
  return data.questions.filter((q) => !seen.has(q.question.toLowerCase().replace(/[^a-z ]/g, "").trim()));
}
