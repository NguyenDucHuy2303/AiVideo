import { ZOOMPAN_SUPERSAMPLE } from "../../config.ts";
import type { Layout } from "../../layouts/index.ts";
import type { Background } from "../../schema/timeline.ts";
import { zoompanExpr } from "./motion.ts";
import { actorFilters, shakeFilters } from "./actor.ts";
import type { Actor } from "../../schema/timeline.ts";

/** Paths that go inside a filtergraph must not need escaping; ours are generated, so enforce it. */
export function assertFilterSafePath(p: string): string {
  if (!/^[A-Za-z0-9_./-]+$/.test(p)) {
    throw new Error(`path contains characters that are unsafe inside an ffmpeg filter: ${p} (move the project to a path with only letters, digits, _ . / -)`);
  }
  return p;
}

const hex = (color: string) => `0x${color.slice(1)}`;

/** Cover-scaling a small image by more than this looks soft; show it whole instead. */
const MAX_COVER_UPSCALE = 1.5;

/** Decide cover vs contain for one output size. */
export function resolveFit(fit: "auto" | "cover" | "contain", image: { width: number; height: number }, layout: Layout): "cover" | "contain" {
  if (fit !== "auto") return fit;
  const upscale = Math.max(layout.width / image.width, layout.height / image.height);
  return upscale > MAX_COVER_UPSCALE ? "contain" : "cover";
}

export interface SceneClipSpec {
  background: Background;
  /** Absolute path of the image, when background.type === "image". */
  imagePath?: string;
  /** Resolved fit of the image for this layout (see resolveFit). */
  fit?: "cover" | "contain";
  layout: Layout;
  fps: number;
  frames: number;
  /** Silhouette over the background: absolute path of its PNG and how it moves. */
  actor?: Actor & { path: string };
  /** Camera shake: start (s) and amplitude (px). */
  shake?: { start: number; amplitude: number };
  vignette?: boolean;
  /** .ass file name relative to `cwd` of the ffmpeg process. */
  assFile: string;
  fontsDir: string;
  output: string;
}

/** ffmpeg arguments that render one silent scene clip (background + motion + texts). */
export function sceneClipArgs(spec: SceneClipSpec): string[] {
  const { layout, fps, frames, background: bg } = spec;
  const W = layout.width;
  const H = layout.height;
  const seconds = (frames / fps).toFixed(4);
  const input: string[] = [];
  const chain: string[] = [];
  let head = "[0:v]";

  switch (bg.type) {
    case "image": {
      if (!spec.imagePath) throw new Error("imagePath is required for image backgrounds");
      input.push("-i", spec.imagePath);
      const sw = W * ZOOMPAN_SUPERSAMPLE;
      const sh = H * ZOOMPAN_SUPERSAMPLE;
      if (spec.fit === "contain") {
        // The whole image, centered over a blurred, darkened fill made from itself. The blur
        // runs at 1/8 size, which is both cheaper and smoother than blurring at full size.
        const bw = Math.round(W / 8);
        const bh = Math.round(H / 8);
        head =
          `[0:v]split=2[fill][fg];` +
          `[fill]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},gblur=sigma=4,eq=brightness=-0.12:saturation=0.8,scale=${sw}:${sh}:flags=bicubic[blur];` +
          `[fg]scale=${sw}:${sh}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos[img];` +
          `[blur][img]overlay=(W-w)/2:(H-h)/2,`;
      }
      // When the whole image is shown, keep the camera centered so it never drifts off-frame.
      const zp = zoompanExpr(bg.motion, frames, spec.fit === "contain" ? { x: 0.5, y: 0.5 } : bg.focus);
      if (spec.fit !== "contain") {
        chain.push(
          `scale=${sw}:${sh}:force_original_aspect_ratio=increase:flags=lanczos`,
          `crop=${sw}:${sh}:(iw-ow)*${bg.focus.x}:(ih-oh)*${bg.focus.y}`,
        );
      }
      chain.push(
        "setsar=1",
        `zoompan=z='${zp.z}':x='${zp.x}':y='${zp.y}':d=${frames}:s=${W}x${H}:fps=${fps}`,
      );
      if (bg.dim > 0) chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=black@${bg.dim.toFixed(2)}:t=fill`);
      break;
    }
    case "color":
      input.push("-f", "lavfi", "-i", `color=c=${hex(bg.color)}:s=${W}x${H}:r=${fps}:d=${seconds}`);
      break;
    case "gradient": {
      const [x0, y0, x1, y1] =
        bg.direction === "vertical" ? [W / 2, 0, W / 2, H]
        : bg.direction === "horizontal" ? [0, H / 2, W, H / 2]
        : [0, 0, W, H];
      input.push(
        "-f", "lavfi", "-i",
        `gradients=s=${W}x${H}:r=${fps}:d=${seconds}:c0=${hex(bg.from)}:c1=${hex(bg.to)}:nb_colors=2:x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:speed=0`,
      );
      break;
    }
  }

  let graph = `${head}${chain.length ? chain.join(",") : "null"}`;
  if (spec.actor) {
    input.push("-loop", "1", "-framerate", String(fps), "-i", spec.actor.path);
    const a = actorFilters(spec.actor, layout, fps, frames);
    graph += `[bg];[1:v]${a.chain}[act];[bg][act]${a.overlay}`;
  }
  // Shake moves the picture and the actor together; texts (drawn after) stay steady.
  const post = [
    ...(spec.shake ? shakeFilters(spec.shake.start, spec.shake.amplitude, W, H) : []),
    ...(spec.vignette ? ["vignette=angle=0.6"] : []),
    "scale=out_color_matrix=bt709:out_range=tv",
    "format=yuv420p",
    `subtitles=filename=${assertFilterSafePath(spec.assFile)}:fontsdir=${assertFilterSafePath(spec.fontsDir)}`,
    "setpts=N/FRAME_RATE/TB",
  ];

  return [
    "-hide_banner", "-nostdin", "-y", "-v", "warning",
    ...input,
    "-filter_complex", `${graph},${post.join(",")}[v]`,
    "-map", "[v]",
    "-frames:v", String(frames),
    "-r", String(fps),
    "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    spec.output,
  ];
}
