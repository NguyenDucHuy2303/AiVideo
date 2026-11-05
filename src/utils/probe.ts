import { FFPROBE, TIMEOUTS } from "../config.ts";
import { run } from "./process.ts";

export interface ProbeStream {
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  nb_frames?: string;
  duration?: string;
}

export interface ProbeResult {
  durationSec: number;
  streams: ProbeStream[];
}

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await run(
    FFPROBE,
    [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,nb_frames,duration",
      "-of", "json",
      file,
    ],
    { timeoutMs: TIMEOUTS.probeMs },
  );
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: ProbeStream[] };
  return { durationSec: Number(data.format?.duration ?? 0), streams: data.streams ?? [] };
}

export interface ExpectedVideo {
  width: number;
  height: number;
  frames: number;
  fps: number;
  hasAudio: boolean;
}

/** Check a rendered file really is what the timeline asked for. Returns problems, empty if OK. */
export async function verifyVideo(file: string, expected: ExpectedVideo): Promise<string[]> {
  const problems: string[] = [];
  const info = await probe(file);
  const video = info.streams.find((s) => s.codec_type === "video");
  const audio = info.streams.find((s) => s.codec_type === "audio");

  if (!video) return ["no video stream"];
  if (video.width !== expected.width || video.height !== expected.height) {
    problems.push(`size ${video.width}x${video.height}, expected ${expected.width}x${expected.height}`);
  }
  const frames = Number(video.nb_frames);
  if (Number.isFinite(frames) && frames > 0 && Math.abs(frames - expected.frames) > 1) {
    problems.push(`${frames} frames, expected ${expected.frames}`);
  }
  if (expected.hasAudio) {
    if (!audio) problems.push("no audio stream");
    else {
      const expectedSec = expected.frames / expected.fps;
      const audioSec = Number(audio.duration ?? info.durationSec);
      if (Math.abs(audioSec - expectedSec) > 0.1) {
        problems.push(`audio ${audioSec.toFixed(3)}s, expected ${expectedSec.toFixed(3)}s`);
      }
    }
  }
  return problems;
}
