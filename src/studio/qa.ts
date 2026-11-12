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
import { castVoices, castVoicesEn, type CastMember } from "./cast.ts";
import { jobDir, loadJob, saveJob } from "./jobs.ts";
import { toScript, type Part } from "./write.ts";

/**
 * The question channels: one profile per language, the same two regulars (Huy explains, Mai
 * asks). "qa": Ask Huy, English (chosen 2026-11-10); "qa-vi": Hỏi Huy, Vietnamese.
 */
export interface QAProfile {
  kind: "qa" | "qa-vi";
  lang: "en" | "vi";
  /** The series' name (said in the greeting, on the thumbnail). */
  channel: string;
  /** The YouTube channel it is published on (said when inviting to subscribe): since 2026-11-12
   *  two channels, Huy Kể Chuyện (Vietnamese) and Ask Huy (English); Hỏi Huy is a series of the first. */
  home: string;
  brandId: string;
  host: CastMember;
  kid: CastMember;
  engine: "kokoro" | "vieneu";
  narrator: string;
  /** A calm pace for children (Kokoro at 1.0 is quick: ~200 words a minute). */
  speed: number;
  /** The ways of speaking the face library understands, in the script's language. */
  how: string;
  /** What the writer is told about the language of the lines. */
  write: string;
}
const HOST: CastMember = { name: "Huy", gender: "male", age: "young", role: "the host: curious, warm, a little funny; explains", villain: false };
const KID: CastMember = { name: "Mai", gender: "female", age: "child", role: "an 8-year-old who asks, guesses and tries things", villain: false };
export const PROFILES: Record<QAProfile["kind"], QAProfile> = {
  qa: { kind: "qa", lang: "en", channel: "Ask Huy", home: "Ask Huy", brandId: "ask-huy", host: HOST, kid: KID, engine: "kokoro", narrator: "am_michael", speed: 0.92,
    how: "happily, joyfully, laughing, surprised, worried, firmly, proudly, sadly, scared, tired", write: "Write every line in simple, natural English." },
  "qa-vi": { kind: "qa-vi", lang: "vi", channel: "Hỏi Huy", home: "Huy Kể Chuyện", brandId: "hoi-huy", host: HOST, kid: KID, engine: "vieneu", narrator: "Minh Đức", speed: 1.0,
    how: "vui vẻ, mừng rỡ, cười, ngạc nhiên, lo lắng, quyết tâm, tự hào, buồn rầu, sợ hãi, mệt",
    write: "Write every line in natural, warm Vietnamese for Vietnamese children (Huy calls the viewers \"các bạn\", Mai calls Huy \"anh Huy\"); explain in Vietnamese words, give the English or scientific word only when it helps. Examples and comparisons from Vietnamese children's life (a rice field, a motorbike, a bowl of phở). The checks below count words as written syllables." },
};
/** "Did you know?" Shorts (writeFact): the same channels, one fact in under a minute, made 9:16. */
export const isFact = (kind?: string) => kind === "fact" || kind === "fact-vi";
/** Every kind made by the question pipeline (qaproduce.ts): questions and facts, both languages. */
export const isQA = (kind?: string) => kind === "qa" || kind === "qa-vi" || isFact(kind) || kind === "lesson";
export const profileOf = (kind?: string): QAProfile => PROFILES[kind === "qa-vi" || kind === "fact-vi" || kind === "lesson" ? "qa-vi" : "qa"];
/** The English channel's profile (kept for the code that has one channel in mind). */
export const QA = PROFILES.qa;

export const BEATS = ["hook", "guess", "step", "imagine", "recap", "next"] as const;
/** What the explainer pictures can show (phase 2 builds them in the vector runtime). */
export const VISUALS = ["host", "scene", "diagram", "labels", "arrows", "map", "compare", "zoom", "count", "experiment"] as const;

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

/** "Ask Huy", an animated YouTube channel / "Hỏi Huy", a series of the YouTube channel "Huy Kể Chuyện". */
export const whatIs = (P: QAProfile) => (P.home === P.channel ? `"${P.channel}", an animated YouTube channel` : `"${P.channel}", an animated series of the YouTube channel "${P.home}"`);
/** Inviting to subscribe names the YouTube channel, not the series (children search for it). */
const subscribeRule = (P: QAProfile) => `- When inviting the viewers to subscribe or follow (in words or in a picture), name the YouTube channel "${P.home}"${P.home === P.channel ? "" : `, never "${P.channel}" (the series)`}.`;
const system = (P: QAProfile) => `You write scripts for ${whatIs(P)} for children aged 6–12 that answers one question per video (5–8 minutes). The host ${P.host.name} explains; ${P.kid.name}, 8, asks, guesses and tries things. ${P.write}

Rules:
- Correct above all: every claim must be supported by the sources given or be basic, settled school knowledge. Numbers rounded and said with "about". If the sources disagree or science is unsure, say so simply ("scientists think…").
- Simple words, short sentences, one idea at a time; explain any hard word the moment it appears; comparisons from a child's life (a football pitch, a school bus, a grain of rice).
- Warm and funny, never mocking a wrong guess: guessing is how scientists start.
- Safe: nothing dangerous to copy, no fire or chemicals at home, no medical advice; no gore or frightening detail.
- Every scene is one picture that can be drawn as a simple 2D explainer cartoon.
${subscribeRule(P)}`;

function prompt(P: QAProfile, question: string, sources: Source[], notes: string[], previous?: string): string {
  const QA = P, HOW = P.how;
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
    "Length: 28–40 scenes, about 1,050–1,400 words in all (5–8 minutes at a calm pace for children).",
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

/** A Vietnamese question's key words: "Vì sao bầu trời có màu xanh?" → "bầu trời màu xanh". */
export function viKeyWords(question: string): string {
  const q = question.replace(/[?!.,"']/g, " ").replace(/(^|\s)(tại sao|vì sao|làm thế nào|làm sao|như thế nào|thế nào|là gì|có thể|có|được|không|lại|của|những|các|một|nào|bao nhiêu)(?=\s|$)/gi, " ");
  return q.replace(/\s+/g, " ").trim() || question;
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
export async function qaSources(question: string, job = "qa-research", lang: "en" | "vi" = "en"): Promise<Source[]> {
  const query = lang === "vi" ? viKeyWords(question) : keyWords(question);
  let titles: string[] = [], viTitles: string[] = [];
  try {
    ({ data: { titles, vi: viTitles } } = await think<{ titles: string[]; vi: string[] }>({ job, step: "qa-sources", model: "haiku", system: "You know Wikipedia well.",
      schema: { type: "object", properties: { titles: { type: "array", items: { type: "string" } }, vi: { type: "array", items: { type: "string" } } }, required: ["titles", "vi"] },
      prompt: `Exact titles of the 4 English Wikipedia articles most useful to answer this question for children, most useful first, general articles before narrow ones${lang === "vi" ? "; and in vi the exact titles of the 3 most useful Vietnamese Wikipedia articles (vi.wikipedia.org)" : "; vi: an empty list"}: "${question}"` }));
  } catch { /* the search alone */ }
  // A Vietnamese question: the Vietnamese Wikipedia first, then the English one (named by the small model).
  const vi = lang === "vi" ? await research(question, { lang: "vi", count: 2, budget: 12_000, query, titles: viTitles ?? [] }) : [];
  const simple = lang === "vi" ? [] : await research(question, { lang: "simple", count: 2, budget: 10_000, query, titles });
  const en = await research(lang === "vi" ? `${question} (en)` : question, { lang: "en", count: 2, budget: 16_000, query: lang === "vi" ? titles[0] ?? query : query, titles, skip: simple.map((s) => s.title) });
  if (lang === "vi") return [...vi, ...en];
  return [...simple, ...en];
}

const words = (scenes: QAScene[]) => scenes.flatMap((s) => s.parts).reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);

/** What is wrong with a plan, in words the writer can fix. */
export function checkQA(plan: QAPlan): string[] {
  const problems: string[] = [];
  const w = words(plan.scenes);
  // Kokoro reads about 185 words a minute at speed 0.92: 1,050–1,400 words is 5.7–7.6 minutes.
  if (w < 950) problems.push(`The script is too short (${w} words): it needs about 1,050–1,400.`);
  if (w > 1550) problems.push(`The script is too long (${w} words): it needs about 1,050–1,400.`);
  if (plan.scenes.length < 24 || plan.scenes.length > 44) problems.push(`There are ${plan.scenes.length} scenes: it needs 28–40.`);
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
  const dir = jobDir(slug), P = profileOf(job.kind), HOW = P.how;
  const sources = await qaSources(job.topic, slug, P.lang);
  await fs.writeFile(path.join(dir, "sources.json"), JSON.stringify(sources.map(({ title, url }) => ({ title, url })), null, 2));
  log(`  research: ${sources.map((s) => s.title).join(", ")}`);
  const notes = job.notes.filter((n) => n.on === "script").map((n) => n.text);
  const prevFile = path.join(dir, "script.txt");
  const previous = job.status === "rewrite" && (await fs.stat(prevFile).catch(() => null)) ? await fs.readFile(prevFile, "utf8") : undefined;
  const ask = { job: slug, system: system(P) };
  const { data, by } = await think<Omit<QAPlan, "cast" | "look">>({ ...ask, schema: SCHEMA, step: previous ? "qa-rewrite" : "qa-write", model: "opus", effort: "medium", prompt: prompt(P, job.topic, sources, previous ? notes : [], previous) }, log);
  let plan: QAPlan = { ...data, cast: [P.host, P.kid], look: "" };

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
      `Speakers: ${plan.cast.map((c) => c.name).join(", ")}. how chosen from: ${HOW}. No quotation marks or colons inside text. ${P.write}`,
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
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ engine: P.engine, voice: P.narrator, speed: P.speed, imageGen: "off", onlineImages: false, profiles: ["16x9"], channel: P.channel, voices: P.engine === "kokoro" ? castVoicesEn(plan.cast, P.narrator) : castVoices(plan.cast, P.narrator) }, null, 2));
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
export async function proposeQuestions(count: number, made: { topic: string; area?: string }[], log?: (s: string) => void, kind: QAProfile["kind"] = "qa", hints: string[] = []): Promise<Question[]> {
  const P = PROFILES[kind];
  const per = Object.fromEntries(AREAS.map((a) => [a, made.filter((m) => m.area === a).length]));
  const { data } = await think<{ questions: Question[] }>({
    job: `topics-${kind}`, step: "propose-questions", model: "sonnet",
    system: `You plan the videos of ${whatIs(P)} that answers one question per video for children aged 6–12${P.lang === "vi" ? ", in Vietnamese, for Vietnamese children" : ""}.`,
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
      ...(P.lang === "vi" ? ["- Write each question in natural Vietnamese, as a Vietnamese child would ask it (Vì sao…? Tại sao…? Làm thế nào…? … là gì?); include some about Vietnam itself (its nature, animals, inventions, places) as well as universal ones."] : []),
      ...(hints.length ? ["- What is in season or trending now (use when it fits, never forced):", ...hints.map((h) => `  - ${h}`)] : []),
    ].join("\n"),
  }, log);
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L} ]/gu, "").replace(/\s+/g, " ").trim();
  const seen = new Set(made.map((m) => norm(m.topic)));
  return data.questions.filter((q) => !seen.has(norm(q.question))).slice(0, count);
}


// ── "Did you know?" Shorts ──────────────────────────────────────────────────────────────────

const FACT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" }, question: { type: "string" }, answer: { type: "string" },
    scenes: { type: "array", items: SCENE },
    facts: { type: "array", items: { type: "object", properties: { claim: { type: "string" }, source: { type: "string" } }, required: ["claim", "source"] } },
    description: { type: "string" },
  },
  required: ["title", "question", "answer", "scenes", "facts", "description"],
};

/** What is wrong with a Short's plan. */
export function checkFact(plan: QAPlan): string[] {
  const problems: string[] = [];
  const w = words(plan.scenes);
  if (w < 85) problems.push(`The Short is too short (${w} words): it needs about 100–140.`);
  if (w > 165) problems.push(`The Short is too long (${w} words): it needs about 100–140.`);
  if (plan.scenes.length < 4 || plan.scenes.length > 10) problems.push(`There are ${plan.scenes.length} scenes: it needs 5–8.`);
  for (const b of ["hook", "step", "recap"] as const) if (!plan.scenes.some((s) => s.beat === b)) problems.push(`The beat "${b}" is missing.`);
  const names = new Set(plan.cast.map((c) => c.name));
  plan.scenes.forEach((sc, i) => {
    for (const p of sc.parts) {
      if (!names.has(p.who.trim())) problems.push(`Scene ${i + 1}: "${p.who}" speaks but is not in the cast.`);
      if (p.how.trim() && !moodOf(p.how)) problems.push(`Scene ${i + 1}: the way of speaking "${p.how}" is not in the list.`);
    }
  });
  return [...new Set(problems)];
}

/**
 * Write a "Did you know?" Short: one surprising, true fact told in 40–55 seconds (hook, the
 * fact explained in a few pictures, a wow ending), fact-checked like the long videos but with
 * the smaller model (~25k tokens in all).
 */
export async function writeFact(slug: string, log: (s: string) => void = console.log): Promise<string[]> {
  let job = await loadJob(slug);
  const dir = jobDir(slug), P = profileOf(job.kind);
  const sources = (await qaSources(job.topic, slug, P.lang)).map((s) => ({ ...s, text: s.text.slice(0, 5000) }));
  await fs.writeFile(path.join(dir, "sources.json"), JSON.stringify(sources.map(({ title, url }) => ({ title, url })), null, 2));
  log(`  research: ${sources.map((s) => s.title).join(", ")}`);
  const notes = job.notes.filter((n) => n.on === "script").map((n) => n.text);
  const ask = { job: slug, system: system(P) };
  const { data, by } = await think<Omit<QAPlan, "cast" | "look" | "shorts" | "thumbnail">>({ ...ask, schema: FACT_SCHEMA, step: "fact-write", model: "sonnet", effort: "medium", prompt: [
    `Write a YouTube Short (40–55 seconds, vertical) that tells one surprising, true fact for children: "${job.topic}"`,
    "Beats: hook (1 scene: the fact as a question, \"Did you know…?\" or its equivalent, said with wonder), step (3–6 scenes: why it is true, one simple picture each), recap (1 scene: a wow line and an invitation to follow the channel for more).",
    `About 100–140 words in all. Speakers: ${P.host.name} and ${P.kid.name} only; how chosen from: ${P.how}. No quotation marks or colons inside text.`,
    "visual: kind and what to draw, as for the long videos (host, scene, diagram, labels, arrows, map, compare, zoom, count, experiment); most scenes show the fact, not the host.",
    "title: the fact as a short, catchy line (under 60 characters). question: the fact as a question. answer: the fact in one sentence. facts: each claim with its source title. description: one or two sentences.",
    ...(notes.length ? ["", "Notes to follow:", ...notes.map((n) => `- ${n}`)] : []),
    "", "Sources:", ...sources.map((s) => `### ${s.title} (${s.url})\n${s.text}`),
  ].join("\n") }, log);
  let plan: QAPlan = { ...data, cast: [P.host, P.kid], look: "", shorts: [], thumbnail: "" };
  const { data: fc } = await think<{ issues: { scene: number; quote: string; problem: string; fix: string }[] }>({ ...ask, schema: CHECK_SCHEMA, step: "fact-check", model: "sonnet", prompt: [
    "Fact-check this children's Short against the sources: list every statement that is wrong, unsupported, misleading or unsafe, quoted exactly, with the corrected sentence. An empty list is a fine answer.",
    "", ...plan.scenes.map((s, i) => `${i + 1}: ${s.parts.map((p) => `${p.who}: ${p.text}`).join(" ")}`),
    "", "Sources:", ...sources.map((s) => `### ${s.title}\n${s.text}`),
  ].join("\n") }, log);
  log(`  fact check: ${fc.issues.length} issue(s)`);
  if (fc.issues.length) {
    const toFix = [...new Set(fc.issues.map((x) => x.scene - 1))].filter((i) => plan.scenes[i]);
    const { data: fixed } = await think<{ scenes: { index: number; parts: Part[] }[] }>({ ...ask, schema: SCENES_SCHEMA, step: "fact-fix", model: "sonnet", prompt: [
      `Apply these corrections to the scenes, keep everything else. Return exactly these scenes with their index. how chosen from: ${P.how}. ${P.write}`,
      ...fc.issues.map((x) => `- scene ${x.scene}: "${x.quote}" — ${x.problem} → ${x.fix}`), "",
      JSON.stringify(toFix.map((i) => ({ index: i + 1, parts: plan.scenes[i]!.parts }))),
    ].join("\n") }, log);
    for (const sc of fixed.scenes) if (plan.scenes[sc.index - 1]) plan.scenes[sc.index - 1]!.parts = sc.parts;
  }
  const problems = checkFact(plan);
  await fs.writeFile(path.join(dir, "factcheck.json"), JSON.stringify(fc, null, 2));
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(dir, "script.txt"), toScript(plan));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ engine: P.engine, voice: P.narrator, speed: P.speed, imageGen: "off", onlineImages: false, profiles: ["9x16"], channel: P.channel, voices: P.engine === "kokoro" ? castVoicesEn(plan.cast, P.narrator) : castVoices(plan.cast, P.narrator) }, null, 2));
  job = await loadJob(slug);
  job.by = by;
  await saveJob(job);
  return problems;
}

/** Facts for the Shorts: surprising, true, explainable in under a minute (~4k tokens a batch). */
export async function proposeFacts(count: number, made: { topic: string }[], log?: (s: string) => void, kind: "fact" | "fact-vi" = "fact", hints: string[] = []): Promise<Question[]> {
  const P = profileOf(kind);
  const { data } = await think<{ questions: Question[] }>({
    job: `topics-${kind}`, step: "propose-facts", model: "sonnet",
    system: `You plan the "Did you know?" Shorts of ${whatIs(P)} for children aged 6–12${P.lang === "vi" ? ", in Vietnamese" : ""}.`,
    schema: { type: "object", properties: { questions: { type: "array", items: { type: "object", properties: { question: { type: "string" }, area: { enum: [...AREAS] }, why: { type: "string" } }, required: ["question", "area", "why"] } } }, required: ["questions"] },
    prompt: [
      `Propose ${count} facts for the next Shorts. question = the fact as a short headline${P.lang === "vi" ? " in Vietnamese (\"Bạn có biết…?\")" : " (\"Did you know…?\")"}.`,
      "- Surprising, true and checkable on Wikipedia; the kind children repeat to their friends; safe and friendly.",
      "- Each can be shown with one or two simple pictures; mix the areas.",
      "- Not any of these, nor the same fact in other words:", ...made.map((m) => `  - ${m.topic}`),
      ...(hints.length ? ["- In season or trending now (when it fits):", ...hints.map((h) => `  - ${h}`)] : []),
    ].join("\n"),
  }, log);
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L} ]/gu, "").replace(/\s+/g, " ").trim();
  const seen = new Set(made.map((m) => norm(m.topic)));
  return data.questions.filter((q) => !seen.has(norm(q.question))).slice(0, count);
}
