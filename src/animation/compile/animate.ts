/**
 * Storyboard → cartoon scene scripts, automatically:
 *
 *   node src/animation/compile/animate.ts projects/<name> [--out anim] [--force] [--model gemma3:4b]
 *
 * Reads the storyboard (narration word for word, chapters) and, when the voice is built,
 * timeline.json for each scene's exact length. The local LLM designs the cast and plans the
 * scenes from menus; fixed rules check the plans against the narration; the compiler writes
 * one script per scene (sNN.json) that `story.ts` renders. Existing scripts are kept unless
 * --force (they may have been edited by hand).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ollama, type LlmProvider } from "../../script/providers.ts";
import type { ParsedStory } from "../../story/parse.ts";
import { exists, writeFileAtomic } from "../../utils/fs.ts";
import { completeCast, designCartoonCast, fixPlan, planChapter, transformationScenes } from "./plan.ts";
import { compileScene, type CastMember, type ScenePlan } from "./scene.ts";

const WORDS_PER_SECOND = 3.7;

export interface AnimateOptions {
  out?: string;
  force?: boolean;
  model?: string;
  /** The brain to ask (default: the local model). */
  provider?: LlmProvider;
  log?: (s: string) => void;
}

export async function animate(projectDir: string, opts: AnimateOptions = {}): Promise<string[]> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const dir = path.resolve(projectDir);
  const storyboard = JSON.parse(await fs.readFile(path.join(dir, "storyboard.json"), "utf8"));
  const scenes: { narration: string; chapter?: string }[] = storyboard.scenes;
  const chapterNames: string[] = [];
  const parsed: ParsedStory = {
    chapters: chapterNames,
    dropped: [],
    scenes: scenes.map((s) => {
      if (!chapterNames.includes(s.chapter ?? "")) chapterNames.push(s.chapter ?? "");
      return { chapter: chapterNames.indexOf(s.chapter ?? ""), narration: s.narration };
    }),
  };
  // Exact lengths from the built voice; an estimate before it exists.
  const timelineFile = path.join(dir, "timeline.json");
  const durations: number[] = (await exists(timelineFile))
    ? JSON.parse(await fs.readFile(timelineFile, "utf8")).scenes.map((s: { durationFrames: number }, _: number, a: unknown[]) => s.durationFrames / 30)
    : scenes.map((s) => Math.round((s.narration.split(/\s+/).length / WORDS_PER_SECOND + 0.8) * 100) / 100);
  if (durations.length !== scenes.length) throw new Error("timeline.json does not match the storyboard: build the voice again");

  const outDir = path.join(dir, opts.out ?? "anim");
  await fs.mkdir(outDir, { recursive: true });
  const provider = opts.provider ?? ollama(opts.model);
  await provider.check();
  let shown = 0;
  const progress = (step: string) => (n: number) => {
    if (n - shown >= 400 || n < shown) { shown = n; process.stdout.write(`\r  ${step}: ${n} characters…`); }
  };
  try {
    // The cast, kept between runs (it takes the model a minute or two).
    const castFile = path.join(outDir, "cast.auto.json");
    let cast: CastMember[];
    if (!opts.force && (await exists(castFile))) cast = JSON.parse(await fs.readFile(castFile, "utf8"));
    else {
      cast = await designCartoonCast(parsed, provider, progress("cast"));
      process.stdout.write("\n");
      await writeFileAtomic(castFile, JSON.stringify(cast, null, 2));
    }
    // The era (project.json "era", e.g. "van_lang") makes every look period-accurate.
    const project = (await exists(path.join(dir, "project.json"))) ? JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8")) : {};
    const era: string | undefined = project.era;
    if (era) log(`  era: ${era}`);
    const completed = completeCast(cast, parsed, era);
    cast = completed.cast;
    for (const c of cast) log(`  ${c.id}: ${c.name}${c.group ? " (crowd)" : ""}${c.formOf ? ` ← ${c.formOf}` : ""}`);

    // Plans, one LLM request per chapter; kept, so the rules can be tuned without asking again.
    const plansFile = path.join(outDir, "plans.auto.json");
    let plans: ScenePlan[] = [];
    if (!opts.force && (await exists(plansFile))) plans = JSON.parse(await fs.readFile(plansFile, "utf8"));
    if (plans.length !== scenes.length) {
      plans = [];
      for (let ch = 0; ch < chapterNames.length; ch++) {
        const indexes = parsed.scenes.flatMap((s, i) => (s.chapter === ch ? [i] : []));
        shown = 0;
        plans.push(...(await planChapter(parsed, cast, indexes, provider, progress(`chapter ${ch + 1}/${chapterNames.length}`))));
        process.stdout.write("\n");
      }
      await writeFileAtomic(plansFile, JSON.stringify(plans, null, 2));
    }
    for (const pl of plans) for (const a of pl.actors) a.id = completed.merged.get(a.id) ?? a.id;

    // Fix with the narration, follow form changes, compile.
    const formFrom = new Map(cast.filter((c) => c.formOf).map((c) => [c.id, c.formOf!]));
    const changes = new Set(transformationScenes(parsed));
    const transformed = new Map<string, string>(); // from → to, once it has happened
    const written: string[] = [];
    const fixedPlans: ScenePlan[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const name = `s${String(i + 1).padStart(2, "0")}`;
      const file = path.join(outDir, `${name}.json`);
      const keepFile = !opts.force && (await exists(file));
      // After a transformation, the earlier form is replaced by the new one.
      const plan = plans[i]!;
      for (const a of plan.actors) if (transformed.has(a.id)) a.id = transformed.get(a.id)!;
      const previous = i > 0 && parsed.scenes[i - 1]!.chapter === parsed.scenes[i]!.chapter ? fixedPlans[i - 1] : i > 0 ? { ...fixedPlans[i - 1]!, time: plan.time } : undefined;
      const { plan: fixed, transform } = fixPlan(plan, scenes[i]!.narration, cast, formFrom, changes.has(i), previous, transformed);
      const once = new Set<string>();
      fixed.actors = fixed.actors.filter((a) => (once.has(a.id) ? false : (once.add(a.id), true)));
      if (transform) transformed.set(transform.from, transform.to);
      fixedPlans[i] = transform ? { ...fixed, actors: [{ id: transform.to, place: "center", enter: "none", act: "heroic", face: "determined", then: "none", thenFace: "determined" }, ...fixed.actors] } : fixed;
      const script = { ...(era ? { era } : {}), ...compileScene(fixed, { duration: durations[i]!, cast, transform }) };
      if (keepFile) { log(`  ${name}: kept (exists)`); continue; }
      await writeFileAtomic(file, `${JSON.stringify({ narration: scenes[i]!.narration, plan: fixed, ...script }, null, 2)}\n`);
      log(`  ${name}: ${fixed.set}/${fixed.time} · ${fixed.actors.map((a) => `${a.id} ${a.act}${a.then !== "none" ? `→${a.then}` : ""}`).join(", ")}${fixed.crowd ? ` · crowd ${fixed.crowd.id}×${fixed.crowd.count}` : ""}${transform ? ` · ${transform.from}⇒${transform.to}` : ""}`);
      written.push(file);
    }
    return written;
  } finally {
    await provider.release();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const project = args.find((a) => !a.startsWith("--") && !["--out", "--model"].includes(args[args.indexOf(a) - 1] ?? ""));
  if (!project) {
    console.error("usage: node src/animation/compile/animate.ts projects/<name> [--out anim] [--force] [--model gemma3:4b]");
    process.exit(2);
  }
  const val = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const files = await animate(project, { out: val("--out"), model: val("--model"), force: args.includes("--force") });
  console.log(`✔ ${files.length} scene scripts`);
}
