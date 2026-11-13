/**
 * The words that go with a story on YouTube (stories only: Q&A and lessons get theirs from the
 * script writer). One small call when the film is prepared, kept in copy.json:
 *
 *   vi       the Vietnamese description: 2–3 sentences that make a child (and a parent) want to
 *            watch, without telling the ending, then the lesson
 *   en       the same for the English version (Huy Tells Tales, on Ask Huy)
 *   sources  which of the research pages really are about this story (the search brings odd
 *            ones: a Korean TV series under "Ếch ngồi đáy giếng")
 *
 * About 4–6k tokens a story (Sonnet, low effort). publish.ts reads it; without it (no brain),
 * the description falls back to the summary and the sources to a name match.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { jobDir, loadJob } from "./jobs.ts";

export interface StoryCopy { vi: string; en: string; sources: number[]; at: string }

const SCHEMA = {
  type: "object",
  properties: {
    vi: { type: "string" },
    en: { type: "string" },
    sources: { type: "array", items: { type: "number" } },
  },
  required: ["vi", "en", "sources"],
};

const exists = (p: string) => fs.access(p).then(() => true, () => false);
export const copyFile = (slug: string) => path.join(jobDir(slug), "copy.json");
export async function storyCopy(slug: string): Promise<StoryCopy | undefined> {
  return (await exists(copyFile(slug))) ? JSON.parse(await fs.readFile(copyFile(slug), "utf8")) : undefined;
}

/** Write copy.json for a story (once; `again` to write it anew). */
export async function writeStoryCopy(slug: string, log: (s: string) => void = console.log, again = false): Promise<StoryCopy | undefined> {
  if (!again && (await storyCopy(slug))) return storyCopy(slug);
  const job = await loadJob(slug), dir = jobDir(slug);
  const read = (f: string) => fs.readFile(path.join(dir, f), "utf8").catch(() => "");
  const plan = JSON.parse((await read("plan.json")) || "{}"), planEn = JSON.parse((await read("plan.en.json")) || "{}");
  const script = (await read("script.txt")).slice(0, 12000);
  if (!script) return undefined;
  const sources = JSON.parse((await read("sources.json")) || "[]") as { title: string; url: string }[];
  const { data } = await think<Omit<StoryCopy, "at">>({
    job: slug, phase: "produce", step: "story-copy", model: "sonnet", effort: "low", schema: SCHEMA,
    system: "You write YouTube descriptions for \"Huy Kể Chuyện\", an animated channel of Vietnamese folk tales, legends, fables and history for children (its English versions, \"Huy Tells Tales\", go on the channel \"Ask Huy\"). Warm, simple, honest; never clickbait.",
    prompt: [
      `The story: "${plan.title ?? job.topic}" (${job.kind ?? "story"}).${planEn.title ? ` English title: "${planEn.title}".` : ""}`,
      "",
      "Write:",
      "- vi: the Vietnamese description, 2–3 short sentences for parents and children: who the story is about and what sets it going, in a way that makes them want to watch; do NOT tell how it ends. Then one sentence: what the story teaches (\"Câu chuyện nhắc các bé…\"). No hashtags, no links, no emojis, no mention of dates or holidays.",
      "- en: the same in natural English for English-speaking families (Vietnamese names kept with their diacritics), ending with what it teaches.",
      "- sources: the numbers of the research pages below that are really about this story or its kind of tale. The search also brings unrelated pages, among them other works with a similar name (another book, film, TV series, song): leave those out. An empty list is fine.",
      "",
      "Research pages:",
      ...sources.map((s, i) => `${i}. ${s.title}`),
      "",
      "The script:",
      script,
    ].join("\n"),
  }, log);
  const copy: StoryCopy = { vi: data.vi.trim(), en: data.en.trim(), sources: data.sources.filter((i) => Number.isInteger(i) && i >= 0 && i < sources.length), at: new Date().toISOString() };
  await fs.writeFile(copyFile(slug), JSON.stringify(copy, null, 2));
  return copy;
}

/**
 * A page that can be about the story by its name: about the kind of tale, or holding the story's
 * name (or held in it), or sharing two of its words ("Khởi nghĩa Hai Bà Trưng" for "Hai Bà Trưng
 * khởi nghĩa"; not "Giấc mơ của Ếch Xanh" for "Ếch ngồi đáy giếng"). The brain's choice must pass it too.
 */
const GENRE = /^(truyện (cổ tích|ngụ ngôn|truyền thuyết)|truyền thuyết|cổ tích|ngụ ngôn)( việt nam)?$/i;
const WEAK = new Set(["của", "và", "ở", "the", "of", "a", "truyện", "chuyện", "việt", "nam", "sự", "tích"]);
const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/\(.*?\)/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function relevantSources<T extends { title: string }>(story: string, sources: T[], chosen?: number[]): T[] {
  const n = norm(story), words = new Set(n.split(" ").filter((w) => !WEAK.has(w)));
  return sources.filter((s, i) => {
    if (chosen && !chosen.includes(i)) return false;
    const t = norm(s.title), shared = t.split(" ").filter((w) => words.has(w)).length;
    return GENRE.test(t) || (t.length > 3 && (n.includes(t) || t.includes(n))) || shared >= 2;
  });
}

if (process.argv[1]?.endsWith("copy.ts")) {
  for (const slug of process.argv.slice(2)) console.log(slug, JSON.stringify(await writeStoryCopy(slug, console.log, true), null, 2));
}
