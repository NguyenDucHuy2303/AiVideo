import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { FFMPEG, TIMEOUTS } from "../config.ts";
import { extractJson } from "../script/generate.ts";
import type { LlmProvider } from "../script/providers.ts";
import { tmpPathFor } from "../utils/fs.ts";
import { run } from "../utils/process.ts";

/** What the vision model reports about one photo. */
export const ImageTags = z.object({
  description: z.string().min(5).max(200),
  tags: z.array(z.string().min(2).max(30)).min(4).max(15),
  subject: z.object({
    horizontal: z.enum(["left", "center", "right"]),
    vertical: z.enum(["top", "middle", "bottom"]),
  }),
});
export type ImageTags = z.infer<typeof ImageTags>;

const PROMPT = [
  "Describe this photo for a stock-photo search index.",
  "- description: one plain English sentence saying what is visible.",
  "- tags: 6–12 lowercase English keywords: the main subjects, the setting, time of day, colors, mood,",
  "  and the topics a video could use it for (e.g. \"sleep\", \"health\", \"work\"). Single words where possible.",
  "- subject: where the main subject sits in the frame, so the picture can be cropped without cutting it off.",
  "Only describe what you can see. Output only the JSON object.",
].join("\n");

/** Crop point for the cover-scaled background, from the model's coarse subject position. */
export function focusFrom(subject: ImageTags["subject"]): { x: number; y: number } {
  const x = { left: 0.3, center: 0.5, right: 0.7 }[subject.horizontal];
  const y = { top: 0.3, middle: 0.5, bottom: 0.7 }[subject.vertical];
  return { x, y };
}

/** Words that describe every photo, so they would only cause wrong matches. */
const GENERIC = new Set(["photo", "photograph", "photography", "image", "picture", "beauty", "beautiful", "background", "close-up", "closeup"]);

/** Lowercase, de-duplicated keywords ("night_sky" → "night sky"), without generic words. */
export function cleanTags(tags: string[]): string[] {
  const clean = tags.map((t) => t.toLowerCase().replace(/[_\s]+/g, " ").trim());
  return [...new Set(clean.filter((t) => t.length >= 2 && !GENERIC.has(t)))];
}

/**
 * Ask a vision model about one image and parse the reply against `schema` (2 attempts). The
 * image is downscaled first: vision encoders work at ~900px anyway, and a 4K PNG would only
 * cost memory and time.
 */
async function askAboutImage<T extends z.ZodType>(file: string, prompt: string, schema: T, provider: LlmProvider, workDir: string): Promise<z.output<T>> {
  await fs.mkdir(workDir, { recursive: true });
  const preview = tmpPathFor(path.join(workDir, "preview.jpg"));
  try {
    await run(
      FFMPEG,
      ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", file, "-frames:v", "1", "-vf", "scale=896:896:force_original_aspect_ratio=decrease", "-q:v", "3", preview],
      { timeoutMs: TIMEOUTS.probeMs },
    );
    const image = (await fs.readFile(preview)).toString("base64");
    const jsonSchema = z.toJSONSchema(schema);
    let lastError = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const reply = await provider.chat({ messages: [{ role: "user", content: prompt, images: [image] }], schema: jsonSchema, temperature: attempt === 1 ? 0.2 : 0.5 });
      try {
        const parsed = schema.safeParse(extractJson(reply));
        if (parsed.success) return parsed.data;
        lastError = z.prettifyError(parsed.error);
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    throw new Error(`the vision model gave no usable answer: ${lastError}`);
  } finally {
    await fs.rm(preview, { force: true });
  }
}

/** Tag one image with a local vision model. */
export async function tagImage(file: string, provider: LlmProvider, workDir: string): Promise<ImageTags> {
  const t = await askAboutImage(file, PROMPT, ImageTags, provider, workDir);
  return { ...t, tags: cleanTags(t.tags) };
}

export const FitVerdict = z.object({
  shows: z.string().max(200),
  kind: z.enum(["photo", "illustration", "diagram", "screenshot", "other"]),
  fit: z.int().min(0).max(10),
});
export type FitVerdict = z.infer<typeof FitVerdict>;

/** Lowest `fit` score accepted for a scene background. */
export const MIN_FIT = 6;

/**
 * A verdict is usable when the picture fits and is a picture, not a chart or screenshot
 * whose labels would fight the video's own text. (Asking the 4B model directly whether an
 * image "has text" was tried: it answered yes for nearly every photo.)
 */
export function acceptable(v: FitVerdict): boolean {
  return v.fit >= MIN_FIT && (v.kind === "photo" || v.kind === "illustration");
}

/** Judge whether a downloaded image suits a scene, before it goes into a video. */
export function judgeFit(file: string, query: string, provider: LlmProvider, workDir: string): Promise<FitVerdict> {
  const prompt = [
    `A video scene needs a background picture of: "${query}".`,
    "- shows: one short English sentence saying what this image actually shows.",
    "- kind: photo, illustration, diagram (charts, labeled figures, infographics), screenshot or other.",
    `- fit: 0–10, how well the image shows "${query}". 10 = exactly that; 5 = related but a different subject; 0 = unrelated.`,
    "Be strict: a dog is not a child, an office party is not a brain. Output only the JSON object.",
  ].join("\n");
  return askAboutImage(file, prompt, FitVerdict, provider, workDir);
}
