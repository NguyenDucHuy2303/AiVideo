import { AUDIO_SAMPLE_RATE } from "../../config.ts";
import type { Scene } from "../../schema/timeline.ts";
import { totalFrames } from "./assemble.ts";

const COMMON = ["-hide_banner", "-nostdin", "-y", "-v", "warning"];
const LOUDNORM_TP = -1.5;
const LOUDNORM_LRA = 11;

/**
 * Narration track for the whole video. Every scene's audio is padded/trimmed to exactly
 * `durationFrames × 48000 / fps` samples, so it can never drift from the picture.
 * The track is the same for every aspect ratio, so it is built once.
 */
export function narrationMixArgs(scenes: Scene[], audio: (string | undefined)[], fps: number, output: string): string[] {
  const samplesPerFrame = AUDIO_SAMPLE_RATE / fps;
  const inputs: string[] = [];
  const graph: string[] = [];
  const labels: string[] = [];
  let input = 0;

  scenes.forEach((scene, i) => {
    const samples = scene.durationFrames * samplesPerFrame;
    const file = audio[i];
    const label = `a${i}`;
    if (file && scene.audio) {
      inputs.push("-i", file);
      const delay = scene.audio.offsetFrames * samplesPerFrame;
      graph.push(
        `[${input}:a]aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,` +
          `volume=${scene.audio.volume},adelay=delays=${delay}S:all=1,` +
          `apad=whole_len=${samples},atrim=end_sample=${samples},asetpts=N/SR/TB[${label}]`,
      );
      input++;
    } else {
      graph.push(`anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=stereo,atrim=end_sample=${samples}[${label}]`);
    }
    labels.push(`[${label}]`);
  });
  graph.push(`${labels.join("")}concat=n=${labels.length}:v=0:a=1[aout]`);

  return [
    ...COMMON,
    ...inputs,
    "-filter_complex", graph.join(";"),
    "-map", "[aout]",
    "-c:a", "pcm_s24le", "-ar", String(AUDIO_SAMPLE_RATE), "-ac", "2",
    output,
  ];
}

export interface LoudnessMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/** Pass 1 of loudness normalization: measure. ffmpeg prints the result as JSON on stderr. */
export function loudnessMeasureArgs(input: string, lufs: number): string[] {
  return [
    "-hide_banner", "-nostdin", "-v", "info", "-nostats",
    "-i", input,
    "-af", `loudnorm=I=${lufs}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:print_format=json`,
    "-f", "null", "-",
  ];
}

export function parseLoudness(stderr: string): LoudnessMeasurement {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("loudnorm did not print a measurement");
  return JSON.parse(stderr.slice(start, end + 1)) as LoudnessMeasurement;
}

/** True when the track is silence (nothing to normalize; loudnorm would report -inf). */
export function isSilent(m: LoudnessMeasurement): boolean {
  const i = Number(m.input_i);
  return !Number.isFinite(i) || i < -70;
}

/** Pass 2: apply a single linear gain computed from the measurement, then lock the length. */
export function loudnessApplyArgs(input: string, m: LoudnessMeasurement, lufs: number, scenes: Scene[], fps: number, output: string): string[] {
  const samples = totalFrames(scenes) * (AUDIO_SAMPLE_RATE / fps);
  const normalize = isSilent(m)
    ? ""
    : `loudnorm=I=${lufs}:TP=${LOUDNORM_TP}:LRA=${LOUDNORM_LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
      `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,`;
  return [
    ...COMMON,
    "-i", input,
    "-af", `${normalize}aresample=${AUDIO_SAMPLE_RATE},apad=whole_len=${samples},atrim=end_sample=${samples}`,
    "-c:a", "pcm_s24le", "-ar", String(AUDIO_SAMPLE_RATE), "-ac", "2",
    output,
  ];
}
