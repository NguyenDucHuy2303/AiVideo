import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { doctor } from "./commands/doctor.ts";
import { makeFixtures } from "./commands/fixtures.ts";
import { totalFrames, type Encoder } from "./renderer/ffmpeg/assemble.ts";
import { renderTimeline } from "./renderer/index.ts";
import { loadTimeline, TimelineError } from "./schema/load.ts";
import { PROFILE_IDS, type ProfileId } from "./schema/timeline.ts";
import { buildProject } from "./storyboard/build.ts";
import { listVoices, say } from "./commands/tts.ts";
import { writeScript } from "./commands/script.ts";
import { addToLibrary, listLibrary } from "./commands/library.ts";
import { sdTurbo } from "./imagegen/sd.ts";
import { writeStory } from "./commands/story.ts";
import { killAllChildren, wasInterrupted } from "./utils/process.ts";

// First Ctrl+C: stop ffmpeg and let the renderer release its lock and clean up. Second: exit now.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (wasInterrupted()) process.exit(130);
    console.error(`\n${signal}: stopping…`);
    killAllChildren();
    // Long-running commands (the studio's web server) would never end by themselves.
    setTimeout(() => process.exit(signal === "SIGTERM" ? 143 : 130), 3000);
  });
}

const HELP = `wata — timeline.json → MP4 (9:16 + 16:9), fully local

Usage:
  npm run wata -- doctor                     check ffmpeg, fonts, TTS, disk, memory
  npm run wata -- script "<topic>" [--name NAME] [--duration 60] [--scenes N] [--notes "…"] [--model gemma3:4b] [--force] [--build] [--render]
                                             local LLM (Ollama) writes projects/NAME/storyboard.json
  npm run wata -- story <script.txt> [--name NAME] [--title "…"] [--model gemma3:4b] [--force] [--render]
                                             your story script, word for word → animated story video (AI designs the pictures)
  npm run wata -- build <storyboard.json> [--voice ID] [--speed 1.0] [--engine piper|vieneu|kokoro|dummy] [--offline] [--voice-only] [--render]
                                             storyboard → TTS → photos (library, else Pexels/Openverse) → timeline.json (→ MP4)
  npm run wata -- animate <projects/NAME> [--force] [--model gemma3:4b] [--out anim]
                                             storyboard → cartoon scene scripts (projects/NAME/anim/sNN.json), designed by the local LLM
  npm run wata -- cartoon <projects/NAME> [--vertical] [--after 18:00] [--out anim] [--chapters] [--tag NAME] [--no-brand]
                                             scene scripts → the whole story as a cartoon MP4 (--after: wait until that time to start;
                                             with assets/brand/brand.json: channel intro, logo, outro, thumbnail)
  npm run wata -- topics [--count 5]         the brain proposes new topics and starts a job for each (studio/jobs/)
  npm run wata -- write <job|"topic"> [--era KEY]   research + write the job's script (5–8 min, dialogue) for review
  npm run wata -- studio [--port 5175] [--no-scheduler]
                                             the studio: web page at http://127.0.0.1:5175 (review scripts, costume sheets,
                                             videos; tokens) + the scheduler (light work in office hours, renders at night)
  npm run wata -- produce <job> --test 6   test the whole production on the first 6 scenes (projects/<job>-thu)
  npm run wata -- era <key> --title "<thời đại>"   research and build a missing era into the library (eras.json)
  npm run wata -- tokens                     what the brain (Claude) has spent: today, per job, per step
  npm run wata -- validate <timeline.json>   check a timeline without rendering
  npm run wata -- render <timeline.json> [--profile 9x16|16x9] [--encoder x264|qsv] [--force]
  npm run wata -- library add <images|folders…> --to NAME [--license "…"] [--source "…"] [--tags "a,b"] [--model gemma3:4b] [--retag]
                                             add photos to assets/library/NAME; a local vision model tags them unless --tags
  npm run wata -- library list               image libraries and what they lack
  npm run wata -- imagine "<English prompt>" [-o out.png]   try the local image generator
  npm run wata -- voices                     list Vietnamese voices and their licenses
  npm run wata -- say "<text>" [--voice ID] [--speed 1.0] [-o out.wav]   listen to a voice
  npm run wata -- fixtures [--force]         generate demo assets for fixtures/demo
`;

/** Wait until a time of day ("18:00"), for long renders outside office hours. */
async function waitUntil(hhmm: string): Promise<void> {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new TimelineError(`--after needs a time like 18:00, not "${hhmm}"`);
  const now = new Date(), at = new Date(now);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (at <= now) return;
  console.log(`waiting until ${hhmm} to start (${Math.round((at.getTime() - now.getTime()) / 60000)} min)…`);
  await new Promise((r) => setTimeout(r, at.getTime() - now.getTime()));
}

function parseEncoder(value: string | undefined): Encoder {
  if (value !== "x264" && value !== "qsv") throw new TimelineError(`unknown encoder "${value}" (use x264 or qsv)`);
  return value;
}

function parseEngine(value: string | undefined): "piper" | "vieneu" | "kokoro" | "dummy" | undefined {
  if (value === undefined || value === "piper" || value === "vieneu" || value === "kokoro" || value === "dummy") return value;
  throw new TimelineError(`unknown TTS engine "${value}" (use piper, vieneu or dummy)`);
}

function parseIntIn(value: string, flag: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new TimelineError(`${flag} must be a whole number from ${min} to ${max} (got "${value}")`);
  return n;
}

function parseSpeed(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 2) throw new TimelineError(`--speed must be between 0.5 and 2 (got "${value}")`);
  return n;
}

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      profile: { type: "string", multiple: true },
      encoder: { type: "string", default: "x264" },
      force: { type: "boolean", default: false },
      voice: { type: "string" },
      speed: { type: "string" },
      engine: { type: "string" },
      output: { type: "string", short: "o" },
      render: { type: "boolean", default: false },
      build: { type: "boolean", default: false },
      name: { type: "string" },
      title: { type: "string" },
      duration: { type: "string", default: "60" },
      scenes: { type: "string" },
      notes: { type: "string" },
      count: { type: "string" },
      era: { type: "string" },
      model: { type: "string" },
      to: { type: "string" },
      tags: { type: "string" },
      source: { type: "string" },
      license: { type: "string" },
      retag: { type: "boolean", default: false },
      offline: { type: "boolean", default: false },
      vertical: { type: "boolean", default: false },
      after: { type: "string" },
      chapters: { type: "boolean", default: false },
      tag: { type: "string" },
      "voice-only": { type: "boolean", default: false },
      "no-brand": { type: "boolean", default: false },
      "no-scheduler": { type: "boolean", default: false },
      port: { type: "string" },
      test: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, file] = positionals;

  if (values.help || !command) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "doctor":
      return (await doctor()) ? 0 : 1;

    case "fixtures":
      await makeFixtures(values.force);
      return 0;

    case "library": {
      if (file === "list") {
        await listLibrary();
        return 0;
      }
      if (file !== "add") throw new TimelineError('use "library add <images|folders…> --to NAME" or "library list"');
      const inputs = positionals.slice(2);
      if (!inputs.length || !values.to) throw new TimelineError("library add needs images or folders and --to NAME");
      const tags = values.tags?.split(",").map((t) => t.trim()).filter(Boolean);
      if (values.tags !== undefined && !tags?.length) throw new TimelineError("--tags needs at least one tag");
      await addToLibrary(inputs, { to: values.to, tags, source: values.source, license: values.license, model: values.model, retag: values.retag });
      return 0;
    }

    case "imagine": {
      if (!file) throw new TimelineError('imagine needs a prompt, e.g. imagine "a cozy bedroom at night"');
      const gen = await sdTurbo();
      if (!gen) throw new TimelineError("the image generator is not installed — run: bash scripts/setup-imagegen.sh");
      const started = Date.now();
      const out = await gen.generate(file, path.join(os.tmpdir(), "wata-imagine"));
      const dest = path.resolve(values.output ?? "imagine.png");
      await fs.copyFile(out.file, dest);
      console.log(`✔ ${dest} (${out.cached ? "cached" : `${((Date.now() - started) / 1000).toFixed(1)}s`})`);
      return 0;
    }

    case "voices":
      await listVoices();
      return 0;

    case "say": {
      if (!file) throw new TimelineError('say needs text, e.g. say "Xin chào"');
      await say(file, { voice: values.voice, speed: parseSpeed(values.speed), engine: parseEngine(values.engine), output: values.output });
      return 0;
    }

    case "story":
    case "script":
    case "build": {
      if (!file) {
        throw new TimelineError(
          command === "script" ? 'script needs a topic, e.g. script "Tại sao cần ngủ đủ giấc"' : command === "story" ? "story needs a script file, e.g. story projects/thanh-giong/script.txt" : "build needs a storyboard.json path",
        );
      }
      let storyboard = file;
      if (command === "story") {
        storyboard = await writeStory(file, { name: values.name, title: values.title, model: values.model, force: values.force });
        if (!values.build && !values.render) {
          console.log(`Next: review/edit it, then npm run wata -- build ${storyboard} --render`);
          return 0;
        }
      } else if (command === "script") {
        storyboard = await writeScript(file, {
          name: values.name,
          durationSec: parseIntIn(values.duration, "--duration", 15, 600),
          scenes: values.scenes === undefined ? undefined : parseIntIn(values.scenes, "--scenes", 1, 40),
          notes: values.notes,
          model: values.model,
          force: values.force,
        });
        if (!values.build && !values.render) {
          console.log(`Next: review/edit it, then npm run wata -- build ${storyboard} --render`);
          return 0;
        }
      }
      const result = await buildProject(storyboard, { voice: values.voice, speed: parseSpeed(values.speed), engine: parseEngine(values.engine), offline: values.offline, voiceOnly: values["voice-only"] });
      console.log(`\nTimeline: ${result.timelineFile} (${result.durationSec.toFixed(1)}s)`);
      if (!values.render) {
        console.log(`Next: npm run wata -- render ${result.timelineFile}`);
        return 0;
      }
      const report = await renderTimeline(result.timelineFile, { encoder: parseEncoder(values.encoder) });
      console.log("\nOutputs:");
      for (const o of report.outputs) console.log(`  ${o.profile.padEnd(5)} ${o.file}${o.cached ? " (unchanged)" : ""}`);
      return 0;
    }

    case "topics": {
      const { proposeTopics } = await import("./studio/topics.ts");
      const { newJob } = await import("./studio/jobs.ts");
      const fsp = await import("node:fs/promises");
      const pathm = await import("node:path");
      const topics = await proposeTopics(Number(values.count ?? 5), console.log);
      for (const t of topics) {
        const job = await newJob(t.title, { kind: t.kind, era: t.era, summary: t.summary });
        await fsp.writeFile(pathm.join("studio", "jobs", job.slug, "topic.json"), JSON.stringify(t, null, 2));
        console.log(`  + ${job.slug}  [${t.era}${t.newEra ? " — thời đại mới" : ""}]  ${t.summary}`);
      }
      return 0;
    }

    case "write": {
      if (!file) throw new TimelineError('write needs a job or a topic, e.g. write "Sơn Tinh Thủy Tinh"');
      const { listJobs, newJob } = await import("./studio/jobs.ts");
      const { writeJob } = await import("./studio/produce.ts");
      const job = (await listJobs()).find((j) => j.slug === file || j.topic === file) ?? (await newJob(file, { era: values.era }));
      const done = await writeJob(job.slug);
      console.log(done.status === "review" ? `✔ studio/jobs/${done.slug}/script.txt — waiting for review${done.history.at(-1)?.info ? ` (${done.history.at(-1)!.info})` : ""}` : `✘ ${done.error}`);
      return done.status === "review" ? 0 : 1;
    }

    case "studio": {
      const { startServer } = await import("./studio/server.ts");
      const { runScheduler, schedulerState } = await import("./studio/schedule.ts");
      const port = Number(values.port ?? 5175);
      await startServer(port);
      console.log(`Studio: http://127.0.0.1:${port}`);
      const other = await schedulerState();
      if (values["no-scheduler"]) return await new Promise<number>(() => {});
      if (other && !other.lastError && other.pid !== process.pid) {
        console.log(`(the scheduler already runs, pid ${other.pid}: this one only serves the page)`);
        return await new Promise<number>(() => {});
      }
      return await runScheduler();
    }

    case "produce": {
      if (!file) throw new TimelineError("produce needs a job, e.g. produce son-tinh-thuy-tinh --test 6");
      const { testRun } = await import("./studio/produce.ts");
      const t0 = Date.now();
      const out = await testRun(file, Number(values.test ?? 6), console.log);
      console.log(`✔ ${out} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
      return 0;
    }

    case "era": {
      if (!file) throw new TimelineError('era needs a key, e.g. era co_tich_lang_que --title "Làng quê Bắc Bộ thời phong kiến"');
      const { buildEra } = await import("./studio/era.ts");
      const era = await buildEra(file, { eraName: values.title, job: `era-${file}` }, console.log);
      console.log(`✔ ${file}: ${era.name} · ${Object.keys(era.archetypes).join(", ")}`);
      return 0;
    }

    case "tokens": {
      const { ledger, weigh, brainSettings, spent } = await import("./brain/claude.ts");
      const cfg = await brainSettings(), all = await ledger();
      const fmt = (n: number) => n.toLocaleString("vi");
      console.log(`Today: ${fmt(await spent({ today: true }))} / ${fmt(cfg.perDayTokens)} tokens (weighted: cache reads count 1/10)`);
      const by = new Map<string, { n: number; t: number; out: number; s: number }>();
      for (const e of all) {
        const k = `${e.job} · ${e.step} · ${e.model}`, v = by.get(k) ?? { n: 0, t: 0, out: 0, s: 0 };
        by.set(k, { n: v.n + 1, t: v.t + weigh(e), out: v.out + e.output, s: v.s + e.seconds });
      }
      for (const [k, v] of by) console.log(`  ${k}: ${v.n} call(s), ${fmt(v.t)} tokens (${fmt(v.out)} written), ${v.s} s`);
      return 0;
    }

    case "animate": {
      if (!file) throw new TimelineError("animate needs a project folder, e.g. animate projects/thanh-giong");
      const { animate } = await import("./animation/compile/animate.ts");
      const files = await animate(file, { force: values.force, model: values.model, out: values.out });
      console.log(`✔ ${files.length} scene scripts. Next: npm run wata -- cartoon ${file}`);
      return 0;
    }

    case "cartoon": {
      if (!file) throw new TimelineError("cartoon needs a project folder, e.g. cartoon projects/thanh-giong");
      if (values.after) await waitUntil(values.after);
      const { renderStory } = await import("./animation/story.ts");
      const out = await renderStory(file, { vertical: values.vertical, anim: values.out, chapters: values.chapters, tag: values.tag, brand: !values["no-brand"] });
      console.log(`✔ ${out}`);
      return 0;
    }

    case "validate": {
      if (!file) throw new TimelineError("validate needs a timeline.json path");
      const { timeline, warnings } = await loadTimeline(file);
      for (const w of warnings) console.warn(`⚠ ${w}`);
      console.log(`✔ valid: "${timeline.title}", ${timeline.scenes.length} scenes, ${(totalFrames(timeline.scenes) / timeline.fps).toFixed(1)}s`);
      return 0;
    }

    case "render": {
      if (!file) throw new TimelineError("render needs a timeline.json path");
      const profiles = values.profile?.map((p) => {
        if (!(PROFILE_IDS as readonly string[]).includes(p)) throw new TimelineError(`unknown profile "${p}" (use ${PROFILE_IDS.join(" or ")})`);
        return p as ProfileId;
      });
      const report = await renderTimeline(file, { profiles, force: values.force, encoder: parseEncoder(values.encoder) });
      console.log("\nOutputs:");
      for (const o of report.outputs) console.log(`  ${o.profile.padEnd(5)} ${o.file}${o.cached ? " (unchanged)" : ""}`);
      console.log(`Log: ${report.logFile}`);
      return 0;
    }

    default:
      console.error(`unknown command "${command}"\n\n${HELP}`);
      return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (wasInterrupted()) {
      console.error("✘ interrupted — finished scenes are cached; run the same command to resume");
      process.exit(130);
    }
    console.error(err instanceof TimelineError ? `✘ ${err.message}` : `✘ ${(err as Error).message ?? err}`);
    process.exit(1);
  },
);
