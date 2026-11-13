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
  rainbow: "rainbow", thermometer: "thermometer", "water-drop": "droplet", straw: "cup-with-straw", child: "child", kids: "children-crossing", "school-bag": "backpack", schoolbag: "backpack", bag: "backpack", "glass-of-water": "cup-with-straw", juice: "beverage-box", clock: "alarm-clock", money: "money-bag", gift: "wrapped-gift", lantern: "red-paper-lantern",
};

const STOP = new Set(["of", "the", "a", "an", "with", "and", "in", "on", "little", "big", "small"]);
/** Colours said with a thing ("green schoolbag"): the set's pictures have their own. */
const COLOURS = new Set(["red", "green", "blue", "yellow", "pink", "purple", "orange", "black", "white", "brown", "grey", "gray", "violet", "golden"]);
const plain = (n: string) => n.split("-").filter((w) => !COLOURS.has(w)).join("-");

/**
 * Things a children's lesson needs that the set lacks (school things), drawn here in its flat,
 * outline-free look on a 32×32 box. Our own drawings (no licence to mind).
 */
const CUSTOM: Record<string, string> = {
  eraser: `<g transform="rotate(-18 16 16)"><rect x="4" y="11" width="24" height="11" rx="2.5" fill="#f48fb1"/><rect x="4" y="11" width="10" height="11" rx="2.5" fill="#4fc3f7"/><rect x="11" y="11" width="3" height="11" fill="#4fc3f7"/><rect x="4" y="19" width="24" height="3" rx="1.5" fill="#000" opacity=".12"/><rect x="6" y="13" width="5" height="1.6" rx=".8" fill="#fff" opacity=".7"/></g>`,
  "pencil-case": `<rect x="8" y="5" width="3" height="9" rx="1" fill="#ffb300"/><path d="M8 5l1.5-2.5L11 5z" fill="#5d4037"/><rect x="13.5" y="4" width="3" height="10" rx="1" fill="#43a047"/><path d="M13.5 4l1.5-2.5L16.5 4z" fill="#5d4037"/><rect x="19" y="6" width="3" height="8" rx="1" fill="#e53935"/><path d="M19 6l1.5-2.5L22 6z" fill="#5d4037"/><rect x="3" y="11" width="26" height="15" rx="6" fill="#7e57c2"/><rect x="3" y="11" width="26" height="5" rx="2.5" fill="#9575cd"/><path d="M5.5 14h21" stroke="#ffd54f" stroke-width="1.6" stroke-dasharray="1.6 1.2"/><circle cx="24" cy="14" r="1.8" fill="#ffd54f"/><path d="M24 15.5v4" stroke="#ffd54f" stroke-width="1.4" stroke-linecap="round"/>`,
  sharpener: `<rect x="6" y="11" width="20" height="14" rx="2.5" fill="#42a5f5"/><rect x="6" y="11" width="20" height="4" rx="2" fill="#64b5f6"/><circle cx="15" cy="18.5" r="3.6" fill="#263238"/><circle cx="15" cy="18.5" r="1.7" fill="#90a4ae"/><path d="M19.5 15.5l4-4" stroke="#b0bec5" stroke-width="2.2" stroke-linecap="round"/>`,
  "glue-stick": `<rect x="12" y="3" width="8" height="6" rx="1.5" fill="#fff8e1"/><rect x="11" y="8" width="10" height="3" rx="1" fill="#e53935"/><rect x="11" y="11" width="10" height="18" rx="2" fill="#ffca28"/><rect x="13" y="15" width="6" height="9" rx="1" fill="#fff"/>`,
};
const CUSTOM_NAMES: Record<string, string> = { eraser: "eraser", rubber: "eraser", "pencil-eraser": "eraser", "pencil-case": "pencil-case", "pencil-pouch": "pencil-case", "pencil-box": "pencil-case",
  sharpener: "sharpener", "pencil-sharpener": "sharpener", glue: "glue-stick", "glue-stick": "glue-stick" };
const customOf = (name: string) => { const n = plain(norm(name)); return CUSTOM_NAMES[n] ?? CUSTOM_NAMES[n.replace(/s$/, "")]; };
const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The name in the set that best matches a plain name (exact, synonym, singular, then by words). */
export function findIcon(name: string, s: IconSet = "color"): string | undefined {
  const data = set(s);
  if (!data) return undefined;
  const has = (n: string) => n in data.icons || n in data.aliases;
  // (the name as said first: "black cat" and "red apple" are pictures of their own)
  const raw = norm(name), n = plain(raw);
  if (!n) return undefined;
  for (const c of [raw, SYNONYMS[raw], n, SYNONYMS[n], n.replace(/s$/, ""), SYNONYMS[n.replace(/s$/, "")], `${n}-face`]) if (c && has(c)) return c;
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
  const own = customOf(name);
  if (own) return { name: own, body: CUSTOM[own]!, width: 32, height: 32 };
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
