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
import { wasInterrupted } from "../utils/process.ts";
import { channelOf, publishOne, PUBLISH_DEFAULTS, toPublish, token, type PublishSettings } from "./publish.ts";
import { dailyPick, lineOf, PICK_DEFAULTS, proposerOf, type PickSettings } from "./pick.ts";
import { isFact, isQA, proposeFacts, proposeQuestions } from "./qa.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { STUDIO_DIR, brainSettings } from "../brain/claude.ts";
import { listJobs, newJob, jobDir, type Job } from "./jobs.ts";
import { prepare, render, shorts, writeJob } from "./produce.ts";
import { prepareEnglish, renderEnglish } from "./english.ts";
import { loadJob, saveJob, setStatus } from "./jobs.ts";
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
  /** The daily pick (pick.ts): cut-off time and content lines with their videos per day. */
  pick: PickSettings;
  /** YouTube channels (publish.ts): times, on/off. */
  publish: PublishSettings;
}
const DEFAULTS: ScheduleSettings = { office: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00" }, scriptsAhead: 6, officeThreads: 2, pick: PICK_DEFAULTS, publish: PUBLISH_DEFAULTS };

async function settings(): Promise<ScheduleSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fs.readFile(SETTINGS, "utf8")) : {};
  const s = { ...DEFAULTS, ...raw, publish: { ...PUBLISH_DEFAULTS, ...(raw.publish ?? {}) } };
  if (!raw.office || !raw.pick || !raw.publish) await fs.writeFile(SETTINGS, JSON.stringify(s, null, 2));
  return s;
}

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h! * 60 + m!; };

export function isOffice(at: Date, s: ScheduleSettings): boolean {
  const now = at.getHours() * 60 + at.getMinutes();
  return s.office.days.includes(at.getDay()) && now >= minutes(s.office.start) && now < minutes(s.office.end);
}

interface State { pid: number; since: string; window: "office" | "free"; task?: { slug: string; what: string; since: string }; lastTick?: string; lastError?: string; nextTopicsAt?: Record<string, string>; pickedOn?: string }
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
  // Jobs waiting for Claude to come back are left alone until their time.
  const first = (f: (j: Job) => boolean) => jobs.find((j) => (!j.retryAt || new Date(j.retryAt) <= new Date()) && f(j));
  const say = (slug: string) => (l: string) => void log(`[${slug}] ${l.trim()}`);
  const ready = first((j) => j.status === "producing" && j.stage === "ready");
  if (!office && ready) return { what: "render", slug: ready.slug, run: () => render(ready.slug, say(ready.slug)) };
  const cut = first((j) => (j.status === "video" || j.status === "done") && !j.shorts);
  if (!office && cut) return { what: "shorts", slug: cut.slug, run: () => shorts(cut.slug, say(cut.slug)) };
  // The English version of an approved film: voices by day, the film at night.
  const enFilm = first((j) => j.status === "done" && j.english === "ready");
  if (!office && enFilm) return { what: "english-render", slug: enFilm.slug, run: () => english(enFilm.slug, "render", say(enFilm.slug)) };
  // Publishing (light: network only, any hour): the next item of a finished job whose channel
  // is connected and turned on.
  for (const j of jobs) {
    if (j.publishRetryAt && new Date(j.publishRetryAt) > new Date()) continue;
    const files = await fs.readdir(jobDir(j.slug)).catch(() => [] as string[]);
    for (const item of toPublish(j, files)) {
      const ch = channelOf(j, item.what, s.pick.lines);
      if (!s.publish[ch]?.enabled || !(await token(ch))) continue;
      return {
        what: `publish ${item.what}`, slug: j.slug,
        run: async () => {
          try { await publishOne(j.slug, item, jobs, s.publish, s.pick.lines, say(j.slug)); }
          catch (err) {
            const job = await loadJob(j.slug);
            job.publishError = (err as Error).message.slice(0, 400);
            job.publishRetryAt = new Date(Date.now() + 60 * 60_000).toISOString();
            await saveJob(job);
            throw err;
          }
        },
      };
    }
  }
  // Paused by the user: only work that needs no Claude (renders) goes on.
  if ((await brainSettings()).paused) return undefined;
  // Producing a job whose era the library lacks waits for the era builder.
  // The daily pick, once a day from the cut-off time: lines short of approved scripts get the best ones.
  const today = new Date().toLocaleDateString("sv"), now = new Date().getHours() * 60 + new Date().getMinutes();
  if (state.pickedOn !== today && now >= minutes(s.pick.at)) {
    return { what: "pick", run: async () => { try { await dailyPick(jobs, s.pick, (l) => void log(l.trim())); } finally { state.pickedOn = today; } } };
  }
  const toPrepare = first((j) => (j.status === "approved" || j.status === "fix") && (!j.era || !!known[j.era]));
  if (toPrepare) return { what: "prepare", slug: toPrepare.slug, run: () => prepare(toPrepare.slug, say(toPrepare.slug)) };
  const enPrep = first((j) => j.status === "done" && !j.english && !isQA(j.kind));
  if (enPrep && !(await brainSettings()).paused) return { what: "english", slug: enPrep.slug, run: () => english(enPrep.slug, "prepare", say(enPrep.slug)) };
  const toWrite = first((j) => j.status === "writing" || j.status === "rewrite");
  if (toWrite) return { what: "write", slug: toWrite.slug, run: () => writeJob(toWrite.slug, say(toWrite.slug)) };
  // Every content line keeps its scripts written ahead: running low, it finds new topics its
  // own way (stories or questions), at most once an hour per line, also after a failure.
  for (const line of s.pick.lines) {
    const mine = jobs.filter((j) => lineOf(j, s.pick.lines) === line);
    const waiting = mine.filter((j) => ["writing", "rewrite", "review"].includes(j.status)).length, ahead = line.ahead ?? s.scriptsAhead;
    const next = state.nextTopicsAt?.[line.id];
    if (waiting >= ahead || (next && new Date(next) > new Date())) continue;
    return {
      what: `topics ${line.id}`,
      run: async () => {
        try {
          const count = Math.min(5, ahead - waiting);
          if (proposerOf(line) === "questions" || proposerOf(line) === "facts") {
            const made = await Promise.all(mine.map(async (j) => {
              const f = path.join(jobDir(j.slug), "topic.json");
              return { topic: j.topic, area: (await exists(f)) ? JSON.parse(await fs.readFile(f, "utf8")).area : undefined };
            }));
            const kind = line.kinds?.find(isQA) ?? "qa";
            const found = isFact(kind) ? await proposeFacts(count, made, (l) => void log(l.trim()), kind as "fact" | "fact-vi") : await proposeQuestions(count, made, (l) => void log(l.trim()), kind as "qa" | "qa-vi");
            for (const q of found) {
              const job = await newJob(q.question, { kind, summary: q.why });
              await fs.writeFile(path.join(jobDir(job.slug), "topic.json"), JSON.stringify(q, null, 2));
              await log(`+ ${job.slug} [${q.area}]`);
            }
          } else {
            for (const t of await proposeTopics(count, (l) => void log(l.trim()), { fables: proposerOf(line) === "fables" })) {
              const job = await newJob(t.title, { kind: t.kind, era: t.era, summary: t.summary });
              await fs.writeFile(path.join(jobDir(job.slug), "topic.json"), JSON.stringify(t, null, 2));
              await log(`+ ${job.slug} [${t.era}]`);
            }
          }
        } finally {
          state.nextTopicsAt = { ...(state.nextTopicsAt ?? {}), [line.id]: new Date(Date.now() + 60 * 60_000).toISOString() };
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
    // Stopping (SIGTERM: the children are killed, the process exits in 3 s): start nothing more,
    // or every task fails at once and the loop spins through the job list until the exit.
    if (wasInterrupted()) await new Promise(() => {});
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

/** One step of a job's English version; its result is kept on the job (never fails the film). */
async function english(slug: string, step: "prepare" | "render", log: (s: string) => void): Promise<void> {
  try {
    if (step === "prepare") await prepareEnglish(slug, log);
    else await renderEnglish(slug, log);
    const job = await loadJob(slug);
    job.english = step === "prepare" ? "ready" : "done";
    await saveJob(job);
    await setStatus(job, job.status, step === "prepare" ? "bản tiếng Anh: giọng xong" : "bản tiếng Anh: xong");
  } catch (err) {
    const job = await loadJob(slug);
    job.english = `failed: ${(err as Error).message.slice(0, 200)}`;
    await saveJob(job);
  }
}
