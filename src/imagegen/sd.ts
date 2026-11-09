import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../config.ts";
import { exists, sha256, tmpPathFor } from "../utils/fs.ts";
import { probe } from "../utils/probe.ts";
import { run } from "../utils/process.ts";

/**
 * Local text-to-image with stable-diffusion.cpp + SD-Turbo (installed by
 * scripts/setup-imagegen.sh). SD-Turbo is distilled for 1–4 steps and is at its best at
 * 512×512; it stays usable up to 768 on the long side, which story backgrounds use to match
 * each output shape. Pictures the frame can't hold sharply are shown whole over a blurred fill.
 */
export const SD_DIR = process.env.WATA_SD_DIR ?? path.join(ROOT, "vendor", "sd");
const MODEL = "sd_turbo-f16-q8_0.gguf";
export const MODEL_ID = "sd-turbo (q8_0)";
export const LICENSE = "AI-generated with SD-Turbo (Stability AI Community License)";

const STEPS = 4;
/** Sizes must be multiples of 64; SD-Turbo stays coherent up to about 768 on the long side. */
export const SIZES = { square: [512, 512], landscape: [768, 448], portrait: [448, 768] } as const;
export type ImageShape = keyof typeof SIZES;

export interface GenerateOptions {
  /** Appended to the prompt; replaces the default photographic style. */
  style?: string;
  negative?: string;
  shape?: ImageShape;
  /** Guidance. SD-Turbo is made for 1, where the negative prompt does nothing; 1.5–2 lets it
   * steer away from things (at some cost in crispness). */
  cfg?: number;
}

/** Model load + 4 steps takes well under a minute on a 6-core CPU; this only catches hangs. */
const TIMEOUT_MS = 5 * 60_000;

/** Words that keep SD-Turbo from painting text, frames and watermarks, which it loves to do. */
const STYLE = "high quality photo, natural light, detailed, no text";
const NEGATIVE = "text, letters, words, watermark, logo, signature, caption, frame, border, blurry, deformed, ugly";

async function findCli(): Promise<string | undefined> {
  const entries = (await fs.readdir(path.join(SD_DIR, "bin"), { recursive: true }).catch(() => [])) as string[];
  const rel = entries.find((e) => path.basename(e) === "sd-cli");
  return rel ? path.join(SD_DIR, "bin", rel) : undefined;
}

export interface ImageGen {
  id: string;
  generate(prompt: string, outDir: string, opts?: GenerateOptions): Promise<{ file: string; cached: boolean }>;
}

/** Undefined when not installed. */
export async function sdTurbo(): Promise<ImageGen | undefined> {
  const cli = await findCli();
  const model = path.join(SD_DIR, "models", MODEL);
  if (!cli || !(await exists(model))) return undefined;
  return {
    id: MODEL_ID,
    async generate(prompt, outDir, opts = {}) {
      const full = `${prompt.trim().replace(/\s+/g, " ")}, ${opts.style ?? STYLE}`;
      const negative = opts.negative ?? NEGATIVE;
      const [width, height] = SIZES[opts.shape ?? "square"];
      // Same prompt → same seed → same picture, so rebuilds are reproducible and cacheable.
      const cfg = opts.cfg ?? 1;
      const key = sha256(`${MODEL}|${width}x${height}|${STEPS}|${full}|${negative}${cfg !== 1 ? `|cfg${cfg}` : ""}`);
      const file = path.join(outDir, `${key.slice(0, 12)}.png`);
      if (await exists(file)) return { file, cached: true };
      await fs.mkdir(outDir, { recursive: true });
      const tmp = tmpPathFor(file);
      try {
        await run(
          cli,
          [
            "-m", model,
            "-p", full,
            "-n", negative,
            "--cfg-scale", String(cfg),
            "--steps", String(STEPS),
            "--sampling-method", "euler_a",
            "-W", String(width),
            "-H", String(height),
            "-s", String(parseInt(key.slice(0, 8), 16) % 2_147_483_647),
            "-t", String(Math.max(1, Number(process.env.WATA_SD_THREADS) || os.availableParallelism())),
            "-o", tmp,
          ],
          { timeoutMs: TIMEOUT_MS, env: { ...process.env, LD_LIBRARY_PATH: [path.dirname(cli), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") } },
        );
        const v = (await probe(tmp).catch(() => undefined))?.streams.find((s) => s.codec_type === "video");
        if (v?.width !== width || v.height !== height) throw new Error(`sd-cli did not write a ${width}×${height} image`);
        await fs.rename(tmp, file);
        return { file, cached: false };
      } finally {
        await fs.rm(tmp, { force: true });
      }
    },
  };
}

/**
 * FLUX.2 [klein] 4B (scripts/setup-imagegen-next.sh, Apache-2.0: commercial use, no
 * registration): far better pictures and prompt following than SD-Turbo (real bamboo, folk-art
 * styles), about 3–4 minutes a 768×448 painting on 6 CPU threads and under 5 GB of memory.
 * No negative prompt (it is guidance-free): what to leave out is said in the style.
 */
const KLEIN_DIR = path.join(SD_DIR, "models", "flux2-klein");
export const KLEIN_ID = "flux.2-klein-4b (q4_k_m)";
export const KLEIN_LICENSE = "AI-generated with FLUX.2 [klein] 4B (Apache-2.0)";
const KLEIN_TIMEOUT_MS = 40 * 60_000; // two threads in office hours make it slow

export async function flux2Klein(): Promise<ImageGen | undefined> {
  const cli = await findCli();
  const files = { model: path.join(KLEIN_DIR, "flux-2-klein-4b-Q4_K_M.gguf"), vae: path.join(KLEIN_DIR, "vae.safetensors"), llm: path.join(KLEIN_DIR, "Qwen3-4B-Q4_K_M.gguf") };
  if (!cli || !(await exists(files.model)) || !(await exists(files.vae)) || !(await exists(files.llm))) return undefined;
  return {
    id: KLEIN_ID,
    async generate(prompt, outDir, opts = {}) {
      const full = `${prompt.trim().replace(/\s+/g, " ")}, ${opts.style ?? STYLE}, full-bleed picture, no border, no frame`;
      const [width, height] = SIZES[opts.shape ?? "square"];
      const key = sha256(`${KLEIN_ID}|${width}x${height}|${full}`);
      const file = path.join(outDir, `${key.slice(0, 12)}.png`);
      if (await exists(file)) return { file, cached: true };
      await fs.mkdir(outDir, { recursive: true });
      const tmp = tmpPathFor(file);
      try {
        await run(cli, [
          "--diffusion-model", files.model, "--vae", files.vae, "--llm", files.llm,
          "-p", full, "--cfg-scale", "1.0", "--steps", "4",
          "-W", String(width), "-H", String(height),
          "-s", String(parseInt(key.slice(0, 8), 16) % 2_147_483_647),
          "-t", String(Math.max(1, Number(process.env.WATA_SD_THREADS) || os.availableParallelism())),
          "--vae-tiling", "--mmap", "-o", tmp,
        ], { timeoutMs: KLEIN_TIMEOUT_MS, env: { ...process.env, LD_LIBRARY_PATH: [path.dirname(cli), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") } });
        const v = (await probe(tmp).catch(() => undefined))?.streams.find((s) => s.codec_type === "video");
        if (v?.width !== width || v.height !== height) throw new Error(`sd-cli did not write a ${width}×${height} image`);
        await fs.rename(tmp, file);
        return { file, cached: false };
      } finally {
        await fs.rm(tmp, { force: true });
      }
    },
  };
}

/** The best painter installed: FLUX.2 klein, else SD-Turbo (WATA_IMAGE_MODEL=sd-turbo forces it). */
export async function bestImageGen(): Promise<ImageGen | undefined> {
  if (process.env.WATA_IMAGE_MODEL !== "sd-turbo") {
    const k = await flux2Klein();
    if (k) return k;
  }
  return sdTurbo();
}
