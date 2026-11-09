/**
 * Hand-painted paper puppets (runtime/puppet.js) for the people of a story. Each person's
 * approved look (the costume vocabulary) is put into words for FLUX.2 klein, which paints:
 *   base.png     the person, three-quarter view facing right, arms a little away, white ground
 *   armless.png  the same person without arms (an edit of base.png)
 *   face.png     the same person, mouth open and eyes closed (an edit of base.png)
 * then cut.py cuts them into pieces. Everything is kept in assets/library/puppets/<key>/ and
 * reused by every story with the same look, era and style (no tokens: the words come from rules).
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { ROOT } from "../../config.ts";
import { flux2Klein } from "../../imagegen/sd.ts";
import { exists, sha256 } from "../../utils/fs.ts";
import { styleOf } from "../styles.ts";

export const PUPPETS_DIR = path.join(ROOT, "assets", "library", "puppets");
const PYTHON = path.join(ROOT, "vendor", "puppet", "venv", "bin", "python");
const CUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "cut.py");
const VERSION = 1;
const SIZE: [number, number] = [512, 896];
const BG = "isolated on a plain flat white background, no scenery, no ground, no shadow, no text, no border";

export interface PuppetRig { dir: string; size: [number, number]; parts: Record<string, string>; j: Record<string, [number, number]> }

// ---- the look in words ----

const COLOURS: [string, number[]][] = [
  ["black", [20, 20, 20]], ["charcoal grey", [60, 60, 64]], ["grey", [128, 128, 128]], ["white", [240, 238, 230]], ["cream", [238, 226, 196]],
  ["beige", [210, 190, 150]], ["brown", [110, 70, 40]], ["dark brown", [70, 45, 28]], ["tan", [190, 140, 90]], ["red", [190, 40, 30]],
  ["dark red", [120, 25, 20]], ["crimson", [160, 20, 50]], ["pink", [230, 150, 170]], ["orange", [230, 130, 40]], ["gold", [220, 170, 50]],
  ["yellow", [240, 210, 60]], ["olive green", [110, 120, 50]], ["forest green", [50, 110, 60]], ["green", [70, 150, 70]], ["teal", [40, 120, 120]],
  ["sky blue", [120, 180, 230]], ["blue", [50, 90, 180]], ["indigo", [50, 50, 120]], ["navy blue", [30, 40, 80]], ["purple", [110, 60, 140]],
];
function colour(hex?: unknown): string {
  if (typeof hex !== "string" || !/^#[0-9a-f]{6}$/i.test(hex)) return "";
  const n = parseInt(hex.slice(1), 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
  return COLOURS.reduce((best, c) => { const d = c[1].reduce((s, v, i) => s + (v - rgb[i]!) ** 2, 0); return d < best[1] ? [c[0], d] as [string, number] : best; }, ["", Infinity] as [string, number])[0];
}

const ERAS: Record<string, string> = {
  van_lang: "Bronze Age Vietnam (Van Lang, Dong Son culture)", au_lac: "ancient Au Lac Vietnam, 3rd century BC",
  bac_thuoc: "Vietnam in the 1st to 9th century", ngo_dinh_le: "10th-century Vietnam", ly: "Ly dynasty Vietnam, 11th century",
  ly_tran: "Ly and Tran dynasty Vietnam, 11th to 14th century", tran: "Tran dynasty Vietnam, 13th century", le_so: "early Le dynasty Vietnam, 15th century",
  tay_son: "late 18th-century Vietnam (Tay Son)", nguyen: "19th-century Vietnam (Nguyen dynasty)", co_tich_lang_que: "a traditional northern Vietnamese village of old times",
};
const BODY: Record<string, string> = { child: "a young Vietnamese child", man: "a Vietnamese man", strong: "a tall strong muscular Vietnamese young man", woman: "a Vietnamese woman", elder: "an old Vietnamese man with a slightly bent back" };
const CUT_WORDS: Record<string, string> = { chui: "pullover tunic", canh: "short buttoned blouse (ao canh)", tu_than: "four-panel dress (ao tu than) open at the front over a halter bodice", giao_linh: "robe with a crossed collar", vien_linh: "round-collared official robe", ngu_than: "five-panel tunic with a standing collar", yem: "halter bodice (yem) only" };
const HEAD: Record<string, string> = {
  feather: "a tall crown of bird feathers", feather_band: "a headband with bird feathers", helmet: "an iron helmet", enemy_helmet: "a foreign soldier's helmet", crown: "a royal crown",
  khan_van: "a wrapped cloth turban (khan van)", khan_mo_qua: "a crow-beak headscarf (khan mo qua)", khan_chit: "a cloth tied around the head", khan_xep: "a pleated turban (khan xep)",
  nonla: "a conical palm-leaf hat", non_quai_thao: "a large flat palm hat with fringes", non_chop: "a pointed soldier's hat", mu_canh_chuon: "a mandarin's hat with side wings", binh_thien: "an emperor's flat-topped crown",
};
const HAIR: Record<string, string> = { traidao: "a shaved head with small tufts of hair", bun: "hair tied in a topknot", long: "long hair", short: "short hair", turban: "hair wrapped in a turban", bald: "a bald head" };

/** The look in English words for the painter (only what the approved look says). */
export function describeLook(look: Record<string, any>, era?: string): string {
  const w: string[] = [BODY[look.body] ?? "a Vietnamese person"];
  if (look.build === "heavy") w.push("stout"); else if (look.build === "slim") w.push("slim");
  if (look.skin) w.push(`${colour(look.skin)} skin`.replace(/^ /, ""));
  const o = look.outfit ?? {};
  const female = look.body === "woman";
  switch (o.type) {
    case "dongson": w.push(`a short ${colour(o.color)} pullover top with a bronze-drum pattern band${o.trim ? ` in ${colour(o.trim)}` : ""}`, female ? `a long ${colour(o.skirt) || "dark"} wrap skirt` : `a ${colour(o.skirt) || "brown"} cloth loincloth`); break;
    case "plume": w.push("a ceremonial bronze-studded top and a skirt fringed with bird feathers"); break;
    case "armor": w.push(`${colour(o.color) || "iron"} armour of iron plates`); break;
    case "enemy": w.push(`a ${colour(o.color) || "dark"} foreign soldier's uniform`); break;
    case "loincloth": w.push(`a ${colour(o.color) || "brown"} loincloth`, "bare chest"); break;
    case "robe": w.push(`a long ${colour(o.color)} robe`); break;
    case "dress": w.push(`a ${colour(o.color)} top and a long ${colour(o.skirt) || "dark"} skirt`); break;
    case "parts": {
      const t = o.top ?? {};
      if (t.cut) w.push(`a ${t.length ? `${t.length}-length ` : ""}${colour(t.color)} ${CUT_WORDS[t.cut] ?? "tunic"}${t.sleeves === "wide" ? " with wide sleeves" : t.sleeves === "none" ? " without sleeves" : t.sleeves === "short" ? " with short sleeves" : ""}${t.pattern && t.pattern !== "none" ? ` with a ${t.pattern === "dongson" ? "bronze-drum" : t.pattern} pattern` : ""}${t.trim ? `, ${colour(t.trim)} trim` : ""}`);
      if (o.inner?.color) w.push(`a ${colour(o.inner.color)} halter bodice underneath`);
      const l = o.lower ?? {};
      if (l.type && l.type !== "none") w.push(`${colour(l.color)} ${l.type === "skirt" ? "long skirt" : l.type === "pants" ? "loose trousers" : "loincloth"}`);
      if (o.belt?.color) w.push(`a ${colour(o.belt.color)} sash belt`);
      break;
    }
    default: if (o.color) w.push(`a ${colour(o.color)} tunic`);
  }
  if (look.bareChest) w.push("bare chest");
  if (look.hair?.style) {
    const h = HAIR[look.hair.style] ?? "hair", c = colour(look.hair.color) || "black";
    w.push(h.startsWith("a ") ? `${h} (${c} hair)` : h.startsWith("hair") ? `${c} ${h}` : `${h.replace(" hair", "")} ${c} hair`);
  }
  if (look.headwear && HEAD[look.headwear]) w.push(`wearing ${HEAD[look.headwear]}`);
  if (look.beard) w.push(`a ${colour(look.beard)} beard`);
  if (look.face?.mustache && look.face.mustache !== "none") w.push("a moustache");
  if (look.cape) w.push(`a ${typeof look.cape === "string" ? colour(look.cape) : "red"} cape`);
  if (look.tattoo) w.push("small Dong Son bird tattoos on the arms");
  if (look.bracelets) w.push("bronze armlets");
  if (look.earrings) w.push("bronze earrings");
  w.push(look.body === "child" ? "barefoot" : "", ERAS[era ?? ""] ? `in ${ERAS[era!]}` : "historical Vietnam");
  return w.filter(Boolean).join(", ");
}

// ---- painting and cutting ----

export function puppetKey(look: Record<string, any>, era: string | undefined, style: string): string {
  const { prop: _p, props: _ps, ...shape } = look; // props are drawn by the library, in the hand
  return sha256(JSON.stringify({ v: VERSION, d: describeLook(shape, era), style })).slice(0, 14);
}

/** The puppet for a look (painted and cut once, then from the library). */
export async function paintPuppet(look: Record<string, any>, opts: { era?: string; style: string; role?: string; log?: (s: string) => void }): Promise<PuppetRig> {
  const log = opts.log ?? console.log;
  const key = puppetKey(look, opts.era, opts.style), dir = path.join(PUPPETS_DIR, key);
  const rigFile = path.join(dir, "parts", "rig.json");
  if (await exists(rigFile)) return loadPuppet(dir);
  const gen = await flux2Klein();
  if (!gen) throw new Error("FLUX.2 klein is not installed (scripts/setup-imagegen-next.sh)");
  if (!(await exists(PYTHON))) throw new Error("vendor/puppet is not set up (scripts/setup-puppet.sh)");
  await fs.mkdir(dir, { recursive: true });
  const who = describeLook(look, opts.era), st = styleOf(opts.style).character ?? styleOf(opts.style).backdrop;
  await fs.writeFile(path.join(dir, "prompt.txt"), `${who}\n${opts.role ?? ""}\n${opts.style}\n`);
  const step = async (name: string, prompt: string, refs?: string[]) => {
    const out = path.join(dir, `${name}.png`);
    if (await exists(out)) return;
    const t0 = Date.now();
    const { file } = await gen.generate(prompt, dir, { raw: true, size: SIZE, refs, seed: 11 });
    await fs.rename(file, out);
    log(`    ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  };
  const base = path.join(dir, "base.png");
  await step("base", `full body character design, three-quarter view, body and face turned toward the right side of the picture, standing upright, arms hanging down slightly away from the body, empty hands, feet apart, calm face with closed mouth, ${who}, ${st}, ${BG}`);
  await step("armless", `the same character in exactly the same pose and place, but with both arms completely removed (no arms, no hands), the clothes and body unchanged, ${BG}`, [base]);
  await step("face", `the same character in exactly the same pose, with the mouth wide open as if talking and both eyes closed, everything else exactly the same, ${BG}`, [base]);
  await promisify(execFile)(PYTHON, ["-I", CUT, dir, path.join(dir, "parts")], { timeout: 5 * 60_000 });
  return loadPuppet(dir);
}

export async function loadPuppet(dir: string): Promise<PuppetRig> {
  const rig = JSON.parse(await fs.readFile(path.join(dir, "parts", "rig.json"), "utf8"));
  return { dir: pathToFileURL(path.join(dir, "parts")).href + "/", size: rig.size, parts: rig.parts, j: rig.j };
}
