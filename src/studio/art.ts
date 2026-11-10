/**
 * A job's look: its drawing style (library/styles.json) and the intro and outro of the channel
 * (brand themes). The brain suggests them with the cast design; the user can change them on the
 * review page at any time before the film is rendered (after, a re-render applies them).
 * Jobs written before this get a suggestion from rules (no tokens).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/fs.ts";
import { BRAND_THEMES, DEFAULT_THEME } from "../animation/brand/brand.ts";
import { DEFAULT_STYLE, styles, suggestStyle } from "../animation/styles.ts";
import type { Job } from "./jobs.ts";

export interface Art {
  style: string;
  intro: string;
  outro: string;
  /** What the brain (or the rules) recommended, and why. */
  suggest: { style: string; intro: string; outro: string; why: string; by: "brain" | "rules" };
}

/** The intro and outro that go best with a style. */
export const THEME_FOR_STYLE: Record<string, string> = {
  hien_dai: "sach_truyen", dong_ho: "trong_dong", son_mai: "cuon_thu", lua: "den_long", mau_nuoc: "dong_que", sap_mau: "dong_que", cat_giay: "sach_truyen",
};

export const validStyle = (s: unknown): s is string => typeof s === "string" && s in styles();
export const validTheme = (s: unknown): s is string => typeof s === "string" && s in BRAND_THEMES;

export function suggestArt(job: Pick<Job, "topic" | "kind" | "era">): Art {
  const { style, why } = suggestStyle(job);
  const theme = THEME_FOR_STYLE[style] ?? DEFAULT_THEME;
  return { style, intro: theme, outro: theme, suggest: { style, intro: theme, outro: theme, why, by: "rules" } };
}

/** The job's look: chosen, else suggested. */
export function artOf(job: Job): Art {
  const a = job.art ?? suggestArt(job);
  return { ...a, style: validStyle(a.style) ? a.style : DEFAULT_STYLE, intro: validTheme(a.intro) ? a.intro : DEFAULT_THEME, outro: validTheme(a.outro) ? a.outro : DEFAULT_THEME };
}

/** Write the job's look into a project folder (project.json "style" and "brand"), if it has one. */
export async function syncArt(job: Job, projectDir: string): Promise<void> {
  const f = path.join(projectDir, "project.json");
  if (!(await exists(f))) return;
  const a = artOf(job), p = JSON.parse(await fs.readFile(f, "utf8"));
  if (p.style === a.style && p.brand?.intro === a.intro && p.brand?.outro === a.outro) return;
  await fs.writeFile(f, JSON.stringify({ ...p, style: a.style, brand: { ...(p.brand ?? {}), intro: a.intro, outro: a.outro } }, null, 2));
}
