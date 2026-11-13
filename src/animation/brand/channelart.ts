/**
 * Channel art for both channels: the profile picture (one for YouTube, Facebook and TikTok)
 * and the covers (YouTube banner, Facebook cover; TikTok has none).
 *
 *   avatar.png          1080×1080   the logo without its name, on the channel's colour (seen round)
 *   youtube-banner.png  2560×1440   logo and the four presenters inside the middle 1546×423
 *                                   (what a phone shows; a TV shows it all)
 *   facebook-cover.png  1640×624    the same inside the middle 1110 px (a phone crops the sides)
 *
 * The background is drawn in vector (brand/channelart.html), the presenters by the player
 * (front view, waving, on a transparent page), the logo by the brand page: no painting, no
 * brain. `npm run wata -- channel-art` writes assets/brand/channel-art/ and
 * assets/brand/ask-huy/channel-art/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { still } from "../capture.ts";
import { LOOKS } from "../../studio/qaproduce.ts";
import { BRAND_DIR, loadBrand, type Brand } from "./brand.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, "channelart.html"), BRAND_PAGE = path.join(HERE, "brand.html"), PLAYER = path.join(HERE, "..", "player.html");

type Box = { x: number; y: number; w: number; h: number };
interface Cover { file: string; width: number; height: number; logo: Box; people: Box }
/** Where things go on each cover (inside what every screen shows). */
const COVERS: Cover[] = [
  // YouTube: the band a phone shows is x 507–2053, y 508–931.
  { file: "youtube-banner.png", width: 2560, height: 1440, logo: { x: 580, y: 515, w: 410, h: 410 }, people: { x: 1060, y: 470, w: 1000, h: 470 } },
  // Facebook: a phone shows x 265–1375; the page's round picture sits over the bottom left on a computer.
  { file: "facebook-cover.png", width: 1640, height: 624, logo: { x: 285, y: 92, w: 430, h: 430 }, people: { x: 735, y: 40, w: 640, h: 560 } },
];
/** The presenters, left to right: far enough apart that a waving hand does not reach a face. */
const LINE_UP = [["hung", 0], ["huy", 250], ["boi", 500], ["beo", 710]] as const;

/** The four presenters waving, front view, on a transparent picture of the given size. */
async function presenters(out: string, w: number, h: number): Promise<void> {
  const L = LOOKS as Record<string, unknown>;
  const scene = {
    duration: 4, time: "day", transparent: true, backdrop: false, set: { name: "plain" }, style: "hien_dai",
    cast: LINE_UP.map(([id, x]) => ({ id, type: "human", look: L[`${id}_front`], x })),
    actions: LINE_UP.map(([id], i) => ({ actor: id, at: 0, do: "wave", face: i % 2 ? "joy" : "happy" })),
    shots: [{ at: 0, type: "full", on: LINE_UP.map(([id]) => id), region: [0.02, 0.98], share: 0.9, gy: 0.96 }],
  };
  await still({ page: PLAYER, width: w, height: h, output: out, at: 1.2, transparent: true, params: { scene, width: w, height: h } });
}

/** Every picture for one channel's brand, into <brand dir>/channel-art/. */
export async function channelArt(brand: Brand, log: (s: string) => void = console.log): Promise<string[]> {
  const dir = path.join(brand.dir ?? BRAND_DIR, "channel-art"), tmp = path.join(dir, ".parts");
  await fs.mkdir(tmp, { recursive: true });
  const theme = brand.theme ?? "trong_dong", url = (f: string) => pathToFileURL(f).href;
  const logo = path.join(brand.dir ?? BRAND_DIR, "logo.png"), mark = path.join(tmp, "mark.png");
  // The logo without its name, large (the round picture is small on a phone: no words in it).
  await still({ page: BRAND_PAGE, width: 1080, height: 1080, output: mark, transparent: true, params: { mode: "logo", theme: brand.theme, withName: false, brand, width: 1080, height: 1080 } });
  const out: string[] = [];
  const avatar = path.join(dir, "avatar.png");
  await still({ page: PAGE, width: 1080, height: 1080, output: avatar, params: { width: 1080, height: 1080, theme, kind: "avatar", focus: { x: 540, y: 540, r: 380 }, layers: [{ src: url(mark), x: 40, y: 40, w: 1000, h: 1000 }] } });
  out.push(avatar);
  for (const c of COVERS) {
    const people = path.join(tmp, `people-${c.width}.png`);
    await presenters(people, c.people.w, c.people.h);
    const file = path.join(dir, c.file);
    await still({ page: PAGE, width: c.width, height: c.height, output: file, params: {
      width: c.width, height: c.height, theme, kind: "banner",
      focus: { x: c.logo.x + c.logo.w / 2, y: c.logo.y + c.logo.h / 2, r: c.logo.w / 2 },
      ground: c.people.y + c.people.h * 0.96, // (the shot's gy: where the feet are)
      layers: [{ src: url(logo), ...c.logo }, { src: url(people), ...c.people, people: true }],
    } });
    out.push(file);
  }
  await fs.rm(tmp, { recursive: true, force: true });
  for (const f of out) log(`✔ ${f}`);
  return out;
}

/** Both channels: Huy Kể Chuyện (assets/brand) and Ask Huy (assets/brand/ask-huy). */
export async function allChannelArt(log: (s: string) => void = console.log): Promise<string[]> {
  const files: string[] = [];
  for (const id of [undefined, "ask-huy"]) {
    const brand = await loadBrand(undefined, id);
    if (brand) files.push(...(await channelArt(brand, log)));
  }
  return files;
}

if (process.argv[1]?.endsWith("channelart.ts")) await allChannelArt();
