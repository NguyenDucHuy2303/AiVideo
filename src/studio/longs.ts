/**
 * Every "Did you know?" / "Bạn có biết?" Short has its long version: a question video (5–8 min,
 * with its own three Shorts) on the same channel, about the same thing. Made as soon as the
 * Short is approved (the user's rule, 16/11/2026: a Short alone is never enough). No brain here:
 * the question is the fact turned round ("Bạn có biết X?" → "Vì sao X?"); the writer gives the
 * film its own title when it writes the script.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { jobDir, loadJob, newJob, saveJob, type Job } from "./jobs.ts";

/** The fact's question as the long video's question: always grammatical, in its language. */
export function longQuestion(fact: string, kind: "fact" | "fact-vi"): string {
  let q = fact.replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "");
  q = kind === "fact-vi" ? q.replace(/^bạn có biết( là| rằng)?\s*[?:,]?\s*/i, "") : q.replace(/^did you know( that)?\s*[?:,]?\s*/i, "");
  // (a proper name stays capitalised: "Venus", "Ai Cập")
  const first = (q.split(/[ ,]/)[0] ?? "").normalize("NFC");
  if (!NAMES.test(first) && first !== first.toUpperCase()) q = q.charAt(0).toLowerCase() + q.slice(1);
  return kind === "fact-vi" ? `Vì sao ${q}?` : `Why is it that ${q}?`;
}
/** First words that are names (kept capitalised). */
const NAMES = /^(Venus|Mars|Earth|Jupiter|Saturn|Mercury|Neptune|Uranus|Pluto|Moon|Sun|Egypt|Africa|Asia|Europe|America|Antarctica|Việt|Hà|Sài|Ai|Trái|Mặt|Sao)$/;

/** A Short that needs its long version: approved or further on, and none made yet. */
export const needsLong = (j: Job, all: Job[]) =>
  (j.kind === "fact" || j.kind === "fact-vi") && ["approved", "producing", "video", "done"].includes(j.status) && !(j.longJob && all.some((x) => x.slug === j.longJob));

/** The long version of a Short: a question job on the same channel, taken first by the daily pick. */
export async function makeLong(slug: string, log: (s: string) => void = () => {}): Promise<Job> {
  const short = await loadJob(slug);
  if (short.kind !== "fact" && short.kind !== "fact-vi") throw new Error(`${slug} không phải Short Did you know? / Bạn có biết?`);
  const topicFile = path.join(jobDir(slug), "topic.json");
  const fact = (await exists(topicFile)) ? JSON.parse(await fs.readFile(topicFile, "utf8")) : {};
  const question = longQuestion(String(fact.question ?? short.topic), short.kind);
  const long = await newJob(question, { kind: short.kind === "fact" ? "qa" : "qa-vi", summary: `Bản dài của Short "${short.topic}"`, wanted: true, fromShort: slug });
  await fs.writeFile(path.join(jobDir(long.slug), "topic.json"), JSON.stringify({ question, area: fact.area, why: `Bản dài của Short "${short.topic}": cùng điều thú vị đó, giải thích kỹ hơn. ${fact.why ?? ""}`.trim(), from: slug }, null, 2));
  const fresh = await loadJob(slug);
  fresh.longJob = long.slug;
  await saveJob(fresh);
  log(`+ ${long.slug} (bản dài của Short)`);
  return long;
}
