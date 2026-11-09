/**
 * The scheduler: one task at a time, all day.
 *
 *   office hours (weekdays 08:00–18:00 by default): light work only, at low priority and with
 *     few threads for the image model: scripts, cast sheets, voices, scene direction, backdrops
 *   evenings, nights, weekends: renders first (as many films as there are ready), then light work
 *
 * The writer keeps `scriptsAhead` scripts waiting for review, proposing new topics when short,
 * so the user can approve several at once and the nights never run dry.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { STUDIO_DIR, brainSettings } from "../brain/claude.ts";
import { listJobs, newJob, jobDir, type Job } from "./jobs.ts";
import { prepare, render, writeJob } from "./produce.ts";
import { proposeTopics, eras } from "./topics.ts";

const STATE = path.join(STUDIO_DIR, "scheduler.json");
const LOG = path.join(STUDIO_DIR, "scheduler.log");
const SETTINGS = path.join(STUDIO_DIR, "settings.json");

export interface ScheduleSettings {
  office: { days: number[]; start: string; end: string };
  /** Scripts kept waiting for review (written ahead). */
  scriptsAhead: number;
  /** Threads for the image model during office hours. */
  officeThreads: number;
}
const DEFAULTS: ScheduleSettings = { office: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }, scriptsAhead: 6, officeThreads: 2 };

async function settings(): Promise<ScheduleSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fs.readFile(SETTINGS, "utf8")) : {};
  const s = { ...DEFAULTS, ...raw };
  if (!raw.office) await fs.writeFile(SETTINGS, JSON.stringify({ ...raw, ...DEFAULTS, ...raw }, null, 2));
  return s;
}

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h! * 60 + m!; };

export function isOffice(at: Date, s: ScheduleSettings): boolean {
  const now = at.getHours() * 60 + at.getMinutes();
  return s.office.days.includes(at.getDay()) && now >= minutes(s.office.start) && now < minutes(s.office.end);
}

interface State { pid: number; since: string; window: "office" | "free"; task?: { slug: string; what: string; since: string }; lastTick?: string; lastError?: string; nextTopicsAt?: string }
let state: State = { pid: process.pid, since: new Date().toISOString(), window: "free" };

async function save(): Promise<void> {
  await fs.mkdir(STUDIO_DIR, { recursive: true });
  await fs.writeFile(STATE, JSON.stringify(state, null, 2));
}

export async function schedulerState(): Promise<State | undefined> {
  if (!(await exists(STATE))) return undefined;
  const s: State = JSON.parse(await fs.readFile(STATE, "utf8"));
  try { process.kill(s.pid, 0); return s; } catch { return { ...s, task: undefined, lastError: "bộ lập lịch không chạy" }; }
}

async function log(line: string): Promise<void> {
  const text = `${new Date().toLocaleString("sv")} ${line}\n`;
  process.stdout.write(text);
  await fs.appendFile(LOG, text);
}

/** The next thing to do, by the rules above. */
async function next(jobs: Job[], office: boolean, s: ScheduleSettings): Promise<{ what: string; slug?: string; run: () => Promise<unknown> } | undefined> {
  const known = await eras();
  const first = (f: (j: Job) => boolean) => jobs.find(f);
  const say = (slug: string) => (l: string) => void log(`[${slug}] ${l.trim()}`);
  const ready = first((j) => j.status === "producing" && j.stage === "ready");
  if (!office && ready) return { what: "render", slug: ready.slug, run: () => render(ready.slug, say(ready.slug)) };
  // Paused by the user: only work that needs no Claude (renders) goes on.
  if ((await brainSettings()).paused) return undefined;
  // Producing a job whose era the library lacks waits for the era builder.
  const toPrepare = first((j) => (j.status === "approved" || j.status === "fix") && (!j.era || !!known[j.era]));
  if (toPrepare) return { what: "prepare", slug: toPrepare.slug, run: () => prepare(toPrepare.slug, say(toPrepare.slug)) };
  const toWrite = first((j) => j.status === "writing" || j.status === "rewrite");
  if (toWrite) return { what: "write", slug: toWrite.slug, run: () => writeJob(toWrite.slug, say(toWrite.slug)) };
  const waiting = jobs.filter((j) => ["writing", "rewrite", "review"].includes(j.status)).length;
  if (waiting < s.scriptsAhead && (!state.nextTopicsAt || new Date(state.nextTopicsAt) <= new Date())) {
    return {
      what: "topics",
      run: async () => {
        try {
          for (const t of await proposeTopics(Math.min(5, s.scriptsAhead - waiting), (l) => void log(l.trim()))) {
            const job = await newJob(t.title, { kind: t.kind, era: t.era, summary: t.summary });
            await fs.writeFile(path.join(jobDir(job.slug), "topic.json"), JSON.stringify(t, null, 2));
            await log(`+ ${job.slug} [${t.era}]`);
          }
        } finally {
          // Proposals at most every hour, also after a failure.
          state.nextTopicsAt = new Date(Date.now() + 60 * 60_000).toISOString();
        }
      },
    };
  }
  return undefined;
}

/** Run forever (the studio service). */
export async function runScheduler(): Promise<never> {
  await log(`scheduler started (pid ${process.pid})`);
  for (;;) {
    try {
      const s = await settings();
      const office = isOffice(new Date(), s);
      state.window = office ? "office" : "free";
      process.env.WATA_SD_THREADS = office ? String(s.officeThreads) : "";
      state.lastTick = new Date().toISOString();
      const task = await next(await listJobs(), office, s);
      if (task) {
        state.task = { slug: task.slug ?? "", what: task.what, since: new Date().toISOString() };
        await save();
        await log(`→ ${task.what}${task.slug ? ` ${task.slug}` : ""}${office ? " (giờ hành chính)" : ""}`);
        await task.run();
        state.task = undefined;
        await save();
        continue;
      }
      await save();
    } catch (err) {
      state.lastError = (err as Error).message;
      state.task = undefined;
      await save();
      await log(`✘ ${state.lastError}`);
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
