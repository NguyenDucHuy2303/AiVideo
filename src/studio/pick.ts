/**
 * The daily pick: the user approves scripts on the review page; if by the cut-off time (17:00)
 * a content line has fewer approvals today than its videos per day, the studio approves the
 * best scripts waiting in that line itself. "Best" is a score the brain gives each script once
 * (kept in job.score, given again only when the script changes). The videos still wait for the
 * user's review before they are done.
 *
 * Content lines are in studio/settings.json ("lines"), so a new channel or series is one more
 * entry: { id, name, kinds?, perDay }. A job belongs to the first line whose kinds include its
 * kind; a line without kinds takes every job no other line claims.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { jobDir, loadJob, saveJob, setStatus, type Job } from "./jobs.ts";

export interface Line {
  id: string;
  name: string;
  kinds?: string[];
  perDay: number;
  /** Scripts kept written ahead, waiting for review (default: settings scriptsAhead). */
  ahead?: number;
  /** How new topics are found when the line runs low: Vietnamese stories, or questions (qa.ts). */
  propose?: "stories" | "questions";
}
/** A line's way of finding topics (older settings without "propose": by its kinds). */
export const proposerOf = (l: Line) => l.propose ?? (l.kinds?.some((k) => k === "qa" || k === "qa-vi") ? "questions" : "stories");
export interface PickSettings { at: string; lines: Line[] }
export const PICK_DEFAULTS: PickSettings = {
  at: "17:00",
  lines: [
    { id: "ask-huy", name: "Ask Huy (hỏi–đáp tiếng Anh)", kinds: ["qa"], perDay: 2, ahead: 6, propose: "questions" },
    { id: "hoi-huy", name: "Hỏi Huy (hỏi–đáp tiếng Việt)", kinds: ["qa-vi"], perDay: 1, ahead: 2, propose: "questions" },
    { id: "huy-ke-chuyen", name: "Huy Kể Chuyện (truyện, lịch sử)", perDay: 2, ahead: 6, propose: "stories" },
  ],
};

export function lineOf(job: Job, lines: Line[]): Line | undefined {
  return lines.find((l) => l.kinds?.includes(job.kind ?? "")) ?? lines.find((l) => !l.kinds);
}

const day = (iso: string | Date) => new Date(iso).toLocaleDateString("sv");
/** Scripts approved today (by the user or by the pick). */
export const approvedToday = (job: Job, today = day(new Date())) => job.history.some((h) => h.status === "approved" && day(h.at) === today);

const SCHEMA = { type: "object", properties: { score: { type: "number" }, why: { type: "string" } }, required: ["score", "why"] };

/** The brain's score of a script, 1–10, given once per version of the script (~5k tokens). */
export async function scoreJob(slug: string, log: (s: string) => void = () => {}): Promise<NonNullable<Job["score"]>> {
  const job = await loadJob(slug);
  const script = await fs.readFile(path.join(jobDir(slug), "script.txt"), "utf8");
  const hash = createHash("sha256").update(script).digest("hex").slice(0, 16);
  if (job.score?.hash === hash) return job.score;
  const qa = job.kind === "qa" || job.kind === "qa-vi";
  const { data } = await think<{ score: number; why: string }>({
    job: slug, step: "score", model: "sonnet", schema: SCHEMA,
    system: "Bạn là biên tập viên của các kênh YouTube hoạt hình cho trẻ em. Bạn chấm kịch bản thẳng thắn và công bằng.",
    prompt: [
      `Chấm kịch bản dưới đây từ 1 đến 10 (số thập phân được) để chọn kịch bản nào làm thành video trước. ${qa ? "Kênh hỏi–đáp tiếng Anh \"Ask Huy\" cho trẻ 6–12 tuổi." : "Kênh \"Huy Kể Chuyện\", truyện cổ tích, truyền thuyết và lịch sử Việt Nam cho trẻ 4–10 tuổi."}`,
      "Tiêu chí: hấp dẫn trẻ em từ câu đầu (giữ chân người xem), đúng sự thật và tư liệu, hợp lứa tuổi, mạch lạc và đủ ý, dễ dựng thành hình, có sức lan tỏa (chủ đề nhiều người tìm).",
      "why: một câu tiếng Việt nêu điểm mạnh và điểm yếu chính.", "", script,
    ].join("\n"),
  }, log);
  const fresh = await loadJob(slug);
  fresh.score = { value: Math.round(Math.max(1, Math.min(10, data.score)) * 10) / 10, why: data.why, hash };
  await saveJob(fresh);
  return fresh.score;
}

/**
 * The pick for today, line by line: scripts waiting for review are scored (once) and the best
 * are approved up to the line's videos per day. Returns what was approved.
 */
export async function dailyPick(jobs: Job[], s: PickSettings, log: (s: string) => void): Promise<string[]> {
  const picked: string[] = [];
  for (const line of s.lines) {
    const mine = jobs.filter((j) => lineOf(j, s.lines) === line);
    const need = line.perDay - mine.filter((j) => approvedToday(j)).length;
    if (need <= 0) continue;
    const waiting = mine.filter((j) => j.status === "review" && !j.retryAt);
    if (!waiting.length) { log(`  ${line.name}: không có kịch bản chờ duyệt`); continue; }
    // A script that cannot be scored (Claude at its limit, the job's budget spent) still counts:
    // it comes after the scored ones, so the line never goes without its videos.
    const scored: { job: Job; score: number }[] = [];
    for (const j of waiting) {
      try { scored.push({ job: j, score: (await scoreJob(j.slug, log)).value }); }
      catch (err) { scored.push({ job: j, score: 0 }); log(`  ${j.slug}: chưa chấm được (${(err as Error).message.slice(0, 80)})`); }
    }
    // Best first; equal scores (or none): the one waiting longest.
    scored.sort((a, b) => b.score - a.score || a.job.history[0]!.at.localeCompare(b.job.history[0]!.at));
    for (const { job, score } of scored.slice(0, need)) {
      const j = await loadJob(job.slug);
      if (j.status !== "review") continue;
      j.autoPicked = true;
      const why = score ? `điểm ${score}/10` : "chưa chấm được điểm, chờ lâu nhất";
      await setStatus(j, "approved", `tự chọn lúc ${s.at} (${why})`);
      picked.push(j.slug);
      log(`  ${line.name}: tự chọn ${j.slug} (${why})`);
    }
  }
  return picked;
}
