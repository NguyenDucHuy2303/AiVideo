import fs from "node:fs/promises";
import path from "node:path";
import { FFMPEG, TIMEOUTS } from "../config.ts";
import type { ImageGen } from "../imagegen/sd.ts";
import { exists, hashFile, tmpPathFor } from "../utils/fs.ts";
import { run } from "../utils/process.ts";

/** Prompt suffix that makes SD paint a clean cut-out: one dark shape on white. */
const SILHOUETTE_STYLE = "solid black silhouette, full body, side view, isolated on a plain white background, flat, high contrast, no text";
const SILHOUETTE_NEGATIVE = "background, scenery, landscape, ground, shadow, text, watermark, frame, colors, gradient, multiple figures";

/** Shadow-puppet look: a dark figure with a warm rim of light, readable on any painting. */
const BODY = "0x140C06";
const GLOW = "0xF2B84B";

/** Bump when the cut-out changes, so cached figures are cut again. */
const CUTOUT_VERSION = 3;
/** Upscale before thresholding so the outline stays smooth; pad (in the background's grey)
 * so the glow isn't cut. */
const prepare = (background: number) => {
  const g = Math.round(background).toString(16).padStart(2, "0");
  return `scale=1024:-2:flags=bicubic,format=gray,pad=iw+160:ih+160:80:80:color=0x${g}${g}${g}`;
};
/** SD paints the figure on white, grey or paper-beige: any plain, light background will do. */
const MIN_BACKGROUND = 185;
/** Edges darker than the background by more than this are a vignette, a floor or a scene.
 * Less is fine: a crowd or a tail may touch the edge. */
const MAX_EDGE_SPREAD = 45;
/** Pixels clearly darker than the background → figure, with a soft edge. */
const figureBelow = (background: number) => Math.min(150, Math.round(background - 55));
const soft = (below: number) => `geq=lum='clip((${below}-lum(X,Y))*5,0,255)'`;

/**
 * Painted silhouette → transparent PNG cut to its outline. Dark pixels become the figure,
 * light ones vanish; a blurred copy of the shape becomes a golden glow behind it.
 * SD often leaves faces and hands lighter than the body: anything clearly darker than the
 * background and enclosed by the figure (not reachable from the edge of the picture) is
 * filled, so a face is not a hole. Gaps that show the background (between the legs) stay open.
 * Returns undefined when the picture isn't a usable silhouette: no plain background, mostly
 * empty or mostly dark.
 */
export async function cutout(src: string, outDir: string): Promise<{ file: string; coverage: number } | undefined> {
  const file = path.join(outDir, `actor-v${CUTOUT_VERSION}-${(await hashFile(src)).slice(0, 12)}.png`);
  await fs.mkdir(outDir, { recursive: true });
  const ff = (args: string[]) => run(FFMPEG, ["-hide_banner", "-nostdin", "-y", ...args], { timeoutMs: TIMEOUTS.probeMs });
  const mean = async (input: string, filter: string) => {
    const { stderr } = await ff(["-v", "info", "-i", input, "-vf", `${filter},signalstats,metadata=print:key=lavfi.signalstats.YAVG`, "-f", "null", "-"]);
    return Number(/YAVG=([\d.]+)/.exec(stderr)?.[1] ?? 0);
  };

  // The background, from the four edges of the picture. A photo with a vignette or a floor
  // has edges of different brightness: its dark parts would be cut out with the figure.
  const edges: number[] = [];
  for (const strip of ["iw:ih/16:0:0", "iw:ih/16:0:ih*15/16", "iw/16:ih:0:0", "iw/16:ih:iw*15/16:0"]) edges.push(await mean(src, `crop=${strip},format=gray`));
  const background = Math.max(...edges);
  if (background < MIN_BACKGROUND || background - Math.min(...edges) > MAX_EDGE_SPREAD) return undefined;
  const below = figureBelow(background);
  // Share of the frame that is figure: a failed generation is nearly blank or nearly all dark.
  const coverage = (await mean(src, `format=gray,geq=lum='if(lt(lum(X,Y),${below}),255,0)'`)) / 255;
  if (coverage < 0.03 || coverage > 0.6) return undefined;
  if (await exists(file)) return { file, coverage };

  const mask = tmpPathFor(path.join(outDir, "mask.png"));
  const full = tmpPathFor(path.join(outDir, "full.png"));
  const tmp = tmpPathFor(file);
  try {
    const darker = Math.min(225, Math.round(background - 35));
    let filled = false;
    if (darker > below + 10) {
      await ff([
        "-v", "error", "-i", src,
        "-filter_complex",
        `[0:v]${prepare(background)},split=2[a][b];[a]${soft(below)}[soft];[b]geq=lum='if(lt(lum(X,Y),${darker}),255,0)',floodfill=x=0:y=0:s0=0:d0=1[bin];[soft][bin]blend=all_expr='if(eq(B,255),255,A)'[m]`,
        "-map", "[m]", "-frames:v", "1", mask,
      ]);
      // A shaded background that is mostly "darker" would turn into one big block.
      filled = (await mean(mask, "format=gray")) / 255 < 0.5;
    }
    if (!filled) await ff(["-v", "error", "-i", src, "-vf", `${prepare(background)},${soft(below)}`, "-frames:v", "1", mask]);
    await ff([
      "-v", "error", "-i", mask,
      "-filter_complex",
      [
        "[0:v]format=gray,split=2[m1][m2]",
        `color=c=${BODY}:s=16x16,format=rgba[c1];[c1][m1]scale2ref[c1s][m1r];[c1s][m1r]alphamerge[body]`,
        `[m2]gblur=sigma=18,geq=lum='lum(X,Y)*0.7'[gm];color=c=${GLOW}:s=16x16,format=rgba[c2];[c2][gm]scale2ref[c2s][gmr];[c2s][gmr]alphamerge[glow]`,
        "[glow][body]overlay=format=auto,format=rgba[out]",
      ].join(";"),
      "-map", "[out]", "-frames:v", "1", full,
    ]);
    // Crop to what is visible, so placement and scaling work on the figure, not the canvas.
    const box = await ff(["-v", "info", "-i", full, "-vf", "alphaextract,bbox=min_val=8", "-f", "null", "-"]);
    const m = /x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/.exec(box.stderr);
    if (!m) return undefined;
    const [x1, x2, y1, y2] = m.slice(1).map(Number) as [number, number, number, number];
    const w = (x2 - x1 + 1) & ~1;
    const h = (y2 - y1 + 1) & ~1;
    await ff(["-v", "error", "-i", full, "-vf", `crop=${w}:${h}:${x1}:${y1}`, "-frames:v", "1", tmp]);
    await fs.rename(tmp, file);
    return { file, coverage };
  } finally {
    await fs.rm(mask, { force: true });
    await fs.rm(full, { force: true });
    await fs.rm(tmp, { force: true });
  }
}

/** A silhouette for a character: paint it, cut it out; retries with other wordings. */
export async function silhouette(description: string, gen: ImageGen, workDir: string): Promise<string | undefined> {
  for (const wording of [description, `${description}, simple shape`, `black paper cut-out of ${description}`]) {
    const painted = await gen.generate(wording, path.join(workDir, "painted"), { style: SILHOUETTE_STYLE, negative: SILHOUETTE_NEGATIVE, shape: "square" });
    const cut = await cutout(painted.file, workDir);
    if (cut) return cut.file;
  }
  return undefined;
}
