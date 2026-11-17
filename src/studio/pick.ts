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
import { jobOccasion } from "./occasions.ts";

export interface Line {
  id: string;
  name: string;
  kinds?: string[];
  perDay: number;
  /**
   * Videos a week (the review page sets it): the pick then approves at most this many in any
   * seven days, spread out (3 a week: every two or three days). Without it: perDay × 7.
   */
  perWeek?: number;
  /** Scripts kept written ahead, waiting for review (default: settings scriptsAhead). */
  ahead?: number;
  /** How new topics are found when the line runs low: stories, animal fables, or questions (qa.ts). */
  propose?: "stories" | "fables" | "questions" | "facts" | "lessons";
  /** English lessons: the formats it takes in turn (formats.ts; default: all of them). */
  formats?: string[];
  /** The YouTube channel it is published on (publish.ts), when not one of its own (default: the id). */
  channel?: string;
}
/** A line's way of finding topics (older settings without "propose": by its kinds). */
export const proposerOf = (l: Line) => l.propose ?? (l.kinds?.includes("lesson") ? "lessons" : l.kinds?.some((k) => k === "fact" || k === "fact-vi") ? "facts" : l.kinds?.some((k) => k === "qa" || k === "qa-vi") ? "questions" : "stories");
export interface PickSettings {
  at: string; lines: Line[]; /** (the user's days off: publish offDays) */ offDays?: number[];
  /** Days of videos each line keeps ready ahead of its posting (the user, 17/11/2026: "ready 2–3 days before"). */
  leadDays?: number;
}
export const PICK_DEFAULTS: PickSettings = {
  at: "17:00",
  lines: [
    { id: "ask-huy", name: "Ask Huy (hỏi–đáp tiếng Anh)", kinds: ["qa"], perDay: 1, ahead: 6, propose: "questions" },
    { id: "hoi-huy", name: "Hỏi Huy (hỏi–đáp tiếng Việt)", kinds: ["qa-vi"], perDay: 1, ahead: 2, propose: "questions", channel: "huy-ke-chuyen" },
    { id: "ngu-ngon", name: "Truyện ngụ ngôn con vật", kinds: ["ngụ ngôn"], perDay: 1, ahead: 2, propose: "fables", channel: "huy-ke-chuyen" },
    { id: "ask-huy-shorts", name: "Shorts \"Did you know?\" (Ask Huy)", kinds: ["fact"], perDay: 1, ahead: 3, propose: "facts", channel: "ask-huy" },
    { id: "hoc-tieng-anh", name: "Học tiếng Anh cùng Huy", kinds: ["lesson"], perDay: 1, ahead: 2, propose: "lessons", channel: "huy-ke-chuyen" },
    { id: "hoi-huy-shorts", name: "Shorts \"Bạn có biết?\" (Hỏi Huy)", kinds: ["fact-vi"], perDay: 1, ahead: 2, propose: "facts", channel: "huy-ke-chuyen" },
    { id: "huy-ke-chuyen", name: "Huy Kể Chuyện (truyện, lịch sử)", perDay: 1, ahead: 6, propose: "stories" },
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
  const qa = job.kind === "qa" || job.kind === "qa-vi" || job.kind === "fact" || job.kind === "fact-vi";
  const { data } = await think<{ score: number; why: string }>({
    job: slug, step: "score", model: "sonnet", schema: SCHEMA,
    system: "Bạn là biên tập viên của các kênh YouTube hoạt hình cho trẻ em. Bạn chấm kịch bản thẳng thắn và công bằng.",
    prompt: [
      `Chấm kịch bản dưới đây từ 1 đến 10 (số thập phân được) để chọn kịch bản nào làm thành video trước. ${job.kind === "lesson" ? "Loạt \"Học tiếng Anh cùng Huy\" dạy tiếng Anh cho trẻ Việt 5–9 tuổi." : qa ? "Kênh hỏi–đáp \"Ask Huy\" / \"Hỏi Huy\" cho trẻ 6–12 tuổi." : "Kênh \"Huy Kể Chuyện\", truyện cổ tích, truyền thuyết và lịch sử Việt Nam cho trẻ 4–10 tuổi."}`,
      "Tiêu chí: hấp dẫn trẻ em từ câu đầu (giữ chân người xem), đúng sự thật và tư liệu, hợp lứa tuổi, mạch lạc và đủ ý, dễ dựng thành hình, có sức lan tỏa (chủ đề nhiều người tìm).",
      "why: một câu tiếng Việt nêu điểm mạnh và điểm yếu chính.", "", script,
    ].join("\n"),
  }, log);
  const fresh = await loadJob(slug);
  fresh.score = { value: Math.round(Math.max(1, Math.min(10, data.score)) * 10) / 10, why: data.why, hash };
  await saveJob(fresh);
  return fresh.score;
}

/** A line's videos a week. */
export const weekly = (l: Line) => l.perWeek ?? l.perDay * 7;

/**
 * How many scripts a line still needs approved today: no more than its share of a day, no more
 * than its week allows (the last seven days, today included), and with fewer than one a day,
 * not before its turn (3 a week: two days after the last one).
 */
export function needToday(line: Line, mine: Job[], now = new Date(), offDays: number[] = []): number {
  const week = weekly(line);
  if (week <= 0) return 0;
  const today = day(now), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).getTime();
  // Each job counts once, on the day it was (last) approved.
  const days = mine.map((j) => [...j.history].reverse().find((h) => h.status === "approved")?.at).filter((at): at is string => !!at);
  const inWeek = days.filter((at) => new Date(at).getTime() >= start).length;
  const onDay = days.filter((at) => day(at) === today).length;
  // A film approved today is made tonight and laid out tomorrow. When tomorrow is the last day
  // the user can upload before days off (Thursday, before the weekend), the days off need their
  // films today too: today's share is theirs as well (the week's count still holds).
  const off = new Set(offDays), at = (k: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + k).getDay();
  let k = 0;
  if (!off.has(at(1))) while (k < 6 && off.has(at(2 + k))) k++;
  let need = Math.min(Math.ceil(week / 7) * (1 + k) - onDay, Math.round(week) - inWeek);
  if (week < 7 && need > 0) {
    const before = days.filter((at) => day(at) < today).sort().at(-1);
    const gap = Math.floor(7 / week);
    if (before && (new Date(today).getTime() - new Date(day(before)).getTime()) / 86_400_000 < gap) need = 0;
  }
  return Math.max(0, need);
}

/** A job whose video is still to come out: being made, or made and not on YouTube yet (or scheduled later). */
export function pending(j: Job, now = new Date()): boolean {
  if (["approved", "producing", "video", "fix"].includes(j.status)) return true;
  if (j.status !== "done") return false;
  const out = j.kind === "fact" || j.kind === "fact-vi" ? j.published?.shorts?.[0] : j.published?.long;
  return !out || new Date(out.publishAt) > now;
}

/**
 * Scripts a line needs approved today to keep `lead` days of its videos ready before they are
 * posted (17/11/2026): its share of lead + 1 days, less what is already being made or waiting to
 * go out; at most `max` a day (what the nights can render). Catching up, it approves more than a
 * day's share; once ahead, only what is posted.
 */
export function needAhead(line: Line, mine: Job[], now = new Date(), lead = 3, max = 3): number {
  const week = weekly(line);
  if (week <= 0 || lead <= 0) return 0;
  const target = Math.ceil((week / 7) * (lead + 1));
  return Math.max(0, Math.min(max, target - mine.filter((j) => pending(j, now)).length));
}

/** Days before an occasion within which its script is approved even beyond the line's share. */
export const URGENT_DAYS = 14;

/**
 * The pick for today, line by line. A script for a coming occasion (Christmas, Tết…: trends.ts)
 * goes first, two to fourteen days ahead even if the line has had its share (one a day); then
 * the scripts waiting for review are scored (once) and the best approved up to the line's need.
 * Returns what was approved.
 */
export async function dailyPick(jobs: Job[], s: PickSettings, log: (s: string) => void, now = new Date()): Promise<string[]> {
  const picked: string[] = [];
  for (const line of s.lines) {
    const mine = jobs.filter((j) => lineOf(j, s.lines) === line);
    // the day's share, or more while the line is behind its days ahead
    let need = Math.max(needToday(line, mine, now, s.offDays), needAhead(line, mine, now, s.leadDays ?? 3));
    const waiting = mine.filter((j) => j.status === "review" && !j.retryAt);
    const urgent = waiting.map((job) => ({ job, o: jobOccasion(job, now) }))
      .filter((x) => x.o && x.o.left >= 2 && x.o.left <= URGENT_DAYS).sort((a, b) => a.o!.left - b.o!.left)[0];
    if (need <= 0 && !urgent) continue;
    if (!waiting.length) { log(`  ${line.name}: không có kịch bản chờ duyệt`); continue; }
    const chosen: { job: Job; why: string }[] = [];
    if (urgent) { chosen.push({ job: urgent.job, why: `cho dịp ${urgent.o!.short}, còn ${urgent.o!.left} ngày` }); need -= 1; }
    // (the long version of a Short, longs.ts: first within the line's share, the oldest first)
    const wanted = waiting.filter((j) => j.wanted && j !== urgent?.job).slice(0, Math.max(0, need));
    for (const j of wanted) { chosen.push({ job: j, why: "bản dài của Short đã làm" }); need -= 1; }
    if (need > 0) {
      // A script that cannot be scored (Claude at its limit, the job's budget spent) still counts:
      // it comes after the scored ones, so the line never goes without its videos.
      const scored: { job: Job; score: number }[] = [];
      for (const j of waiting.filter((j) => j !== urgent?.job && !wanted.includes(j))) {
        try { scored.push({ job: j, score: (await scoreJob(j.slug, log)).value }); }
        catch (err) { scored.push({ job: j, score: 0 }); log(`  ${j.slug}: chưa chấm được (${(err as Error).message.slice(0, 80)})`); }
      }
      // Coming occasions first, then the best; equal scores (or none): the one waiting longest.
      const soon = (j: Job) => jobOccasion(j, now)?.left ?? 999;
      scored.sort((a, b) => soon(a.job) - soon(b.job) || b.score - a.score || a.job.history[0]!.at.localeCompare(b.job.history[0]!.at));
      for (const { job, score } of scored.slice(0, need)) chosen.push({ job, why: score ? `điểm ${score}/10` : "chưa chấm được điểm, chờ lâu nhất" });
    }
    for (const { job, why } of chosen) {
      const j = await loadJob(job.slug);
      if (j.status !== "review") continue;
      j.autoPicked = true;
      await setStatus(j, "approved", `tự chọn lúc ${s.at} (${why})`);
      picked.push(j.slug);
      log(`  ${line.name}: tự chọn ${j.slug} (${why})`);
    }
  }
  return picked;
}
