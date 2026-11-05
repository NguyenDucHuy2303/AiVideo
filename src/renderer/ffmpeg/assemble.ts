import { AUDIO_SAMPLE_RATE } from "../../config.ts";
import type { Layout } from "../../layouts/index.ts";
import type { Scene, Transition } from "../../schema/timeline.ts";

const XFADE: Record<Exclude<Transition, "cut">, string> = {
  fade: "fade",
  fadeblack: "fadeblack",
  dissolve: "dissolve",
  slide_left: "slideleft",
  slide_up: "slideup",
  wipe_left: "wipeleft",
  circle_open: "circleopen",
};

export type Encoder = "x264" | "qsv";

export interface AssembleSpec {
  scenes: Scene[];
  /** Clip per scene, each `durationFrames + transitionOut.frames` long. */
  clips: string[];
  /** Finished narration track (see audio.ts), exactly as long as the video. */
  audioTrack: string;
  layout: Layout;
  fps: number;
  encoder: Encoder;
  output: string;
}

const sec = (frames: number, fps: number) => (frames / fps).toFixed(6);

/** Frame at which each scene starts in the final video (transitions overlap the outgoing clip's tail). */
export function sceneStartFrames(scenes: Scene[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of scenes) {
    starts.push(acc);
    acc += s.durationFrames;
  }
  return starts;
}

export function totalFrames(scenes: Scene[]): number {
  return scenes.reduce((sum, s) => sum + s.durationFrames, 0);
}

/**
 * ffmpeg arguments that join scene clips with transitions and mux the narration track.
 *
 * Timing model: clip i = scene content (D_i) + transition tail (T_i). The transition into
 * scene i+1 starts at sum(D_0..D_i), so every scene starts exactly where the timeline says
 * and the video is sum(D) frames long — the same length as the narration track.
 */
export function assembleArgs(spec: AssembleSpec): string[] {
  const { scenes, clips, fps, layout } = spec;
  const inputs: string[] = [];
  const graph: string[] = [];

  clips.forEach((clip, i) => {
    inputs.push("-i", clip);
    graph.push(`[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${fps},format=yuv420p[v${i}]`);
  });

  const starts = sceneStartFrames(scenes);
  let current = "v0";
  for (let i = 0; i < scenes.length - 1; i++) {
    const t = scenes[i]!.transitionOut;
    const out = `x${i}`;
    if (t.type === "cut" || t.frames === 0) {
      graph.push(`[${current}][v${i + 1}]concat=n=2:v=1:a=0[${out}]`);
    } else {
      graph.push(`[${current}][v${i + 1}]xfade=transition=${XFADE[t.type]}:duration=${sec(t.frames, fps)}:offset=${sec(starts[i + 1]!, fps)}[${out}]`);
    }
    current = out;
  }
  graph.push(`[${current}]null[vout]`);
  inputs.push("-i", spec.audioTrack);

  const video =
    spec.encoder === "qsv"
      ? ["-c:v", "h264_qsv", "-preset", "medium", "-global_quality", "22", "-pix_fmt", "nv12"]
      : ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p"];

  return [
    "-hide_banner", "-nostdin", "-y", "-v", "warning",
    ...inputs,
    "-filter_complex", graph.join(";"),
    "-map", "[vout]", "-map", `${clips.length}:a`,
    "-frames:v", String(totalFrames(scenes)),
    "-r", String(fps),
    ...video,
    "-g", String(fps * 2),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-c:a", "aac", "-b:a", "192k", "-ar", String(AUDIO_SAMPLE_RATE), "-ac", "2",
    "-movflags", "+faststart",
    "-metadata", `comment=${layout.id}`,
    spec.output,
  ];
}
