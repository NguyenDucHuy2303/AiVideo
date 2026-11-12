/**
 * Videos the user has not reviewed in time: after `review.videoHours` (studio/settings.json,
 * 12 by default, 0 = never) waiting, the studio approves a video itself, but only if a
 * machine check passes. No brain, no tokens: ffprobe and one ffmpeg pass at low priority.
 *
 *   - the right shape (16:9 film, 9:16 fact Short), video and sound present
 *   - a sane length (film at least 90 s; fact Short 10–75 s)
 *   - no black screen ≥ 2 s, no frozen picture ≥ 10 s, no silence ≥ 5 s, not too quiet
 *
 * A video that fails stays for the user, with the problems shown on its page; it is checked
 * again only when the file changes (a new render). The user still uploads by hand, so a video
 * approved this way can be held or rejected before it goes out.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { FFMPEG, FFPROBE } from "../config.ts";
import { run } from "../utils/process.ts";
import { isFact } from "./qa.ts";
import { jobDir, loadJob, saveJob, setStatus, type Job } from "./jobs.ts";

export interface VideoCheck { at: string; mtimeMs: number; ok: boolean; problems: string[]; seconds?: number }

/** When the job last came to "video" (the user's turn to review). */
export function waitingSince(job: Job): Date | undefined {
  const h = [...job.history].reverse().find((x) => x.status === "video");
  return job.status === "video" && h ? new Date(h.at) : undefined;
}

/** Waiting long enough to be approved by the studio? */
export function dueAutoApprove(job: Job, hours: number, now = new Date()): boolean {
  const since = waitingSince(job);
  return hours > 0 && !!since && now.getTime() - since.getTime() >= hours * 3600_000;
}

/** Spans [start, end] from ffmpeg's detector lines; one still open at the end runs to `total`. */
export function spans(log: string, name: "black" | "freeze" | "silence", total: number): number[] {
  const out: number[] = [];
  let open: number | undefined;
  const re = name === "black" ? /black_start:([\d.]+)\s+black_end:([\d.]+)/g : name === "freeze" ? /freeze_(start|end): ([\d.]+)/g : /silence_(start|end): ([\d.]+)/g;
  if (name === "black") {
    for (const m of log.matchAll(re)) out.push(Number(m[2]) - Number(m[1]));
    return out;
  }
  for (const m of log.matchAll(re)) {
    if (m[1] === "start") open = Number(m[2]);
    else if (open !== undefined) { out.push(Number(m[2]) - open); open = undefined; }
  }
  if (open !== undefined) out.push(total - open);
  return out;
}

/** What is wrong with a finished video (empty: fine). */
export function problemsOf(o: { fact: boolean; width: number; height: number; hasAudio: boolean; seconds: number; log: string }): string[] {
  const p: string[] = [];
  if (o.fact ? o.height <= o.width : o.width <= o.height) p.push(`khung hình ${o.width}×${o.height} sai chiều`);
  if (!o.hasAudio) p.push("không có tiếng");
  if (o.fact ? o.seconds < 10 || o.seconds > 75 : o.seconds < 90) p.push(`dài ${Math.round(o.seconds)} giây, bất thường`);
  const at = (xs: number[], min: number) => xs.filter((x) => x >= min).map((x) => Math.round(x));
  const black = at(spans(o.log, "black", o.seconds), 2), freeze = at(spans(o.log, "freeze", o.seconds), 10), silent = at(spans(o.log, "silence", o.seconds), 5);
  if (black.length) p.push(`màn hình đen ${black.join(", ")} giây`);
  if (freeze.length) p.push(`hình đứng yên ${freeze.join(", ")} giây`);
  if (silent.length) p.push(`im lặng ${silent.join(", ")} giây`);
  const vol = /mean_volume: (-?[\d.]+) dB/.exec(o.log);
  if (o.hasAudio && vol && Number(vol[1]) < -35) p.push(`tiếng quá nhỏ (${vol[1]} dB)`);
  return p;
}

/** The machine check of a job's video.mp4. */
export async function checkVideo(job: Job): Promise<VideoCheck> {
  const file = path.join(jobDir(job.slug), "video.mp4"), st = await fs.stat(file);
  const probe = JSON.parse((await run(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file], { timeoutMs: 60_000 })).stdout);
  const streams = (probe.streams ?? []) as { codec_type: string; width?: number; height?: number }[], v = streams.find((s) => s.codec_type === "video");
  const seconds = Number(probe.format?.duration ?? 0);
  let log = "";
  await run("nice", ["-n", "15", FFMPEG, "-hide_banner", "-nostdin", "-threads", "2", "-i", file,
    "-vf", "scale=320:-2,fps=5,blackdetect=d=1.5:pix_th=0.10,freezedetect=n=0.003:d=8",
    "-af", "silencedetect=n=-45dB:d=4,volumedetect", "-f", "null", "-"], { timeoutMs: 15 * 60_000, onStderr: (c) => { log += c; } });
  const problems = problemsOf({ fact: isFact(job.kind), width: v?.width ?? 0, height: v?.height ?? 0, hasAudio: streams.some((s) => s.codec_type === "audio"), seconds, log });
  return { at: new Date().toISOString(), mtimeMs: st.mtimeMs, ok: !problems.length, problems, seconds: Math.round(seconds) };
}

/** Is a check still to do (none yet, or the video was rendered again since)? */
export async function needsCheck(job: Job): Promise<boolean> {
  const st = await fs.stat(path.join(jobDir(job.slug), "video.mp4")).catch(() => undefined);
  return !!st && (!job.autoCheck || job.autoCheck.mtimeMs !== st.mtimeMs);
}

/** Check, then approve (done) if fine; otherwise keep the problems for the user to see. */
export async function autoApprove(slug: string, hours: number, log: (s: string) => void): Promise<Job> {
  const check = await checkVideo(await loadJob(slug));
  const job = await loadJob(slug); // (the user may have acted meanwhile)
  job.autoCheck = check;
  if (job.status !== "video") { await saveJob(job); return job; }
  if (!check.ok) {
    log(`tự duyệt: chưa, vì ${check.problems.join("; ")}`);
    await saveJob(job);
    return job;
  }
  job.autoApproved = check.at;
  await saveJob(job);
  log(`tự duyệt: chờ quá ${hours} giờ, kiểm tra máy đạt`);
  return setStatus(job, "done", `studio tự duyệt: anh chưa duyệt sau ${hours} giờ, kiểm tra máy đạt (${check.seconds} giây, không đen màn, đứng hình hay im lặng)`);
}
