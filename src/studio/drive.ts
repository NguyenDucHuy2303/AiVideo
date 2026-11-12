/**
 * Google Drive: every topic folder laid out for posting (~/youtube/<topic>) is copied up to
 * Drive (Wata/<topic>), so the user can take the videos from anywhere; a calendar file
 * ("Lich dang.txt", calendar.ts) sits beside them; a topic posted everywhere is removed from
 * Drive a week later (the copy at home stays).
 *
 * rclone (MIT, vendor/rclone) with the "drive.file" scope: it sees only what it put there.
 * Connected once by the user (README, "Google Drive"); the remote is "wata" in
 * studio/secrets/rclone.conf. Not connected: nothing happens.
 *
 * It runs beside the scheduler (every 5 minutes), not as one of its tasks: an upload of a few
 * hundred MB must not hold up a night's renders. No brain, no tokens.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { run } from "../utils/process.ts";
import { calendar, calendarText } from "./calendar.ts";
import { jobDir, listJobs, loadJob, saveJob, type Job } from "./jobs.ts";
import { EXPORT_DIR, postState, publishSettings, SECRETS } from "./publish.ts";

export const RCLONE = path.join(ROOT, "vendor", "rclone", "rclone");
export const RCLONE_CONF = path.join(SECRETS, "rclone.conf");
const REMOTE = "wata:Wata";
const CALENDAR_FILE = "Lich dang.txt";
/** Days a topic posted everywhere stays on Drive. */
export const KEEP_DAYS = 7;
const EVERY_MS = 5 * 60_000;

/** What the pages show. */
export const driveState: { ready: boolean; busy?: string; lastPush?: string; lastError?: string; calendarAt?: string } = { ready: false };

const exists = (p: string) => fs.access(p).then(() => true, () => false);
export async function driveReady(): Promise<boolean> {
  if (!(await exists(RCLONE)) || !(await exists(RCLONE_CONF))) return false;
  return /^\[wata\]/m.test(await fs.readFile(RCLONE_CONF, "utf8"));
}
const rclone = (args: string[], input?: string) =>
  run(RCLONE, [...args, "--config", RCLONE_CONF, "--retries", "3", "--low-level-retries", "5"], { timeoutMs: 2 * 3600_000, ...(input !== undefined ? { input } : {}) });

/** The topic folder at home (~/youtube/<topic>) of a laid-out job, if any. */
export function folderOf(job: Job): string | undefined {
  const ex = job.exported?.long ?? job.exported?.en ?? job.exported?.shorts?.find(Boolean);
  if (ex?.dir) return ex.dir;
  return job.drive?.folder ? path.join(EXPORT_DIR(), job.drive.folder) : undefined;
}

/** The newest file time in a folder (a new Short, a sheet rewritten with a link…). */
export async function newestMtime(dir: string): Promise<number> {
  let m = 0;
  for (const f of await fs.readdir(dir).catch(() => [] as string[])) {
    const st = await fs.stat(path.join(dir, f)).catch(() => undefined);
    if (st?.isFile()) m = Math.max(m, st.mtimeMs);
  }
  return m;
}

/** When the topic was last posted somewhere (YouTube, TikTok, Facebook). */
export function lastPosted(job: Job): number {
  const p = job.published, times = [p?.long?.at, p?.en?.at, ...(p?.shorts ?? []).map((x) => x?.at), ...Object.values(job.social ?? {})];
  return Math.max(0, ...times.filter((t): t is string => !!t).map((t) => new Date(t).getTime()));
}

/** Copy up a topic folder that is new or changed since its last copy. */
async function push(job: Job, log: (s: string) => void): Promise<void> {
  const dir = folderOf(job);
  if (!dir || job.drive?.removed || !(await exists(dir))) return;
  const mtime = await newestMtime(dir);
  if (job.drive && mtime <= job.drive.mtime) return;
  const name = path.basename(dir);
  driveState.busy = name;
  log(`Drive: chép lên ${name}`);
  await rclone(["copy", dir, `${REMOTE}/${name}`, "--exclude", ".studio"]);
  const fresh = await loadJob(job.slug);
  fresh.drive = { folder: name, mtime, at: new Date().toISOString() };
  await saveJob(fresh);
  driveState.lastPush = fresh.drive.at;
}

/** A topic posted everywhere a week ago: off Drive (not to the bin: the space comes back). */
async function sweep(job: Job, now: number, log: (s: string) => void): Promise<void> {
  if (!job.drive || job.drive.removed) return;
  const files = await fs.readdir(jobDir(job.slug)).catch(() => [] as string[]);
  if (postState(job, files)?.stage !== "all" || now - lastPosted(job) < KEEP_DAYS * 86_400_000) return;
  log(`Drive: xóa ${job.drive.folder} (đã đăng hết từ ${KEEP_DAYS} ngày trước)`);
  await rclone(["purge", `${REMOTE}/${job.drive.folder}`, "--drive-use-trash=false"]);
  const fresh = await loadJob(job.slug);
  fresh.drive = { ...job.drive, removed: new Date().toISOString() };
  await saveJob(fresh);
}

let lastCalendar = "";
/** The calendar file, written again when what it says changes (or the day does). */
async function putCalendar(jobs: Job[]): Promise<void> {
  const now = new Date(), text = calendarText(calendar(jobs, await publishSettings(), { now }), now);
  const body = text.split("\n").slice(1).join("\n") + now.toDateString();
  if (body === lastCalendar) return;
  await rclone(["rcat", `${REMOTE}/${CALENDAR_FILE}`], text);
  lastCalendar = body;
  driveState.calendarAt = now.toISOString();
}

/** One round: copy up, sweep, the calendar. Errors are kept for the pages, the next round tries again. */
export async function driveTick(log: (s: string) => void): Promise<void> {
  driveState.ready = await driveReady();
  if (!driveState.ready) return;
  try {
    const jobs = await listJobs(), now = Date.now();
    for (const j of jobs) await push(j, log);
    for (const j of jobs) await sweep(j, now, log);
    await putCalendar(await listJobs());
    driveState.lastError = undefined;
  } catch (err) {
    driveState.lastError = (err as Error).message.slice(0, 300);
    log(`Drive: lỗi ${driveState.lastError}`);
  } finally {
    driveState.busy = undefined;
  }
}

/** Start the rounds (the studio service, beside the scheduler). */
export function startDrive(log: (s: string) => void): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await driveTick(log); } finally { running = false; }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, EVERY_MS).unref();
}
