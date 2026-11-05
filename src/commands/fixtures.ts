import fs from "node:fs/promises";
import path from "node:path";
import { FFMPEG, ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { run } from "../utils/process.ts";

const DEMO_DIR = path.join(ROOT, "fixtures", "demo");
/**
 * Generate the demo's placeholder assets with ffmpeg itself, so the demo needs nothing
 * downloaded. The "audio" is a short beep at the start of each scene: a sync marker that
 * makes it easy to check scene timing until real TTS narration exists.
 */
const ASSETS: { file: string; args: string[] }[] = [
  {
    file: "assets/night.jpg",
    args: ["-f", "lavfi", "-i", "mandelbrot=s=2400x2400:maxiter=1500:start_scale=1.2:start_x=-0.743:start_y=0.131", "-frames:v", "1", "-q:v", "3"],
  },
  {
    file: "assets/abstract.jpg",
    args: ["-f", "lavfi", "-i", "gradients=s=2400x2400:nb_colors=5:seed=42:speed=0", "-frames:v", "1", "-q:v", "3"],
  },
  ...[440, 660, 880].map((hz, i) => ({
    file: `audio/marker_0${i + 1}.wav`,
    args: ["-f", "lavfi", "-i", `sine=frequency=${hz}:duration=0.25:sample_rate=48000`, "-af", "afade=t=out:st=0.15:d=0.1,apad=pad_dur=1", "-ac", "1"],
  })),
];

export async function makeFixtures(force: boolean): Promise<void> {
  for (const asset of ASSETS) {
    const out = path.join(DEMO_DIR, asset.file);
    if (!force && (await exists(out))) {
      console.log(`exists  ${path.relative(ROOT, out)}`);
      continue;
    }
    await fs.mkdir(path.dirname(out), { recursive: true });
    await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", ...asset.args, out], { timeoutMs: 120_000 });
    console.log(`created ${path.relative(ROOT, out)}`);
  }

  console.log(`\nNext: npm run wata -- render ${path.relative(ROOT, path.join(DEMO_DIR, "timeline.json"))}`);
}
