/**
 * The channel's identity (assets/brand/brand.json): logo, watermark, intro, outro and
 * thumbnails, all drawn by brand.html (a Đông Sơn drum face with the channel name).
 * Rendered once per shape and theme and kept in assets/brand/clips/; delete a file to draw it again.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderSoundtrack } from "../../audio/soundtrack.ts";
import { FFMPEG, ROOT } from "../../config.ts";
import { exists } from "../../utils/fs.ts";
import { run } from "../../utils/process.ts";
import { capture, still } from "../capture.ts";

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "brand.html");
export const BRAND_DIR = path.join(ROOT, "assets", "brand");
const INTRO_S = 3, OUTRO_S = 5, END_S = 2.5;

export interface Brand {
  name: string;
  tagline: string;
  owner?: string;
  lang?: string;
  texts?: Record<string, string>;
  languages?: Record<string, Partial<Brand>>;
  /** The channel's own look for every card (brand.html theme), when it has one (Ask Huy). */
  theme?: string;
  /** Where its brand.json, logo and clips are (set by loadBrand). */
  dir?: string;
}

/**
 * A channel's brand, in a language of its brand.json "languages" (name, tagline, card texts) if
 * asked. Without an id: the first channel (Huy Kể Chuyện, assets/brand); with one, another
 * channel's own folder (assets/brand/<id>, e.g. ask-huy).
 */
export async function loadBrand(lang?: string, id?: string): Promise<Brand | undefined> {
  const dir = id ? path.join(BRAND_DIR, id) : BRAND_DIR, f = path.join(dir, "brand.json");
  if (!(await exists(f))) return undefined;
  const b: Brand = { ...JSON.parse(await fs.readFile(f, "utf8")), dir };
  return lang && b.languages?.[lang] ? { ...b, ...b.languages[lang], lang } : b;
}
const dirOf = (b: Brand) => b.dir ?? BRAND_DIR;

/** logo.png (1024², with the name) and watermark.png (256², the drum only), transparent. */
export async function brandStills(brand: Brand): Promise<{ logo: string; watermark: string }> {
  const logo = path.join(dirOf(brand), "logo.png"), watermark = path.join(dirOf(brand), "watermark.png");
  if (!(await exists(logo))) await still({ page: PAGE, width: 1024, height: 1024, output: logo, transparent: true, params: { mode: "logo", theme: brand.theme, brand, width: 1024, height: 1024 } });
  if (!(await exists(watermark))) await still({ page: PAGE, width: 256, height: 256, output: watermark, transparent: true, params: { mode: "logo", theme: brand.theme, withName: false, brand, width: 256, height: 256 } });
  return { logo, watermark };
}

/** The looks of intro, outro and end card (brand.html "trong_dong", the others in themes.js). */
export const BRAND_THEMES: Record<string, { name: string; for: string }> = {
  trong_dong: { name: "Trống đồng", for: "mặt trống đồng Đông Sơn bay vào trên nền đỏ; hợp truyền thuyết, lịch sử" },
  sach_truyen: { name: "Sách truyện", for: "cuốn sách mở ra, tên kênh bật lên từ trang sách; hợp cổ tích, ngụ ngôn" },
  den_long: { name: "Đêm hội đèn lồng", for: "đèn lồng, đèn ông sao bay lên, trống đồng là mặt trăng; hợp truyện đêm, Trung thu, truyện buồn" },
  mua_roi: { name: "Múa rối nước", for: "thủy đình lúc hoàng hôn, chú Tễu chào khán giả; hợp truyện vui, làng quê" },
  dong_que: { name: "Cánh diều đồng quê", for: "diều sáo bay trên đồng lúa; hợp thú vật, thiên nhiên, bài học" },
  cuon_thu: { name: "Cuộn thư", for: "cuộn thư mở trên nền sơn mài, đóng dấu son; hợp lịch sử triều đại" },
};
export const DEFAULT_THEME = "trong_dong";
const themeOf = (t?: string) => (t && BRAND_THEMES[t] ? t : DEFAULT_THEME);

type Sfx = { type: "boom" | "whoosh" | "drums" | "wind" | "shimmer" | "chime"; at: number }[];
/** Each intro's sounds, on its own beats. */
const INTRO_SFX: Record<string, Sfx> = {
  trong_dong: [{ type: "drums", at: 0 }, { type: "boom", at: 0.75 }, { type: "shimmer", at: 0.9 }, { type: "chime", at: 1.3 }],
  sach_truyen: [{ type: "whoosh", at: 0.1 }, { type: "whoosh", at: 0.75 }, { type: "chime", at: 1.4 }, { type: "shimmer", at: 1.5 }],
  den_long: [{ type: "shimmer", at: 0.2 }, { type: "chime", at: 1.15 }, { type: "shimmer", at: 1.3 }, { type: "chime", at: 1.9 }],
  mua_roi: [{ type: "drums", at: 0 }, { type: "whoosh", at: 0.6 }, { type: "boom", at: 0.75 }, { type: "chime", at: 1.3 }],
  dong_que: [{ type: "wind", at: 0 }, { type: "whoosh", at: 0.2 }, { type: "chime", at: 1.35 }, { type: "shimmer", at: 1.45 }],
  cuon_thu: [{ type: "whoosh", at: 0.3 }, { type: "boom", at: 1.75 }, { type: "shimmer", at: 1.8 }, { type: "chime", at: 2.0 }],
  ask_huy: [{ type: "whoosh", at: 0.1 }, { type: "chime", at: 0.75 }, { type: "shimmer", at: 0.8 }, { type: "chime", at: 1.1 }, { type: "shimmer", at: 1.7 }],
};

/** The intro, outro or a short's end card for a shape and a theme, with its sound, and its length. */
export async function brandClip(brand: Brand, kind: "intro" | "outro" | "end", vertical: boolean, theme?: string): Promise<{ file: string; seconds: number }> {
  // A channel with its own look (Ask Huy) always uses it; the first channel picks per film.
  const th = brand.theme ?? themeOf(theme);
  const [W, H] = vertical ? [1080, 1920] : [1920, 1080];
  const seconds = kind === "intro" ? (th === "trong_dong" ? INTRO_S : 3.5) : kind === "end" ? END_S : OUTRO_S;
  const file = path.join(dirOf(brand), "clips", `${kind}_${th}${brand.lang ? `_${brand.lang}` : ""}_${vertical ? "9x16" : "16x9"}.mp4`);
  if (await exists(file)) return { file, seconds };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const picture = `${file}.picture.mp4`, sound = `${file}.wav`;
  await capture({ page: PAGE, width: W, height: H, fps: 30, seconds, output: picture, params: { mode: kind, theme: th, brand, width: W, height: H, duration: seconds } });
  await renderSoundtrack(
    [{ start: 0, duration: seconds, mood: kind === "intro" ? (th === "den_long" || th === "dong_que" || th === "ask_huy" ? "calm" : "majestic") : "calm" }],
    kind === "end" ? [{ type: "boom", at: 0.15 }, { type: "shimmer", at: 0.25 }, { type: "chime", at: 0.6 }] : kind === "intro"
      ? INTRO_SFX[th]!
      : [{ type: "chime", at: 0.2 }, { type: "whoosh", at: 1.8 }, { type: "boom", at: 2.6 }, { type: "shimmer", at: 2.7 }],
    seconds, sound,
  );
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", picture, "-i", sound, "-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000", "-shortest", file], { timeoutMs: 120_000 });
  await fs.rm(picture, { force: true });
  await fs.rm(sound, { force: true });
  return { file, seconds };
}

/** A thumbnail (1280×720 JPEG) from a moment of the film, with the title and the logo. */
export async function thumbnail(brand: Brand, film: string, at: number, title: string, subtitle: string, output: string): Promise<string> {
  const frame = `${output}.frame.png`;
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-ss", at.toFixed(2), "-i", film, "-frames:v", "1", "-vf", "scale=1280:720", frame], { timeoutMs: 30_000 });
  const png = `${output}.png`;
  await still({ page: PAGE, width: 1280, height: 720, output: png, params: { mode: "thumb", theme: brand.theme, brand, width: 1280, height: 720, frame: pathToFileURL(frame).href, title, subtitle } });
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-i", png, "-q:v", "2", output], { timeoutMs: 30_000 });
  await fs.rm(frame, { force: true });
  await fs.rm(png, { force: true });
  return output;
}
