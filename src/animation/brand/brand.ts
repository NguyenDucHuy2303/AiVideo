/**
 * The channel's identity (assets/brand/brand.json): logo, watermark, intro, outro and
 * thumbnails, all drawn by brand.html (a Đông Sơn drum face with the channel name).
 * Rendered once per shape and kept in assets/brand/; delete a file to draw it again.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderSoundtrack } from "../../audio/soundtrack.ts";
import { FFMPEG, ROOT } from "../../config.ts";
import { exists } from "../../utils/fs.ts";
import { run } from "../../utils/process.ts";
import { capture, still } from "../capture.ts";

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "brand.html");
export const BRAND_DIR = path.join(ROOT, "assets", "brand");
const INTRO_S = 3, OUTRO_S = 5, END_S = 2.5;

export interface Brand { name: string; tagline: string; owner?: string }

export async function loadBrand(): Promise<Brand | undefined> {
  const f = path.join(BRAND_DIR, "brand.json");
  return (await exists(f)) ? JSON.parse(await fs.readFile(f, "utf8")) : undefined;
}

/** logo.png (1024², with the name) and watermark.png (256², the drum only), transparent. */
export async function brandStills(brand: Brand): Promise<{ logo: string; watermark: string }> {
  const logo = path.join(BRAND_DIR, "logo.png"), watermark = path.join(BRAND_DIR, "watermark.png");
  if (!(await exists(logo))) await still({ page: PAGE, width: 1024, height: 1024, output: logo, transparent: true, params: { mode: "logo", brand, width: 1024, height: 1024 } });
  if (!(await exists(watermark))) await still({ page: PAGE, width: 256, height: 256, output: watermark, transparent: true, params: { mode: "logo", withName: false, brand, width: 256, height: 256 } });
  return { logo, watermark };
}

/** The intro or outro clip for a shape, with its sound. */
export async function brandClip(brand: Brand, kind: "intro" | "outro" | "end", vertical: boolean): Promise<string> {
  const [W, H] = vertical ? [1080, 1920] : [1920, 1080];
  const file = path.join(BRAND_DIR, `${kind}_${vertical ? "9x16" : "16x9"}.mp4`);
  if (await exists(file)) return file;
  const seconds = kind === "intro" ? INTRO_S : kind === "end" ? END_S : OUTRO_S;
  const picture = `${file}.picture.mp4`, sound = `${file}.wav`;
  await capture({ page: PAGE, width: W, height: H, fps: 30, seconds, output: picture, params: { mode: kind, brand, width: W, height: H, duration: seconds } });
  await renderSoundtrack(
    [{ start: 0, duration: seconds, mood: kind === "intro" ? "majestic" : "calm" }],
    kind === "end" ? [{ type: "boom", at: 0.15 }, { type: "shimmer", at: 0.25 }, { type: "chime", at: 0.6 }] : kind === "intro"
      ? [{ type: "drums", at: 0 }, { type: "boom", at: 0.75 }, { type: "shimmer", at: 0.9 }, { type: "chime", at: 1.3 }]
      : [{ type: "chime", at: 0.2 }, { type: "whoosh", at: 1.8 }, { type: "boom", at: 2.6 }, { type: "shimmer", at: 2.7 }],
    seconds, sound,
  );
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", picture, "-i", sound, "-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000", "-shortest", file], { timeoutMs: 120_000 });
  await fs.rm(picture, { force: true });
  await fs.rm(sound, { force: true });
  return file;
}

/** A thumbnail (1280×720 JPEG) from a moment of the film, with the title and the logo. */
export async function thumbnail(brand: Brand, film: string, at: number, title: string, subtitle: string, output: string): Promise<string> {
  const frame = `${output}.frame.png`;
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-ss", at.toFixed(2), "-i", film, "-frames:v", "1", "-vf", "scale=1280:720", frame], { timeoutMs: 30_000 });
  const png = `${output}.png`;
  await still({ page: PAGE, width: 1280, height: 720, output: png, params: { mode: "thumb", brand, width: 1280, height: 720, frame: pathToFileURL(frame).href, title, subtitle } });
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", png, "-q:v", "2", output], { timeoutMs: 30_000 });
  await fs.rm(frame, { force: true });
  await fs.rm(png, { force: true });
  return output;
}
