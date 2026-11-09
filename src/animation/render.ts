/**
 * Scene script (JSON) → MP4: picture from the cartoon runtime (player.html in headless
 * Chrome), narration, synthesized music and effects ducked under it, captions.
 *
 *   node src/animation/render.ts <scene.json> [--vertical] [--out file.mp4] [--no-audio]
 *
 * Also writes <out>.preview.html: open it in a browser to watch the scene loop live.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderSoundtrack, type MusicSection, type SfxEvent } from "../audio/soundtrack.ts";
import { AUDIO_SAMPLE_RATE, FFMPEG, FONTS_DIR, ROOT } from "../config.ts";
import { run } from "../utils/process.ts";
import { withBackdrop } from "./backdrops.ts";
import { capture } from "./capture.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAYER = path.join(HERE, "player.html");

interface SceneAudio {
  /** Narration files, or path prefixes resolved to the first matching file. */
  narration?: string[];
  lines?: string[];
  tempo?: number;
  music?: MusicSection[];
  sfx?: SfxEvent[];
}
interface Scene {
  title?: string;
  duration: number;
  audio?: SceneAudio;
  [k: string]: unknown;
}

async function resolvePrefix(p: string): Promise<string> {
  const abs = path.resolve(ROOT, p);
  if (await fs.stat(abs).then((s) => s.isFile()).catch(() => false)) return abs;
  const dir = path.dirname(abs), base = path.basename(abs);
  const hit = (await fs.readdir(dir)).find((f) => f.startsWith(base));
  if (!hit) throw new Error(`no narration file matches ${p}`);
  return path.join(dir, hit);
}

const duration = async (f: string) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { timeoutMs: 10_000 })).stdout);

function ass(lines: string[], durations: number[], seconds: number, W: number, H: number): string {
  const stamp = (s: number) => {
    const cs = Math.round(s * 100);
    return `0:${String(Math.floor(cs / 6000)).padStart(2, "0")}:${String(Math.floor((cs % 6000) / 100)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };
  const events: string[] = [];
  let start = 0;
  lines.forEach((line, i) => {
    // Each sentence split at its commas, timed by length.
    const parts = line.split(/(?<=,)\s+/), total = parts.reduce((n, p) => n + p.length, 0);
    let t = start;
    for (const p of parts) {
      const d = ((durations[i] ?? 0) * p.length) / total;
      events.push(`Dialogue: 0,${stamp(t)},${stamp(Math.min(seconds, t + d))},cap,,0,0,0,,${p}`);
      t += d;
    }
    start += durations[i] ?? 0;
  });
  const vertical = H > W, size = vertical ? 66 : 64, marginV = vertical ? 300 : 70;
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: cap,Noto Sans,${size},&H00FFFFFF,&H00FFFFFF,&H00201008,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,${vertical ? 80 : 120},${vertical ? 80 : 120},${marginV},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...events, "",
  ].join("\n");
}

export interface RenderOptions {
  out?: string;
  vertical?: boolean;
  audio?: boolean;
  onProgress?: (frame: number, total: number) => void;
}

/**
 * Read a scene and resolve its shared cast: `"castFile": "cast.json"` (next to the scene)
 * maps names to looks, and a cast entry may give `"look": "<name>"` instead of the look.
 */
export async function loadScene(sceneFile: string): Promise<Scene> {
  const scene = JSON.parse(await fs.readFile(sceneFile, "utf8")) as Scene & { castFile?: string; cast?: { look?: unknown }[] };
  if (scene.castFile) {
    const looks = JSON.parse(await fs.readFile(path.resolve(path.dirname(sceneFile), scene.castFile), "utf8")) as Record<string, unknown>;
    for (const c of scene.cast ?? []) {
      if (typeof c.look === "string") {
        if (!(c.look in looks)) throw new Error(`${sceneFile}: no look "${c.look}" in ${scene.castFile}`);
        c.look = looks[c.look];
      }
    }
  }
  // The era's houses and palaces (library/eras.json), unless the scene says otherwise.
  const era = (scene as { era?: string }).era, sc = scene as { architecture?: unknown };
  if (era && sc.architecture === undefined) {
    const eras = JSON.parse(await fs.readFile(new URL("./library/eras.json", import.meta.url), "utf8"));
    if (eras[era]?.architecture) sc.architecture = eras[era].architecture;
  }
  return scene;
}

export async function renderScene(sceneFile: string, opts: RenderOptions = {}): Promise<string> {
  const scene = await withBackdrop(await loadScene(sceneFile));
  const [W, H] = opts.vertical ? [1080, 1920] : [1920, 1080];
  const name = path.basename(sceneFile, ".json") + (opts.vertical ? "_9x16" : "_16x9");
  const out = path.resolve(opts.out ?? path.join(ROOT, "out", "animation", `${name}.mp4`));
  const work = path.join(path.dirname(out), `.${name}`);
  await fs.mkdir(work, { recursive: true });

  // A preview page that plays the scene in any browser.
  const runtime = pathToFileURL(HERE).href;
  const html = (await fs.readFile(PLAYER, "utf8")).replace(/src="runtime\//g, `src="${runtime}/runtime/`).replace("<body>", `<body><script>window.SCENE = ${JSON.stringify(scene)};</script>`);
  await fs.writeFile(out.replace(/\.mp4$/, ".preview.html"), html);

  const picture = path.join(work, "picture.mp4");
  await capture({ page: PLAYER, width: W, height: H, fps: 30, seconds: scene.duration, output: picture, params: { scene, width: W, height: H }, onProgress: opts.onProgress });
  const a = scene.audio;
  if (opts.audio === false || !a?.narration?.length) {
    await fs.rename(picture, out);
    return out;
  }

  const files = await Promise.all(a.narration.map(resolvePrefix));
  const tempo = a.tempo ?? 1;
  const voice = path.join(work, "voice.wav");
  const inputs = files.flatMap((f) => ["-i", f]);
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", ...inputs, "-filter_complex", `${files.map((_, i) => `[${i}:a]`).join("")}concat=n=${files.length}:v=0:a=1,atempo=${tempo},aresample=${AUDIO_SAMPLE_RATE}[a]`, "-map", "[a]", "-ac", "1", voice], { timeoutMs: 60_000 });
  const durations = await Promise.all(files.map(async (f) => (await duration(f)) / tempo));
  const bed = path.join(work, "bed.wav");
  await renderSoundtrack(a.music ?? [{ start: 0, duration: scene.duration, mood: "calm" }], a.sfx ?? [], scene.duration, bed);
  const subs = path.join(work, "captions.ass");
  await fs.writeFile(subs, ass(a.lines ?? [], durations, scene.duration, W, H));

  const esc = (p: string) => p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  await run(FFMPEG, [
    "-hide_banner", "-nostdin", "-y", "-v", "error", "-i", picture, "-i", voice, "-i", bed,
    "-filter_complex",
    [
      `[0:v]subtitles='${esc(subs)}':fontsdir='${esc(FONTS_DIR)}'[v]`,
      "[1:a]apad,asplit=2[voice][key]",
      "[2:a]volume=0.55[bedq]",
      "[bedq][key]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=450[ducked]",
      `[voice][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=0:${scene.duration},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=${AUDIO_SAMPLE_RATE}[a]`,
    ].join(";"),
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-t", String(scene.duration), "-movflags", "+faststart", out,
  ], { timeoutMs: 5 * 60_000 });
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: node src/animation/render.ts <scene.json> [--vertical] [--out file.mp4] [--no-audio]");
    process.exit(2);
  }
  const outIdx = args.indexOf("--out");
  const t0 = Date.now();
  const out = await renderScene(file, {
    vertical: args.includes("--vertical"), audio: !args.includes("--no-audio"), out: outIdx >= 0 ? args[outIdx + 1] : undefined,
    onProgress: (f, n) => f % 60 === 0 && process.stdout.write(`\r  frame ${f}/${n}`),
  });
  console.log(`\n✔ ${out} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
