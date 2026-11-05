import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Local secrets such as PEXELS_API_KEY=… live in .env (git-ignored). Real env vars win.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}
export const FONTS_DIR = path.join(ROOT, "assets", "fonts");
export const FONT_FAMILY = "Noto Sans";

/** Bump when renderer output changes for the same input, so cached clips are rebuilt. */
export const RENDERER_VERSION = "3";

export const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

export const AUDIO_SAMPLE_RATE = 48_000;

/** Image backgrounds are upscaled by this factor before zoompan to avoid sub-pixel jitter. */
export const ZOOMPAN_SUPERSAMPLE = 3;

export const TIMEOUTS = {
  probeMs: 30_000,
  sceneMs: 10 * 60_000,
  assembleMs: 30 * 60_000,
};
