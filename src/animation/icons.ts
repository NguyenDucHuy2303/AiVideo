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
  // (children's vocabulary the word match got wrong: "ball" was a rice ball, "two" two hearts)
  ball: "soccer-ball", hat: "billed-cap", cake: "birthday-cake", orange: "tangerine", sheep: "ewe", lamb: "ewe", tv: "television", television: "television",
  sofa: "couch-and-lamp", couch: "couch-and-lamp", lamp: "light-bulb", pants: "jeans", trousers: "jeans", jacket: "coat", face: "slightly-smiling-face",
  head: "slightly-smiling-face", hand: "raised-hand", arm: "flexed-biceps", hair: "person-curly-hair", hello: "waving-hand", hi: "waving-hand", goodbye: "waving-hand", bye: "waving-hand",
  friend: "people-hugging", friends: "people-hugging", happy: "grinning-face", hungry: "face-savoring-food", thirsty: "cup-with-straw", doctor: "health-worker", nurse: "health-worker",
  chef: "cook", police: "police-officer", "police-officer": "police-officer", kitchen: "cooking", bathroom: "bathtub", bedroom: "bed", sunny: "sun", rainy: "cloud-with-rain", windy: "wind-face",
  spring: "cherry-blossom", summer: "sun-with-face", autumn: "fallen-leaf", fall: "fallen-leaf", winter: "snowman", sand: "beach-with-umbrella", beach: "beach-with-umbrella", bike: "bicycle", truck: "delivery-truck",
  red: "red-circle", blue: "blue-circle", green: "green-circle", yellow: "yellow-circle", purple: "purple-circle", brown: "brown-circle", black: "black-circle", white: "white-circle",
  zero: "keycap-0", one: "keycap-1", two: "keycap-2", three: "keycap-3", four: "keycap-4", five: "keycap-5", six: "keycap-6", seven: "keycap-7", eight: "keycap-8", nine: "keycap-9", ten: "keycap-10",
  board: "framed-picture", blackboard: "framed-picture", "name-tag": "name-badge", duckling: "baby-chick", chick: "baby-chick",
  bacteria: "microbe", bacterium: "microbe", germ: "microbe", germs: "microbe", virus: "microbe", worker: "man", builder: "man",
  stone: "rock", pebble: "rock", boulder: "rock", granite: "rock", limestone: "rock", "stone-block": "rock", "limestone-block": "rock", "honey-dipper": "honey-pot", archaeologist: "scientist",
};

const ACTION = new Set(["with", "holding", "on", "under", "near", "behind", "inside", "at", "by", "next", "beside", "eats", "has", "and"]);
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
  blocks: `<rect x="3" y="17" width="12" height="12" rx="1.5" fill="#ef5350"/><rect x="3" y="17" width="12" height="3" rx="1.5" fill="#e57373"/><path d="M6.4 27l2.6-7 2.6 7M7.4 24.6h3.2" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="17" y="17" width="12" height="12" rx="1.5" fill="#42a5f5"/><rect x="17" y="17" width="12" height="3" rx="1.5" fill="#64b5f6"/><path d="M20.6 20.4v6.6h2.6a1.7 1.7 0 0 0 0-3.4h-2.6 2.2a1.6 1.6 0 0 0 0-3.2z" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/><rect x="10" y="4" width="12" height="12" rx="1.5" fill="#66bb6a" transform="rotate(-6 16 10)"/><path d="M19.4 7.6a3.4 3.4 0 1 0 0 5" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" transform="rotate(-6 16 10)"/>`,
  "pyramid": `<rect x="0.5" y="26" width="31" height="3.5" rx="1.75" fill="#f5d896"/><path d="M16 4L30 27H2z" fill="#f2c26b"/><path d="M16 4L30 27H17.5z" fill="#cf9139"/><path d="M11.4 11.5h7.6M8.5 16.5h10.3M5.6 21.5h13.3" stroke="#c48a35" stroke-width=".9" opacity=".55"/><path d="M12 11.5v5M15 16.5v5M9.5 21.5v5.5M14 21.5v5.5" stroke="#c48a35" stroke-width=".8" opacity=".45"/>`,
  "beehive": `<ellipse cx="16" cy="28" rx="12" ry="1.8" fill="#000" opacity=".12"/><rect x="5" y="21.5" width="22" height="6" rx="3" fill="#e9a92f"/><rect x="6.5" y="16.5" width="19" height="5.6" rx="2.8" fill="#f5c451"/><rect x="8.5" y="11.8" width="15" height="5.4" rx="2.7" fill="#e9a92f"/><rect x="11" y="7.4" width="10" height="5" rx="2.5" fill="#f5c451"/><ellipse cx="16" cy="7.6" rx="3.6" ry="2.2" fill="#d8962a"/><path d="M13.6 27.5v-2.6a2.4 2.4 0 0 1 4.8 0v2.6z" fill="#5d3a12"/><g fill="#3a2a10"><ellipse cx="24.5" cy="9" rx="1.6" ry="1.1"/></g><path d="M23.6 8.1q-1-1.6.4-1.8M25.2 8q.8-1.7 1.6-.6" stroke="#9fd3f5" stroke-width="1" fill="none"/>`,
  "honeycomb": `<polygon points="11.2,3.8 15.7,6.4 15.7,11.6 11.2,14.2 6.7,11.6 6.7,6.4" fill="#f6b81f" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><polygon points="20.8,3.8 25.3,6.4 25.3,11.6 20.8,14.2 16.3,11.6 16.3,6.4" fill="#ffd45c" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><polygon points="6.4,12.1 10.9,14.7 10.9,19.9 6.4,22.5 1.9,19.9 1.9,14.7" fill="#f6b81f" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><polygon points="16.0,12.1 20.5,14.7 20.5,19.9 16.0,22.5 11.5,19.9 11.5,14.7" fill="#ffd45c" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><polygon points="25.6,12.1 30.1,14.7 30.1,19.9 25.6,22.5 21.1,19.9 21.1,14.7" fill="#f6b81f" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><polygon points="11.2,20.3 15.7,22.9 15.7,28.1 11.2,30.7 6.7,28.1 6.7,22.9" fill="#ffd45c" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><polygon points="20.8,20.3 25.3,22.9 25.3,28.1 20.8,30.7 16.3,28.1 16.3,22.9" fill="#f6b81f" stroke="#c97f08" stroke-width="1.1" stroke-linejoin="round"/><path d="M20.3 6.8l1.6 1" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".7"/>`,
  "venus": `<circle cx="16" cy="16" r="13" fill="#efc27a"/><path d="M3.6 12.5q12.4-4 24.8 0" stroke="#d6964b" stroke-width="2.4" fill="none" opacity=".7"/><path d="M3.2 18.5q12.8 4 25.6 0" stroke="#d6964b" stroke-width="2" fill="none" opacity=".6"/><path d="M6.5 24.6q9.5 2.6 19 0" stroke="#e4ae63" stroke-width="1.8" fill="none"/><path d="M6.8 7.6q9.2-2.4 18.4 0" stroke="#f7d79c" stroke-width="1.8" fill="none"/><circle cx="11" cy="10.5" r="3.2" fill="#fff" opacity=".22"/>`,
  "sugar-cube": `<ellipse cx="16" cy="28.5" rx="10" ry="1.6" fill="#000" opacity=".1"/><path d="M16 5.5L27 11v11.5L16 28 5 22.5V11z" fill="#e8ecf2" stroke="#b8c1cc" stroke-width=".8" stroke-linejoin="round"/><path d="M16 5.5L27 11 16 16.5 5 11z" fill="#fff"/><path d="M27 11v11.5L16 28V16.5z" fill="#cfd6e0"/><g fill="#b8c1cc"><circle cx="9" cy="17" r=".6"/><circle cx="11.5" cy="21" r=".5"/><circle cx="21" cy="19.5" r=".6"/><circle cx="23.5" cy="15" r=".5"/><circle cx="14" cy="10.5" r=".5"/><circle cx="19" cy="11.5" r=".5"/></g>`,
  "paper-ball": `<ellipse cx="16" cy="28.6" rx="10" ry="1.6" fill="#000" opacity=".1"/><path d="M7 12L12 6l7-.5 6 3.5 2.5 7-2.5 7.5-7 3.5-7.5-1.5-5-6z" fill="#f6f6f1" stroke="#b9b9ae" stroke-width=".9" stroke-linejoin="round"/><path d="M15 13l12.5 3-2.5 7.5-7 3.5 1-7z" fill="#e3e3da"/><path d="M12 6l3 7 10-4M15 13l-4.5 12.5M15 13l-9.5 6.5M19 20l-1 7M19 20l6 3.5M15 13l4 7" stroke="#c4c4b8" stroke-width=".8" fill="none" stroke-linejoin="round"/>`,
  "glue-stick": `<rect x="12" y="3" width="8" height="6" rx="1.5" fill="#fff8e1"/><rect x="11" y="8" width="10" height="3" rx="1" fill="#e53935"/><rect x="11" y="11" width="10" height="18" rx="2" fill="#ffca28"/><rect x="13" y="15" width="6" height="9" rx="1" fill="#fff"/>`,
};
const CUSTOM_NAMES: Record<string, string> = { eraser: "eraser", rubber: "eraser", "pencil-eraser": "eraser", "pencil-case": "pencil-case", "pencil-pouch": "pencil-case", "pencil-box": "pencil-case",
  sharpener: "sharpener", "pencil-sharpener": "sharpener", glue: "glue-stick", "glue-stick": "glue-stick",
  pyramid: "pyramid", pyramids: "pyramid", "great-pyramid": "pyramid", "egyptian-pyramid": "pyramid", "pyramid-of-giza": "pyramid", "great-pyramid-of-giza": "pyramid",
  beehive: "beehive", hive: "beehive", "bee-hive": "beehive", honeycomb: "honeycomb", "honey-comb": "honeycomb", venus: "venus", "planet-venus": "venus",
  "sugar-cube": "sugar-cube", "sugar-cubes": "sugar-cube", sugar: "sugar-cube", "paper-ball": "paper-ball", "crumpled-paper": "paper-ball", "crumpled-paper-ball": "paper-ball", "ball-of-paper": "paper-ball", "paper-wad": "paper-ball",
  blocks: "blocks", block: "blocks", "toy-blocks": "blocks", "toy-block": "blocks", "building-blocks": "blocks", "wooden-blocks": "blocks", "abc-blocks": "blocks", "alphabet-blocks": "blocks" };
const customOf = (name: string) => { const n = plain(norm(name)); return CUSTOM_NAMES[n] ?? CUSTOM_NAMES[n.replace(/s$/, "")]; };
const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The name in the set that best matches a plain name (exact, synonym, singular, then by words). */
export function findIcon(name: string, s: IconSet = "color"): string | undefined {
  const data = set(s);
  if (!data) return undefined;
  const has = (n: string) => n in data.icons || n in data.aliases;
  // (the name as said first: "black cat" and "red apple" are pictures of their own)
  const raw = norm(name), n = plain(raw);
  // (a colour alone is the colour lesson's word: its swatch)
  if (!n) return SYNONYMS[raw] && has(SYNONYMS[raw]!) ? SYNONYMS[raw] : undefined;
  for (const c of [raw, SYNONYMS[raw], n, SYNONYMS[n], n.replace(/s$/, ""), SYNONYMS[n.replace(/s$/, "")], `${n}-face`]) if (c && has(c)) return c;
  // (a thing doing something is the thing: "rabbit eating carrot" → rabbit, "girl holding a kite" → girl)
  const cut = raw.split("-").findIndex((w, i) => i > 0 && (ACTION.has(w) || (w.length > 4 && w.endsWith("ing") && !/(ring|king|wing|swing|string|ceiling|building|painting|pudding|duckling|earring)$/.test(w))));
  if (cut > 0) return findIcon(raw.split("-").slice(0, cut).join("-"), s);
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
