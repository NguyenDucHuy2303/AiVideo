/**
 * Painted backdrops for the cartoon: the sky, the distant land and the fields, painted by the
 * local image model (FLUX.2 klein) in the film's drawing style (library/styles.json). The architecture of the era
 * (boat-roofed stilt houses, the Văn Lang palace) and everything near the camera stay vector,
 * so the paintings never show buildings of the wrong period: they are pure landscape.
 *
 * One painting per set × time of day × era × style, kept in assets/library/generated/backdrops and
 * reused by every story.
 */
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bestImageGen, SIZES, type ImageGen } from "../imagegen/sd.ts";
import { LIBRARY_DIR } from "../storyboard/assets.ts";
import { styleOf } from "./styles.ts";

const DIR = path.join(LIBRARY_DIR, "generated", "backdrops");
/** What every backdrop is, whatever the style (library/styles.json gives the painting's look). */
const FRAME = "wide landscape, horizon in the lower third, empty foreground, no buildings, no people, no animals, no text";
const paintStyle = (style?: string) => `${styleOf(style).backdrop}, ${FRAME}`;
const NEGATIVE = "house, building, hut, roof, temple, pagoda, tower, boat, ship, bridge, island, people, person, figure, animal, text, letters, watermark, signature, frame, border, photo, realistic, 3d render, blurry, deformed, modern, car, road sign";

const SETS: Record<string, string> = {
  village: "empty unspoiled countryside, bamboo groves and areca palms around green rice paddies, distant limestone karst mountains, nature only",
  field: "wide open rice paddies with water reflecting the sky, low bamboo hedges, distant limestone karst mountains",
  // Open land only: the grove itself is drawn by the library (the model paints bamboo as palms).
  bamboo: "an open green meadow beside rice paddies, gentle green hills, distant limestone karst mountains, open land without trees",
  palace: "open royal grounds with old banyan trees and bamboo, green hills and distant mountains",
  mountain: "a tall forested mountain peak rising above rice fields and hills",
  sky: "fluffy white and golden clouds filling the whole picture, a heavenly sky high above the clouds, rays of divine light, no ground, no land, no water",
};
const TIMES: Record<string, string> = {
  dawn: "early morning, soft pink and gold sky, light mist",
  day: "bright day, blue sky with white clouds",
  dusk: "sunset, orange and purple sky, warm light",
  night: "night, moonlit, deep blue sky with stars",
};
const ERAS: Record<string, string> = {
  van_lang: "ancient Vietnam, the Red River delta in the Bronze Age",
};
/** An era's landscape: the words above, else what the era builder wrote (library/eras.json). */
function eraWords(era?: string): string {
  if (!era) return "Vietnam";
  if (ERAS[era]) return ERAS[era];
  try {
    const e = JSON.parse(readFileSync(new URL("./library/eras.json", import.meta.url), "utf8"))[era];
    if (e?.backdrop) return `Vietnam, ${e.backdrop}`;
  } catch {}
  return "Vietnam";
}

export function backdropPrompt(set: string, time: string, era?: string, style?: string): string {
  // A style may paint its own sky (lacquer, silk…); else the light of the time of day.
  const sky = styleOf(style).sky?.[time] ?? TIMES[time] ?? TIMES.day;
  // The sky realm is above any country: no land words in its prompt.
  if (set === "sky") return [SETS.sky, sky].join(", ");
  return [eraWords(era), SETS[set] ?? SETS.village, sky].join(", ");
}

let generator: Promise<ImageGen | undefined> | undefined;

/** The painting for a scene, or undefined when the image model is not installed. */
export async function backdropFor(scene: { set?: { name?: string }; time?: string; era?: string; style?: string }): Promise<string | undefined> {
  generator ??= bestImageGen();
  const gen = await generator;
  if (!gen) return undefined;
  await fs.mkdir(DIR, { recursive: true });
  const { file } = await gen.generate(backdropPrompt(scene.set?.name ?? "village", scene.time ?? "day", scene.era, scene.style), DIR, { style: paintStyle(scene.style), negative: NEGATIVE, shape: "landscape" });
  return file;
}

/** Give a scene its painted backdrop (unless it has one, or says "backdrop": false). */
export async function withBackdrop<T extends object>(scene: T): Promise<T> {
  const s = scene as { set?: { name?: string }; time?: string; era?: string; style?: string; backdrop?: unknown };
  if (s.backdrop !== undefined) return scene;
  const file = await backdropFor(s);
  return file ? { ...scene, backdrop: { src: pathToFileURL(file).href, size: SIZES.landscape } } : scene;
}
