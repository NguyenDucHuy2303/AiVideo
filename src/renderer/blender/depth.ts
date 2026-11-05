import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FFMPEG, ROOT } from "../../config.ts";
import { exists, hashFile, tmpPathFor } from "../../utils/fs.ts";
import { probe } from "../../utils/probe.ts";
import { run } from "../../utils/process.ts";

/**
 * Depth maps for paintings (Depth Anything V2 Small, installed by scripts/setup-3d.sh), so the
 * Blender stage can give each part of a painting its own distance. Without the model the
 * stage falls back to a ground plane under a horizon.
 */
const DIR = path.join(ROOT, "vendor", "depth");
const PYTHON = path.join(DIR, "venv", "bin", "python");
const MODEL = path.join(DIR, "depth-anything-v2-small.onnx");
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "depth.py");
/** The model's patch size; its native resolution is 518 on the short side. */
const PATCH = 14;
const SHORT_SIDE = 518;
const TIMEOUT_MS = 3 * 60_000;

export async function depthAvailable(): Promise<boolean> {
  return (await exists(PYTHON)) && (await exists(MODEL));
}

/** 16-bit grey PNG next to the cache; nearer is brighter. Cached by the painting's content. */
export async function depthMap(painting: string, cacheDir: string): Promise<string> {
  const file = path.join(cacheDir, `depth-${(await hashFile(painting)).slice(0, 12)}.png`);
  if (await exists(file)) return file;
  await fs.mkdir(cacheDir, { recursive: true });
  const v = (await probe(painting)).streams.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) throw new Error(`${painting} is not an image`);
  const [pw, ph] = [v.width, v.height];
  const scale = SHORT_SIDE / Math.min(pw, ph);
  const w = Math.round((pw * scale) / PATCH) * PATCH;
  const h = Math.round((ph * scale) / PATCH) * PATCH;
  const rgb = tmpPathFor(path.join(cacheDir, "depth-in.rgb"));
  const raw = tmpPathFor(path.join(cacheDir, "depth-out.raw"));
  const tmp = tmpPathFor(file);
  try {
    await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", painting, "-vf", `scale=${w}:${h}:flags=bicubic`, "-f", "rawvideo", "-pix_fmt", "rgb24", rgb], { timeoutMs: 30_000 });
    await run(PYTHON, [SCRIPT, MODEL, String(w), String(h), rgb, raw], { timeoutMs: TIMEOUT_MS });
    await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "gray16le", "-s", `${w}x${h}`, "-i", raw, "-frames:v", "1", "-pix_fmt", "gray16be", tmp], { timeoutMs: 30_000 });
    await fs.rename(tmp, file);
    return file;
  } finally {
    for (const f of [rgb, raw, tmp]) await fs.rm(f, { force: true });
  }
}
