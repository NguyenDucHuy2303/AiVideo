/**
 * The studio's work, one folder per video: studio/jobs/<slug>/job.json says where it stands.
 *
 *   writing → review (waits for the user) → approved → producing → video (waits) → done
 *                 ↘ rewrite (the user's note) ↗                       ↘ fix (note) ↗
 *   rejected · failed
 *
 * The writer keeps a few scripts ahead in "review"; the producer takes "approved" ones at
 * night. Neither waits for the other while the approved queue has work.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists, slugify } from "../utils/fs.ts";
import { STUDIO_DIR } from "../brain/claude.ts";
import type { Art } from "./art.ts";

export const JOBS_DIR = path.join(STUDIO_DIR, "jobs");

export type JobStatus = "writing" | "review" | "rewrite" | "approved" | "producing" | "video" | "fix" | "done" | "rejected" | "failed";

export interface Job {
  slug: string;
  topic: string;
  kind?: string;
  era?: string;
  /** Why this topic (from the proposal). */
  summary?: string;
  status: JobStatus;
  /** The user's notes, newest last (rewrite / fix requests). */
  notes: { at: string; text: string; on: "script" | "video" }[];
  history: { at: string; status: JobStatus; info?: string }[];
  /** Which brain wrote the script (claude-opus, ollama-…). */
  by?: string;
  /** While producing: "ready" once only the render is left. */
  stage?: string;
  /** Shorts cut from the film (job folder paths), made at night after the film. */
  shorts?: string[];
  /** The English version: voices ready ("ready"), film made ("done"), or what went wrong. */
  english?: "ready" | "done" | `failed: ${string}`;
  /** Drawing style, intro and outro (art.ts): suggested with the cast, changeable on the review page. */
  art?: Art;
  /** The brain's score of the script (pick.ts), for the daily pick; hash: the script it scored. */
  score?: { value: number; why: string; hash: string };
  /** Approved by the daily pick (the user had not chosen by the cut-off time). */
  autoPicked?: boolean;
  /** On YouTube (publish.ts): the film, its English version, its Shorts. */
  published?: { long?: import("./publish.ts").Published; en?: import("./publish.ts").Published; shorts?: import("./publish.ts").Published[] };
  /** Views and likes of its published videos (trends.ts), by video id. */
  stats?: Record<string, { views: number; likes: number; at: string }>;
  /** The user held it back from publishing. */
  publishHold?: boolean;
  /** The last publishing failure, and when to try again. */
  publishError?: string;
  publishRetryAt?: string;
  /** Claude was unavailable: the job is not tried again before this time. */
  retryAt?: string;
  error?: string;
}

export const jobDir = (slug: string) => path.join(JOBS_DIR, slug);

export async function loadJob(slug: string): Promise<Job> {
  return JSON.parse(await fs.readFile(path.join(jobDir(slug), "job.json"), "utf8"));
}

export async function saveJob(job: Job): Promise<void> {
  await fs.mkdir(jobDir(job.slug), { recursive: true });
  const f = path.join(jobDir(job.slug), "job.json");
  await fs.writeFile(`${f}.tmp`, JSON.stringify(job, null, 2));
  await fs.rename(`${f}.tmp`, f);
}

export async function setStatus(job: Job, status: JobStatus, info?: string): Promise<Job> {
  job.status = status;
  job.history.push({ at: new Date().toISOString(), status, ...(info ? { info } : {}) });
  if (status !== "failed") delete job.error;
  await saveJob(job);
  return job;
}

export async function listJobs(): Promise<Job[]> {
  if (!(await exists(JOBS_DIR))) return [];
  const jobs: Job[] = [];
  for (const d of await fs.readdir(JOBS_DIR)) {
    if (await exists(path.join(JOBS_DIR, d, "job.json"))) jobs.push(await loadJob(d));
  }
  return jobs.sort((a, b) => a.history[0]!.at.localeCompare(b.history[0]!.at));
}

export async function newJob(topic: string, extra: Partial<Job> = {}): Promise<Job> {
  let slug = slugify(topic), n = 2;
  while (await exists(jobDir(slug))) slug = `${slugify(topic)}-${n++}`;
  const job: Job = { slug, topic, status: "writing", notes: [], history: [{ at: new Date().toISOString(), status: "writing" }], ...extra };
  await saveJob(job);
  return job;
}
