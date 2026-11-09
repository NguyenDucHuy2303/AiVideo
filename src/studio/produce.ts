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
import { run } from "../utils/process.ts";
import { claudeProvider } from "../brain/claude.ts";
import { animate } from "../animation/compile/animate.ts";
import { withBackdrop } from "../animation/backdrops.ts";
import { loadScene } from "../animation/render.ts";
import { renderStory } from "../animation/story.ts";
import { costumeSheet, designCast, type Designed } from "./design.ts";
import { jobDir, loadJob, saveJob, setStatus, type Job } from "./jobs.ts";
import { writeScript, type Plan } from "./write.ts";

export const projectOf = (slug: string) => path.join(ROOT, "projects", slug);

async function fail(slug: string, err: unknown): Promise<Job> {
  const job = await loadJob(slug);
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
    log(`  cast and costume sheet`);
    await designCast(slug, log);
    await costumeSheet(slug);
    job = await loadJob(slug);
    return setStatus(job, "review", problems.length ? `${problems.length} vấn đề còn lại: ${problems.slice(0, 3).join(" ")}` : undefined);
  } catch (err) {
    return fail(slug, err);
  }
}

/** Approved (or sent back with a note on the video): everything but the film itself. */
export async function prepare(slug: string, log: (s: string) => void = console.log): Promise<Job> {
  try {
    let job = await loadJob(slug);
    const dir = jobDir(slug), proj = projectOf(slug), anim = path.join(proj, "anim");
    const fixing = job.status === "fix";
    job = await setStatus(job, "producing", fixing ? "sửa theo góp ý" : "chuẩn bị");
    const plan: Plan = JSON.parse(await fs.readFile(path.join(dir, "plan.json"), "utf8"));
    const cast: Designed[] = JSON.parse(await fs.readFile(path.join(dir, "cast.json"), "utf8"));
    await fs.mkdir(anim, { recursive: true });
    // The project the cartoon tools read: the script's lines are the scenes.
    const script = await fs.readFile(path.join(dir, "script.txt"), "utf8");
    await fs.writeFile(path.join(proj, "script.txt"), script);
    const lines = script.trim().split("\n").slice(1);
    await fs.writeFile(path.join(proj, "storyboard.json"), JSON.stringify({
      title: plan.title, kind: "story",
      scenes: lines.map((narration) => ({ narration, chapter: plan.title, onScreen: {}, visual: { description: "ancient Vietnam", mood: "calm" }, camera: "ken_burns", transition: "cut" })),
    }, null, 2));
    const speakers: Record<string, string[]> = {};
    for (const c of cast) for (const name of c.speaks) (speakers[name] ??= []).push(c.id);
    const project = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8"));
    const subtitle = { "lịch sử": "Lịch sử Việt Nam", "truyền thuyết": "Truyền thuyết Việt Nam", "ngụ ngôn": "Truyện ngụ ngôn Việt Nam" }[job.kind ?? ""] ?? "Truyện cổ tích Việt Nam";
    await fs.writeFile(path.join(proj, "project.json"), JSON.stringify({ ...project, speakers, thumbnail: { title: plan.title.replace(/\s*[–-]\s*/g, " "), subtitle } }, null, 2));

    // Voices (the timing of everything else).
    if (!(await exists(path.join(proj, "timeline.json"))) || !fixing) {
      log("  voices");
      await run(process.execPath, [path.join(ROOT, "src", "cli.ts"), "build", path.join(proj, "storyboard.json"), "--voice-only"], { cwd: ROOT, timeoutMs: 60 * 60_000 });
    }
    // Scene direction by the brain, with the approved cast; a video note goes to the director.
    const notes = job.notes.filter((n) => n.on === "video").map((n) => n.text);
    await fs.writeFile(path.join(anim, "cast.auto.json"), JSON.stringify(cast.map(({ speaks: _s, role: _r, ...c }) => c), null, 2));
    if (fixing) for (const f of await fs.readdir(anim)) if (/^s\d.*\.json$|^plans\.auto\.json$/.test(f)) await fs.rm(path.join(anim, f));
    log("  scene direction");
    await animate(proj, { provider: claudeProvider(slug, "produce", "sonnet", log, notes), log: () => {} });
    // Backdrops painted now (light hours: few threads), so the night only renders.
    log("  backdrops");
    for (const f of (await fs.readdir(anim)).filter((f) => /^s\d.*\.json$/.test(f)).sort()) await withBackdrop(await loadScene(path.join(anim, f)));
    job = await loadJob(slug);
    job.stage = "ready";
    await saveJob(job);
    return setStatus(job, "producing", "sẵn sàng render");
  } catch (err) {
    return fail(slug, err);
  }
}

/** The film (heavy: nights and weekends). */
export async function render(slug: string, log: (s: string) => void = console.log): Promise<Job> {
  try {
    let job = await loadJob(slug);
    job = await setStatus(job, "producing", "đang render");
    const out = await renderStory(projectOf(slug), { onLog: log });
    const dir = jobDir(slug);
    for (const [from, to] of [[out, "video.mp4"], [out.replace(/\.mp4$/, "_thumbnail.jpg"), "thumbnail.jpg"]] as const) {
      const target = path.join(dir, to);
      await fs.rm(target, { force: true });
      await fs.link(from, target).catch(() => fs.copyFile(from, target));
    }
    job = await loadJob(slug);
    delete job.stage;
    await saveJob(job);
    return setStatus(job, "video");
  } catch (err) {
    return fail(slug, err);
  }
}
