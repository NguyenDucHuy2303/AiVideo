import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { generateStoryboard, ScriptError } from "../script/generate.ts";
import type { ScriptRequest } from "../script/prompt.ts";
import { ollama } from "../script/providers.ts";
import { TimelineError } from "../schema/load.ts";
import { exists, slugify, writeFileAtomic } from "../utils/fs.ts";

export interface ScriptOptions {
  name?: string;
  durationSec: number;
  scenes?: number;
  notes?: string;
  model?: string;
  force: boolean;
}

/** topic → projects/<name>/storyboard.json, written by a local LLM and validated. Returns the storyboard path. */
export async function writeScript(topic: string, opts: ScriptOptions): Promise<string> {
  const projectDir = path.join(ROOT, "projects", slugify(opts.name ?? topic));
  const storyboardFile = path.join(projectDir, "storyboard.json");
  // A storyboard may have been edited by hand: never replace it silently.
  if (!opts.force && (await exists(storyboardFile))) {
    throw new TimelineError(`${path.relative(ROOT, storyboardFile)} already exists. Use --force to replace it, or --name for a new project.`);
  }

  const req: ScriptRequest = {
    topic,
    durationSec: opts.durationSec,
    scenes: opts.scenes ?? Math.min(12, Math.max(3, Math.round(opts.durationSec / 9))),
    notes: opts.notes,
  };
  const provider = ollama(opts.model);
  await provider.check();
  console.log(`writing ${req.scenes} scenes (~${req.durationSec}s) with ${provider.id}/${provider.model}…`);

  const logDir = path.join(projectDir, "build", "logs");
  const saveTranscript = (transcript: unknown) =>
    writeFileAtomic(path.join(logDir, `script-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ request: req, model: provider.model, transcript }, null, 2));

  let lastLine = 0;
  try {
    const result = await generateStoryboard(req, provider, {
      onProgress: (chars, attempt) => {
        if (chars - lastLine >= 400 || chars < lastLine) {
          lastLine = chars;
          process.stdout.write(`\r  attempt ${attempt}: ${chars} characters…`);
        }
      },
    });
    process.stdout.write("\n");
    await saveTranscript(result.transcript);
    for (const w of result.warnings) console.warn(`⚠ ${w}`);

    await fs.mkdir(projectDir, { recursive: true });
    await writeFileAtomic(storyboardFile, `${JSON.stringify(result.storyboard, null, 2)}\n`);
    const settings = path.join(projectDir, "project.json");
    if (!(await exists(settings))) await writeFileAtomic(settings, `${JSON.stringify({ engine: "piper", speed: 1 }, null, 2)}\n`);

    console.log(`✔ "${result.storyboard.title}" — ${result.storyboard.scenes.length} scenes, valid after ${result.attempts} attempt(s)`);
    console.log(`  ${storyboardFile}`);
    return storyboardFile;
  } catch (err) {
    process.stdout.write("\n");
    if (err instanceof ScriptError) await saveTranscript(err.transcript);
    throw err;
  } finally {
    await provider.release();
  }
}
