/**
 * Hand-painted puppets for a job whose look is "characters: puppet" (art.ts): every person of
 * the approved cast gets a puppet (animation/puppet/paint.ts), one per scheduler task (about
 * half an hour each), so a night's renders are never held up for long. Puppets go to the
 * library and are shared by every story with the same look, era and style.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { paintPuppet, puppetKey, PUPPETS_DIR } from "../animation/puppet/paint.ts";
import { artOf } from "./art.ts";
import type { Designed } from "./design.ts";
import { jobDir, loadJob, saveJob, type Job } from "./jobs.ts";

/** People of the cast (horses and animals stay vector) and which have no puppet yet. */
export async function castPuppets(job: Job): Promise<{ people: Designed[]; missing: Designed[] }> {
  const f = path.join(jobDir(job.slug), "cast.json");
  if (!(await exists(f))) return { people: [], missing: [] };
  const cast: Designed[] = JSON.parse(await fs.readFile(f, "utf8"));
  const style = artOf(job).style;
  const people = cast.filter((c) => c.kind === "human");
  const missing: Designed[] = [];
  for (const c of people) {
    if (!(await exists(path.join(PUPPETS_DIR, puppetKey(c.look as Record<string, unknown>, job.era, style), "parts", "rig.json")))) missing.push(c);
  }
  return { people, missing };
}

export const wantsPuppets = (job: Job) => artOf(job).characters === "puppet";

/** Paint the next missing puppet of a job; returns how many are still missing. */
export async function paintNextPuppet(slug: string, log: (s: string) => void = console.log): Promise<number> {
  let job = await loadJob(slug);
  const { people, missing } = await castPuppets(job);
  const c = missing[0];
  if (c) {
    log(`  puppet: ${c.name} (${people.length - missing.length + 1}/${people.length})`);
    await paintPuppet(c.look as Record<string, unknown>, { era: job.era, style: artOf(job).style, role: c.role, log });
  }
  job = await loadJob(slug);
  const left = Math.max(0, missing.length - (c ? 1 : 0));
  job.puppets = { done: people.length - left, total: people.length };
  await saveJob(job);
  // All painted: the costume sheet shows the puppets.
  if (left === 0 && c) {
    const { costumeSheet } = await import("./design.ts");
    await costumeSheet(slug);
  }
  return left;
}
