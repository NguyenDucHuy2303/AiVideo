/**
 * A job from topic to video, in the steps the scheduler runs:
 *
 *   writeJob   (light)  script → cast → costume sheet → review
 *   prepare    (light)  approved → project folder, voices, scene direction, backdrops → ready
 *   render     (heavy)  ready → the film, thumbnail → video (the user's review)
 *
 * A note on the video ("fix") re-directs the scenes with the note and renders again; only the
 * scenes that changed are drawn again.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { run, wasInterrupted } from "../utils/process.ts";
import { BrainPaused, BrainUnavailable, claudeProvider } from "../brain/claude.ts";
import { animate } from "../animation/compile/animate.ts";
import { withBackdrop } from "../animation/backdrops.ts";
import { loadScene } from "../animation/render.ts";
import { renderStory } from "../animation/story.ts";
import { costumeSheet, designCast, type Designed } from "./design.ts";
import { jobDir, loadJob, saveJob, setStatus, type Job, type JobStatus } from "./jobs.ts";
import { writeScript, type Plan } from "./write.ts";
import { linkShorts, makeShorts } from "./shorts.ts";
import { buildEra, loadEras } from "./era.ts";
import { artOf, syncArt } from "./art.ts";

export const projectOf = (slug: string) => path.join(ROOT, "projects", slug);

async function fail(slug: string, err: unknown, back?: JobStatus): Promise<Job> {
  const job = await loadJob(slug);
  // The studio is stopping: leave the job as it was; the next start picks it up again.
  if (wasInterrupted()) return back && job.status !== back ? setStatus(job, back, "dừng giữa chừng, sẽ làm tiếp") : job;
  // Paused by the user: the job waits where it was, it has not failed.
  if (err instanceof BrainPaused) return back && job.status !== back ? setStatus(job, back, "chờ: Claude tạm dừng") : job;
  // Claude unavailable for now: wait half an hour, then the scheduler tries again.
  if (err instanceof BrainUnavailable) {
    job.retryAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await saveJob(job);
    return setStatus(job, back ?? job.status, `chờ thử lại: ${(err as Error).message.slice(0, 160)}`);
  }
  job.error = (err as Error).message;
  return setStatus(job, "failed", job.error.slice(0, 300));
}

/** Script, cast and costume sheet, then the job waits for the user. */
export async function writeJob(slug: string, log: (s: string) => void = console.log): Promise<Job> {
  try {
    let job = await loadJob(slug);
    const dir = jobDir(slug);
    // A script already written (an interrupted run) is not written again.
    const resume = job.status === "writing" && (await exists(path.join(dir, "plan.json")));
    const problems = resume ? [] : await writeScript(slug, log);
    // An era the library lacks is researched and built before the cast is designed in it.
    if (job.era && !(await loadEras())[job.era]) {
      const topicFile = path.join(dir, "topic.json");
      const topic = (await exists(topicFile)) ? JSON.parse(await fs.readFile(topicFile, "utf8")) : {};
      log(`  new era: ${job.era}`);
      await buildEra(job.era, { eraName: topic.eraName, topic: job.topic, job: `era-${job.era}` }, log); // its own budget, once per era
    }
    log(`  cast and costume sheet`);
    await designCast(slug, log);
    await costumeSheet(slug);
    job = await loadJob(slug);
    return setStatus(job, "review", problems.length ? `${problems.length} vấn đề còn lại: ${problems.slice(0, 3).join(" ")}` : undefined);
  } catch (err) {
    return fail(slug, err);
  }
}

/**
 * Everything but the film, into a project folder: the cartoon tools' project (script lines
 * as scenes, voices, speakers), the voice build, scene direction by the brain with the
 * approved cast, and the backdrops. `scenes` keeps only the first n (a test run).
 */
async function buildProject(job: Job, proj: string, opts: { scenes?: number; notes?: string[]; redirect?: boolean; revoice?: boolean }, log: (s: string) => void): Promise<void> {
  const dir = jobDir(job.slug), anim = path.join(proj, "anim");
  const plan: Plan = JSON.parse(await fs.readFile(path.join(dir, "plan.json"), "utf8"));
  const cast: Designed[] = JSON.parse(await fs.readFile(path.join(dir, "cast.json"), "utf8"));
  await fs.mkdir(anim, { recursive: true });
  const script = await fs.readFile(path.join(dir, "script.txt"), "utf8");
  const lines = script.trim().split("\n").slice(1, opts.scenes ? opts.scenes + 1 : undefined);
  await fs.writeFile(path.join(proj, "script.txt"), [plan.title, ...lines].join("\n") + "\n");
  await fs.writeFile(path.join(proj, "storyboard.json"), JSON.stringify({
    title: plan.title, kind: "story",
    scenes: lines.map((narration) => ({ narration, chapter: plan.title, onScreen: {}, visual: { description: "ancient Vietnam", mood: "calm" }, camera: "ken_burns", transition: "cut" })),
  }, null, 2));
  const speakers: Record<string, string[]> = {};
  for (const c of cast) for (const name of c.speaks) (speakers[name] ??= []).push(c.id);
  const project = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8"));
  const subtitle = { "lịch sử": "Lịch sử Việt Nam", "truyền thuyết": "Truyền thuyết Việt Nam", "ngụ ngôn": "Truyện ngụ ngôn Việt Nam" }[job.kind ?? ""] ?? "Truyện cổ tích Việt Nam";
  const art = artOf(job);
  await fs.writeFile(path.join(proj, "project.json"), JSON.stringify({ ...project, speakers, thumbnail: { title: plan.title.replace(/\s*[–-]\s*/g, " "), subtitle }, style: art.style, characters: art.characters, brand: { intro: art.intro, outro: art.outro } }, null, 2));
  // Voices (the timing of everything else).
  if (opts.revoice !== false || !(await exists(path.join(proj, "timeline.json")))) {
    log("  voices");
    await run(process.execPath, [path.join(ROOT, "src", "cli.ts"), "build", path.join(proj, "storyboard.json"), "--voice-only"], { cwd: ROOT, timeoutMs: 60 * 60_000 });
  }
  // Scene direction by the brain, with the approved cast; a video note goes to the director.
  await fs.writeFile(path.join(anim, "cast.auto.json"), JSON.stringify(cast.map(({ speaks: _s, role: _r, ...c }) => c), null, 2));
  if (opts.redirect) for (const f of await fs.readdir(anim)) if (/^s\d.*\.json$|^plans\.auto\.json$/.test(f)) await fs.rm(path.join(anim, f));
  log("  scene direction");
  await animate(proj, { provider: claudeProvider(job.slug, "produce", "sonnet", log, opts.notes ?? []), log: (l) => log(`  ${l.trim()}`) });
  // Backdrops painted now (light hours: few threads), so the night only renders.
  log("  backdrops");
  for (const f of (await fs.readdir(anim)).filter((f) => /^s\d.*\.json$/.test(f)).sort()) await withBackdrop(await loadScene(path.join(anim, f)));
}

/** Approved (or sent back with a note on the video): everything but the film itself. */
export async function prepare(slug: string, log: (s: string) => void = console.log): Promise<Job> {
  let from: JobStatus | undefined;
  try {
    let job = await loadJob(slug);
    const fixing = job.status === "fix";
    from = job.status;
    job = await setStatus(job, "producing", fixing ? "sửa theo góp ý" : "chuẩn bị");
    await buildProject(job, projectOf(slug), { notes: job.notes.filter((n) => n.on === "video").map((n) => n.text), redirect: fixing, revoice: !fixing }, log);
    job = await loadJob(slug);
    job.stage = "ready";
    await saveJob(job);
    return setStatus(job, "producing", "sẵn sàng render");
  } catch (err) {
    return fail(slug, err, from);
  }
}

/**
 * A test of the whole production on the first scenes of a job, in projects/<slug>-thu: the
 * job's own status is not touched (it can still be waiting for review). Returns the film.
 */
export async function testRun(slug: string, scenes: number, log: (s: string) => void = console.log): Promise<string> {
  const proj = path.join(ROOT, "projects", `${slug}-thu`);
  await buildProject(await loadJob(slug), proj, { scenes }, log);
  log("  render");
  return renderStory(proj, { onLog: log });
}

/** Shorts from the finished film (heavy: nights and weekends); the job's status stays. */
export async function shorts(slug: string, log: (s: string) => void = console.log): Promise<Job> {
  try {
    const files = await makeShorts(projectOf(slug), 3, log);
    const job = await loadJob(slug);
    job.shorts = await linkShorts(files, jobDir(slug));
    await saveJob(job);
    return setStatus(job, job.status, `${files.length} shorts`);
  } catch (err) {
    // A failed short must not fail the film: note it and move on.
    const job = await loadJob(slug);
    job.shorts = [];
    await saveJob(job);
    return setStatus(job, job.status, `shorts lỗi: ${(err as Error).message.slice(0, 200)}`);
  }
}

/** The film (heavy: nights and weekends). */
export async function render(slug: string, log: (s: string) => void = console.log): Promise<Job> {
  try {
    let job = await loadJob(slug);
    job = await setStatus(job, "producing", "đang render");
    await syncArt(job, projectOf(slug)); // a style or intro changed on the review page since
    const out = await renderStory(projectOf(slug), { onLog: log });
    const dir = jobDir(slug);
    for (const [from, to] of [[out, "video.mp4"], [out.replace(/\.mp4$/, "_thumbnail.jpg"), "thumbnail.jpg"]] as const) {
      const target = path.join(dir, to);
      await fs.rm(target, { force: true });
      await fs.link(from, target).catch(() => fs.copyFile(from, target));
    }
    job = await loadJob(slug);
    delete job.stage;
    delete job.shorts; // the film changed: its shorts are cut again
    await saveJob(job);
    return setStatus(job, "video");
  } catch (err) {
    return fail(slug, err);
  }
}
