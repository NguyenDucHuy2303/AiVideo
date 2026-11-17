/**
 * "Học tiếng Anh cùng Huy" as stories (16/11/2026): each lesson is its own episode, written by
 * the brain like a little film — a problem, a journey, a funny twist, an end — with four to six
 * English words that come out of the story itself: the thing or the animal appears, often says
 * its own name in English, the four say it, the viewers say it in a pause. No board, no shared
 * format. The brain writes the story and a few beats in plain words; staging.ts turns them into
 * the scenes (no tokens); every English recording is heard back by Whisper (englishcheck.ts).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { langRuns, unmark } from "../tts/narrate.ts";
import { partsOf, NAME_OF, type Beat, type Do, type Episode } from "./staging.ts";

const DOES: Do[] = ["enter", "exit", "walk_to", "carry", "put", "give", "crouch", "stand", "open", "pop_out", "shake", "appear", "vanish", "fall", "get_up", "jump", "cheer", "wave", "point", "worry", "laugh", "talk", "idle", "run_around", "look", "clap", "dance", "kick", "hop", "peek", "knock", "hug", "pick_up", "nod", "search"];
/** Animals with a rig of their own (animals.js, critters.js); anything else is an emoji item. */
export const ANIMALS = ["buffalo", "tiger", "elephant", "dog", "cat", "rabbit", "fox", "turtle", "deer", "goat", "mouse", "crow", "chicken", "fish", "frog", "ant"];
const FACES = ["happy", "joy", "laugh", "surprised", "worried", "scared", "sad", "proud", "determined", "neutral"];

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    youtubeTitle: { type: "string" },
    words: { type: "array", items: { type: "object", properties: { en: { type: "string" }, vi: { type: "string" }, thing: { type: "string" } }, required: ["en", "vi", "thing"] } },
    things: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { enum: ["item", "animal"] }, icon: { type: "string" }, species: { type: "string" }, speaker: { type: "string" } }, required: ["id", "kind"] } },
    places: { type: "object", additionalProperties: { type: "string" } },
    scenes: { type: "array", items: { type: "object", properties: {
      place: { type: "string" }, say: { type: "string" },
      beats: { type: "array", items: { type: "object", properties: { line: { type: "number" }, after: { type: "boolean" }, do: { enum: DOES }, who: { type: "string" }, what: { type: "string" }, to: { type: "string" }, from: { enum: ["left", "right"] }, face: { enum: FACES } }, required: ["line", "do"] } },
    }, required: ["place", "say", "beats"] } },
    thumbnail: { type: "string" },
    description: { type: "string" },
  },
  required: ["title", "youtubeTitle", "words", "things", "places", "scenes", "thumbnail", "description"],
};

export type Written = Episode & { youtubeTitle: string; thumbnail: string; description?: string };

const SYSTEM = [
  "You write episodes of a Vietnamese cartoon that teaches English to children aged 4–8, as short stories acted in real places — never a lesson at a board.",
  "The four, in every scene, all of them, the whole time: Huy (25, the big brother, warm and calm, guides), Hùng (21, his brother, purple shirt, playful, the helper who brings things and plays tricks), Bối (8, a girl, curious and brave), Beo (5, the little brother, funny, easily startled, says naive things).",
].join("\n");

/** The writer's brief: the story, its English, the beats staging.ts knows. */
function brief(topic: string, words: string): string {
  return [
    `Write one episode about: ${topic}. ${words ? `The English words: ${words}.` : "Choose 4–6 simple English words (concrete nouns a child can see: animals, toys, food, things at home)."}`,
    "STORY: one problem or surprise from the very first line (no greeting, no studio), a journey of 3–5 moments, one funny twist, a warm end. 12–18 scenes, about 3–4 minutes in all. Every scene moves the story on.",
    "WORDS: each English word is a thing in the story (an item or an animal). It appears in the action and, when it can, says its own name in English (an animal: \"Woof! I am a dog!\"; a talking toy: \"Hi! I am a ball!\"). A child repeats it, then one of the four asks the viewers to say it, then a pause \"[3s]\", then praise. Every word once like that, its first time.",
    "END: the story closes; then a quick chant to recall the words: each thing appears again (beat appear) and says its name, the four repeat it in rhythm; then Huy says, in the place: \"Các bạn nhớ bấm đăng ký kênh Huy Kể Chuyện để xem tập sau nhé!\" and someone teases the next episode.",
    "LINES (\"say\" of a scene): only spoken lines and pauses, no narrator: `Bối (vui vẻ): \"…\" Beo (ngạc nhiên): \"…\" [2s] …`. who = Huy, Hùng, Bối, Beo or a talking thing's speaker name. how in Vietnamese (vui vẻ, ngạc nhiên, lo lắng, cười, sợ hãi, tinh nghịch, tự hào). Vietnamese lines, short (at most 14 words), as children and their brothers really talk. English inside a Vietnamese line ALWAYS between asterisks: \"*Cat!* Là con mèo!\", \"Các bạn nói cùng Bối nào: *Cat!*\". A line wholly in English has no asterisks and is said in English (\"Meow! I am a cat!\"). Simple, correct English only, and never a Vietnamese name inside English (\"Meow! You are funny!\", not \"Meow! Beo is funny!\"): the English voice cannot say it. Put \"[2s]\" (1–3 s) where something happens without words (someone walks in, a box shakes, a cat jumps out).",
    "THINGS: an animal uses its own puppet, kind \"animal\", species one of: " + ANIMALS.join(", ") + ". Anything else is kind \"item\" with icon = a plain English emoji name (\"wrapped gift\", \"red apple\", \"soccer ball\", \"teddy bear\", \"school backpack\"). At most two things talk (speaker = their name in the lines, e.g. \"Hộp quà\", \"Mèo\"). id: a short lowercase name (gift, cat, apple).",
    "PLACES: 1–3 places, keys short (living, garden, kitchen), values one English sentence for the painter: a bright modern Vietnamese home or place, no people (\"a bright cozy modern living room: a sofa, a rug, a big window, a front door\").",
    "BEATS (what happens, staged by the program): each {line, do, who?, what?, to?, from?, after?, face?}. line = the part of the scene's say it starts with, counting from 1 (every spoken line and every [Ns] pause is one part); line 0 = the scene's very start; after = true: as that part ends. do:",
    "  enter (who, from left|right, what = a thing they carry in, to = a thing to stop by) · exit (who) · walk_to (who, to = a thing, one of the four, or \"home\") · carry (who, what) · put (who, what: sets it down in front) · give (who, what, to) · crouch (who) · stand (who)",
    "  open (what = an item: it bursts open) · pop_out (what = what jumps out, to = the item it comes out of) · shake (what: an item wobbles during that part) · appear (what) · vanish (what) · run_around (what = an animal)",
    "  fall · get_up · jump · cheer · wave · point · worry · laugh · talk · idle · clap · dance · hop (small happy jumps) · peek (lean to look round) · knock (at a door) · nod · search (look about for something) (who), look (who, to)",
    "  pick_up (who, what: picks it up, holds it) · hug (who, what) · kick (who, what: kicks a ball away). face: " + FACES.join(", ") + ".",
    "  who for the four: Huy, Hùng, Bối, Beo. Give each scene 2–6 beats: the four must DO things, not only talk. Things start hidden unless they appear, enter carried, or pop out.",
    "Also: youtubeTitle (Vietnamese, with the words in English, under 90 characters), thumbnail (3–5 Vietnamese words for the picture), description (2–3 Vietnamese sentences for parents: the story in a line and the English words taught).",
  ].join("\n");
}

/** What is wrong with an episode, in words the writer can fix. */
export function checkEpisode(ep: Written): string[] {
  const p: string[] = [];
  const things = new Set(ep.things.map((t) => t.id)), speakers = new Set([...Object.values(NAME_OF), ...ep.things.map((t) => t.speaker).filter(Boolean) as string[]]);
  if (ep.scenes.length < 10 || ep.scenes.length > 20) p.push(`${ep.scenes.length} scenes: write 12–18.`);
  if (ep.words.length < 3 || ep.words.length > 7) p.push(`${ep.words.length} words: teach 4–6.`);
  for (const t of ep.things) if (t.kind === "animal" && !ANIMALS.includes(t.species ?? "")) p.push(`Thing ${t.id}: species "${t.species}" has no puppet; use one of ${ANIMALS.join(", ")} or make it an item.`);
  if (ep.things.filter((t) => t.speaker).length > 2) p.push("More than two talking things: keep at most two.");
  for (const w of ep.words) if (!things.has(w.thing ?? "")) p.push(`Word "${w.en}": its thing "${w.thing}" is not in things.`);
  ep.scenes.forEach((sc, i) => {
    const n = i + 1, parts = partsOf(sc.say);
    if (!ep.places[sc.place]) p.push(`Scene ${n}: place "${sc.place}" is not in places.`);
    if (!parts.length) p.push(`Scene ${n}: no lines.`);
    for (const x of parts) {
      if (x.pause) continue;
      if (!x.who) p.push(`Scene ${n}: "${x.text.slice(0, 40)}" has no speaker (no narrator in these episodes).`);
      else if (!speakers.has(x.who)) p.push(`Scene ${n}: speaker "${x.who}" is neither one of the four nor a talking thing.`);
      // English inside Vietnamese must be marked; marked English must be English.
      const plain = unmark(x.text), vi = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(plain);
      if (vi) for (const w of ep.words) if (new RegExp(`\\b${w.en}\\b`, "i").test(plain) && !langRuns(x.text).some((r) => r.en && new RegExp(`\\b${w.en}\\b`, "i").test(r.text))) p.push(`Scene ${n}: "${w.en}" inside a Vietnamese line must be between asterisks (*${w.en}*).`);
      for (const r of langRuns(x.text)) if (r.en && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(r.text)) p.push(`Scene ${n}: "*${r.text}*" is marked English but is Vietnamese.`);
      // a Vietnamese name in English is read wrong by the English voices
      const english = [...langRuns(x.text).filter((r) => r.en).map((r) => r.text), ...(!vi ? [plain] : [])].join(" ");
      if (/\b(Huy|Hùng|Hung|Bối|Boi|Beo)\b/i.test(english)) p.push(`Scene ${n}: "${english.slice(0, 50)}": no Vietnamese name (Huy, Hùng, Bối, Beo) inside English; say it in Vietnamese or leave the name out.`);
      if (plain.split(/\s+/).length > 18) p.push(`Scene ${n}: a line of ${plain.split(/\s+/).length} words; at most 14.`);
    }
    for (const b of sc.beats) {
      if (b.line > parts.length) p.push(`Scene ${n}: a beat on line ${b.line}, but the scene has ${parts.length} parts.`);
      const needWho = !["open", "pop_out", "shake", "appear", "vanish", "run_around"].includes(b.do);
      if (needWho && !Object.values(NAME_OF).includes(b.who ?? "")) p.push(`Scene ${n}: beat "${b.do}" needs who = Huy, Hùng, Bối or Beo.`);
      if (["carry", "put", "give", "open", "pop_out", "shake", "appear", "vanish", "run_around", "pick_up", "kick"].includes(b.do) && !things.has(b.what ?? "")) p.push(`Scene ${n}: beat "${b.do}" on "${b.what}", not a thing.`);
    }
  });
  const pauses = ep.scenes.flatMap((s) => partsOf(s.say)).filter((x) => x.pause && x.pause >= 2.5).length;
  if (pauses < ep.words.length) p.push(`${pauses} pauses for the viewers ([3s]) for ${ep.words.length} words: one per word.`);
  return p;
}

/** The episode, written (and fixed once by the writer if it breaks a rule). */
export async function writeEpisode(slug: string, topic: string, words = "", log: (s: string) => void = () => {}): Promise<Written> {
  let { data } = await think<Written>({ job: slug, system: SYSTEM, schema: SCHEMA, step: "episode-write", model: "sonnet", effort: "medium", prompt: brief(topic, words) }, log);
  const problems = checkEpisode(data);
  if (problems.length) {
    log(`  episode: ${problems.length} problems, writing again`);
    ({ data } = await think<Written>({ job: slug, system: SYSTEM, schema: SCHEMA, step: "episode-fix", model: "sonnet", effort: "medium", prompt: `${brief(topic, words)}\n\nYour episode:\n${JSON.stringify(data)}\n\nFix these, change nothing else:\n- ${problems.join("\n- ")}` }, log));
  }
  return data;
}

/** Every English of the episode: the words (with their meaning and picture) and each English line or run, by scene. */
export function englishOf(ep: Episode): { scene: number; who: string; text: string }[] {
  const out: { scene: number; who: string; text: string }[] = [];
  ep.scenes.forEach((sc, i) => {
    for (const p of partsOf(sc.say)) {
      if (p.pause || !p.who) continue;
      const runs = langRuns(p.text);
      if (runs.some((r) => r.en)) for (const r of runs) { if (r.en) out.push({ scene: i + 1, who: p.who, text: r.text }); }
      else if (!/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(p.text)) out.push({ scene: i + 1, who: p.who, text: p.text });
    }
  });
  return out;
}

/**
 * The English made right before any voice is made (the user, 16/11/2026: "the words must be 100 %
 * correct"): the dictionary first (no tokens), then an English teacher's reading (the brain,
 * a few thousand tokens): spelling, grammar, natural for children, each word's Vietnamese
 * meaning, the picture fitting the word. Its fixes are put in; what is still unknown to the
 * dictionary stops the episode.
 */
export async function reviewEnglish(slug: string, ep: Written, log: (s: string) => void = () => {}): Promise<{ fixes: string[] }> {
  const { misspelled } = await import("../audio/englishcheck.ts");
  const names = [...Object.values(NAME_OF), "Huy", "Hung", "Boi", "Teddy", ...ep.things.map((t) => t.speaker ?? "")].filter(Boolean);
  const lines = englishOf(ep);
  const unknown: string[] = [];
  for (const l of lines) for (const w of await misspelled(l.text, names)) unknown.push(`scene ${l.scene} ${l.who}: "${w}" in "${l.text}"`);
  for (const w of ep.words) for (const x of await misspelled(w.en, names)) unknown.push(`word "${x}"`);
  const { data } = await think<{ lines: { scene: number; quote: string; fix: string; problem: string }[]; words: { en: string; fixEn: string; fixVi: string; problem: string }[] }>({
    job: slug, step: "episode-english", model: "sonnet", effort: "low",
    system: "You are a careful English teacher checking the English of a cartoon for Vietnamese children aged 4–8. Children learn exactly what they hear and see, so every English word must be 100% right.",
    schema: { type: "object", properties: {
      lines: { type: "array", items: { type: "object", properties: { scene: { type: "number" }, quote: { type: "string" }, fix: { type: "string" }, problem: { type: "string" } }, required: ["scene", "quote", "fix", "problem"] } },
      words: { type: "array", items: { type: "object", properties: { en: { type: "string" }, fixEn: { type: "string" }, fixVi: { type: "string" }, problem: { type: "string" } }, required: ["en", "fixEn", "fixVi", "problem"] } },
    }, required: ["lines", "words"] },
    prompt: [
      "Check and list ONLY real mistakes (an empty list when all is right):",
      "- each English line: spelling, grammar, natural simple English a native speaker would say to a child, punctuation; the sound an animal makes fits the animal;",
      "- each taught word: the English is the usual word for the thing, its Vietnamese meaning is right and simple, the picture named fits it.",
      "For a line give quote = the exact English text as written below and fix = the corrected English text (same meaning). For a word give fixEn and fixVi (the same as before when that part is right).",
      unknown.length ? `The dictionary does not know: ${unknown.join("; ")}.` : "",
      "",
      "WORDS:", ...ep.words.map((w) => `${w.en} = ${w.vi} (picture: ${ep.things.find((t) => t.id === w.thing)?.icon ?? ep.things.find((t) => t.id === w.thing)?.species ?? w.thing})`),
      "", "ENGLISH LINES:", ...lines.map((l) => `scene ${l.scene}, ${l.who}: ${l.text}`),
    ].filter(Boolean).join("\n"),
  }, log);
  const fixes: string[] = [];
  for (const f of data.lines) {
    const sc = ep.scenes[f.scene - 1];
    if (!sc || !f.fix.trim() || f.fix === f.quote || !sc.say.includes(f.quote)) continue;
    sc.say = sc.say.split(f.quote).join(f.fix.trim());
    fixes.push(`cảnh ${f.scene}: "${f.quote}" → "${f.fix}" (${f.problem})`);
  }
  for (const f of data.words) {
    const w = ep.words.find((x) => x.en.toLowerCase() === f.en.toLowerCase());
    if (!w) continue;
    if (f.fixVi.trim() && f.fixVi !== w.vi) { fixes.push(`nghĩa "${w.en}": "${w.vi}" → "${f.fixVi}" (${f.problem})`); w.vi = f.fixVi.trim(); }
    if (f.fixEn.trim() && f.fixEn.toLowerCase() !== w.en.toLowerCase()) fixes.push(`từ "${w.en}": nên là "${f.fixEn}" (${f.problem}) — chưa đổi, cần viết lại tập`);
  }
  // what the dictionary still does not know stops it
  const still: string[] = [];
  for (const l of englishOf(ep)) for (const w of await misspelled(l.text, names)) still.push(`"${w}" (cảnh ${l.scene})`);
  if (still.length) throw new Error(`tiếng Anh chưa chắc đúng chính tả: ${still.join(", ")}`);
  return { fixes };
}


/**
 * The studio's writing step for an English lesson (job kind "lesson", 16/11/2026): the episode,
 * its English made right, and what the review page and the daily pick read (script.txt, plan.json).
 * Returns the problems still left.
 */
export async function writeLessonEpisode(slug: string, log: (s: string) => void = () => {}): Promise<string[]> {
  const { jobDir, loadJob } = await import("./jobs.ts");
  const job = await loadJob(slug), dir = jobDir(slug);
  const topicFile = path.join(dir, "topic.json");
  const topic = await fs.readFile(topicFile, "utf8").then((t) => JSON.parse(t)).catch(() => ({}));
  const ep = await writeEpisode(slug, job.topic, topic.words ?? "", log);
  const { fixes } = await reviewEnglish(slug, ep, log);
  for (const f of fixes) log(`  sửa tiếng Anh: ${f}`);
  (ep as { englishReviewed?: string[] }).englishReviewed = fixes;
  await lessonFiles(dir, ep);
  return checkEpisode(ep);
}

/** The episode in a job's folder, with what the review page, the pick and the YouTube words read. */
export async function lessonFiles(dir: string, ep: Written): Promise<void> {
  await saveEpisode(dir, ep);
  const say = (t: string) => t.replace(/\s+/g, " ").trim();
  await fs.writeFile(path.join(dir, "script.txt"), [ep.youtubeTitle, ...ep.scenes.map((s) => say(s.say))].join("\n") + "\n");
  const plan = {
    title: ep.youtubeTitle, answer: ep.words.map((w) => `${w.en} = ${w.vi}`).join(", "), description: ep.description ?? "", thumbnail: ep.thumbnail,
    words: ep.words.map(({ en, vi }) => ({ en, vi })), story: true,
    scenes: ep.scenes.map((s) => ({ beat: s.place, parts: partsOf(s.say).map((p) => p.pause ? { who: "", how: "", text: `[${p.pause}s]` } : { who: p.who ?? "", how: "", text: unmark(p.text) }) })),
    cast: [{ name: "Huy", role: "anh cả" }, { name: "Hùng", role: "em trai" }, { name: "Bối", role: "bé gái 8 tuổi" }, { name: "Beo", role: "bé trai 5 tuổi" }, ...ep.things.filter((t) => t.speaker).map((t) => ({ name: t.speaker!, role: t.kind === "animal" ? t.species ?? "" : t.icon ?? "" }))],
    facts: [],
  };
  await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
}

export type { Beat };
export async function saveEpisode(dir: string, ep: Written): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "episode.json"), JSON.stringify(ep, null, 2));
}

/** The four's voices: Vietnamese (VieNeu), and English ones that read English right (englishcheck.ts, 16/11/2026). */
export const VOICES = {
  Huy: "Thiện Minh", "Hùng": "Thanh Bình", "Bối": { voice: "Ngọc Linh", pitch: 4 }, Beo: { voice: "Mai Anh", pitch: 4 },
  "Huy@en": { voice: "am_michael", engine: "kokoro", speed: 0.88 }, "Hùng@en": { voice: "bm_lewis", engine: "kokoro", speed: 0.88 },
  "Bối@en": { voice: "af_heart", engine: "kokoro", pitch: 3, speed: 0.88 }, "Beo@en": { voice: "af_heart", engine: "kokoro", pitch: 2, speed: 0.92 },
} as Record<string, unknown>;

/**
 * The film's project from the episode: voices (built, and the English heard back), the staged
 * scenes, the paintings of its places. Then story.ts renders it like any film.
 */
export async function buildEpisode(dir: string, ep: Written, log: (s: string) => void = () => {}): Promise<{ english: { meant: string; heard: string }[] }> {
  const { stageEpisode, thingVoices } = await import("./staging.ts");
  const { backdropOfPlace } = await import("../animation/backdrops.ts");
  const { styleOf } = await import("../animation/styles.ts");
  const { LOOKS } = await import("./qaproduce.ts");
  // the English made right before anything is said (reviewEnglish), once
  if (!(ep as { englishReviewed?: string[] }).englishReviewed) {
    log("  English review");
    const { fixes } = await reviewEnglish(path.basename(dir), ep, log);
    for (const f of fixes) log(`  sửa tiếng Anh: ${f}`);
    (ep as { englishReviewed?: string[] }).englishReviewed = fixes;
  }
  await saveEpisode(dir, ep);
  const tv = thingVoices(ep);
  const project = {
    engine: "vieneu", voice: "Minh Đức", speed: 1, imageGen: "off", onlineImages: false, profiles: ["16x9"], channel: "Huy Kể Chuyện", style: "hien_dai", title: ep.title,
    brand: { intro: "none" }, thumbnail: { title: ep.thumbnail || ep.title, subtitle: "Học tiếng Anh cùng Huy" }, words: ep.words.map((w) => w.en),
    voices: { ...VOICES, ...tv.voices }, speakers: { Huy: ["huy"], "Hùng": ["hung"], "Bối": ["boi"], Beo: ["beo"], ...tv.speakers },
  };
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(project, null, 2));
  await fs.writeFile(path.join(dir, "storyboard.json"), JSON.stringify({ title: ep.title, kind: "story", scenes: ep.scenes.map((s) => ({ narration: s.say, chapter: ep.title, onScreen: {}, visual: { description: s.place, mood: "calm" }, camera: "ken_burns", transition: "cut" })) }, null, 2));
  // The voices, their English heard back and set right (voicefix.ts); still wrong: it stops here.
  const { voicesChecked } = await import("../audio/voicefix.ts");
  const bad = await voicesChecked(dir, log);
  const timeline = JSON.parse(await fs.readFile(path.join(dir, "timeline.json"), "utf8"));
  const anim = path.join(dir, "anim");
  await fs.mkdir(anim, { recursive: true });
  await fs.writeFile(path.join(anim, "cast.json"), JSON.stringify(LOOKS, null, 2));
  const painted: Record<string, unknown> = {};
  for (const [key, text] of Object.entries(ep.places)) {
    log(`  painting: ${key}`);
    const file = await backdropOfPlace(text, "day", "hien_dai");
    painted[key] = file ? { src: `file://${file}`, size: [768, 448] } : false;
  }
  const scenes = stageEpisode(ep, timeline);
  const look = styleOf("hien_dai").look;
  for (const [i, s] of scenes.entries()) {
    const sc = { ...s, style: "hien_dai", styleLook: look, backdrop: painted[ep.scenes[i]!.place] ?? false };
    await fs.writeFile(path.join(anim, `s${String(i + 1).padStart(2, "0")}.json`), JSON.stringify(sc, null, 2));
  }
  return { english: bad.map((b) => ({ meant: b.meant, heard: b.heard })) };
}
