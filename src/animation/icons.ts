/**
 * Pictures for the explainer boards: Microsoft's Fluent Emoji (MIT, ~3,100 each in a "color"
 * set, soft 3D-like gradients, and a "flat" one), from vendor/js/icons (the @iconify-json
 * packages). The scene director asks for things by plain English names ("cat", "red apple",
 * "honeybee", "sun"); resolveIcon finds the best match, and the board scene carries the SVG it
 * needs, so a render never reads the big icon files.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../config.ts";

export type IconSet = "color" | "flat";
interface IconData { body: string; width: number; height: number }
const FILES: Record<IconSet, string> = {
  color: path.join(ROOT, "vendor", "js", "icons", "fluent-emoji.json"),
  flat: path.join(ROOT, "vendor", "js", "icons", "fluent-emoji-flat.json"),
};
const loaded: Partial<Record<IconSet, { icons: Record<string, { body: string; width?: number; height?: number }>; aliases: Record<string, { parent: string }>; width: number; height: number; names: string[] }>> = {};

function set(s: IconSet) {
  if (!loaded[s]) {
    try {
      const raw = JSON.parse(readFileSync(FILES[s], "utf8"));
      loaded[s] = { icons: raw.icons, aliases: raw.aliases ?? {}, width: raw.width ?? 32, height: raw.height ?? 32, names: Object.keys(raw.icons) };
    } catch { return undefined; }
  }
  return loaded[s];
}
export const hasIcons = () => !!set("flat");

/** Words people use for things the set names otherwise. */
const SYNONYMS: Record<string, string> = {
  bee: "honeybee", sun: "sun", moon: "full-moon", star: "star", earth: "globe-showing-asia-australia", world: "globe-showing-asia-australia",
  apple: "red-apple", car: "automobile", plane: "airplane", boat: "sailboat", ship: "ship", house: "house", school: "school", tree: "deciduous-tree",
  flower: "blossom", water: "droplet", drop: "droplet", raindrop: "droplet", rain: "cloud-with-rain", cloud: "cloud", snow: "snowflake", fire: "fire",
  book: "open-book", pencil: "pencil", teacher: "teacher", kid: "child", boy: "boy", girl: "girl", mom: "woman", mother: "woman", dad: "man", father: "man",
  grandma: "old-woman", grandpa: "old-man", baby: "baby", family: "family", heart: "red-heart", eye: "eye", brain: "brain", tooth: "tooth", bone: "bone",
  rocket: "rocket", magnet: "magnet", light: "light-bulb", bulb: "light-bulb", battery: "battery", phone: "mobile-phone", computer: "laptop",
  rice: "cooked-rice", noodle: "steaming-bowl", pho: "steaming-bowl", fish: "fish", frog: "frog", crow: "black-bird", bird: "bird", chicken: "chicken",
  mouse: "mouse", ant: "ant", honey: "honey-pot", mountain: "mountain", volcano: "volcano", ocean: "water-wave", sea: "water-wave", wave: "water-wave",
  rainbow: "rainbow", thermometer: "thermometer", "water-drop": "droplet", straw: "cup-with-straw", child: "child", kids: "children-crossing", "school-bag": "backpack", bag: "backpack", "glass-of-water": "cup-with-straw", juice: "beverage-box", clock: "alarm-clock", money: "money-bag", gift: "wrapped-gift", lantern: "red-paper-lantern",
};

const STOP = new Set(["of", "the", "a", "an", "with", "and", "in", "on", "little", "big", "small"]);
const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The name in the set that best matches a plain name (exact, synonym, singular, then by words). */
export function findIcon(name: string, s: IconSet = "color"): string | undefined {
  const data = set(s);
  if (!data) return undefined;
  const has = (n: string) => n in data.icons || n in data.aliases;
  const n = norm(name);
  if (!n) return undefined;
  for (const c of [n, SYNONYMS[n], n.replace(/s$/, ""), SYNONYMS[n.replace(/s$/, "")], `${n}-face`]) if (c && has(c)) return c;
  // By words: every asked word in the name, the shortest name first (the plain thing, not a variant).
  const words = n.split("-").filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, "")).filter((w) => w.length > 1);
  const scored = data.names
    .map((k) => { const parts = k.split("-"); const hit = words.filter((w) => parts.some((p) => p === w || p.replace(/s$/, "") === w)).length; return { k, hit, len: parts.length }; })
    .filter((x) => x.hit > 0 && !/(light|medium|dark)-skin-tone/.test(x.k))
    .sort((a, b) => b.hit - a.hit || a.len - b.len || a.k.length - b.k.length);
  // Every asked word must be in the name ("school bag" is not the school)…
  if (scored[0] && scored[0].hit >= words.length) return scored[0].k;
  // …else the thing itself, the last word ("toy car" → car, "running child" → child).
  const head = words.at(-1);
  return head && head !== n && words.length > 1 ? findIcon(head, s) : undefined;
}

/** The SVG body and box of a named icon, or undefined. */
export function resolveIcon(name: string, s: IconSet = "color"): (IconData & { name: string }) | undefined {
  const data = set(s), key = findIcon(name, s);
  if (!data || !key) return undefined;
  const real = data.icons[key] ? key : data.aliases[key]!.parent;
  const ic = data.icons[real]!;
  return { name: real, body: ic.body, width: ic.width ?? data.width, height: ic.height ?? data.height };
}

/** Every <icon name="…"> a board's SVG asks for, resolved (unknown names left out). */
export function boardIcons(svg: string, s: IconSet = "color"): { icons: Record<string, IconData>; missing: string[] } {
  const icons: Record<string, IconData> = {}, missing: string[] = [];
  for (const m of svg.matchAll(/<icon\b[^>]*\bname\s*=\s*["']([^"']+)["']/g)) {
    const want = m[1]!;
    if (icons[want] || missing.includes(want)) continue;
    const r = resolveIcon(want, s);
    if (r) icons[want] = { body: r.body, width: r.width, height: r.height };
    else missing.push(want);
  }
  return { icons, missing };
}
