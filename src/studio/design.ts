/**
 * The cast of a story, designed by the brain from the library's look vocabulary and the era's
 * archetypes (the plan's "look" notes say what each character wears), then drawn as a costume
 * sheet for the user to approve with the script. Approved, the cast is used as is: the scene
 * compiler never swaps a designed look for an archetype.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../config.ts";
import { think } from "../brain/claude.ts";
import { still } from "../animation/capture.ts";
import type { CastMember } from "../animation/compile/scene.ts";
import { jobDir, loadJob, saveJob } from "./jobs.ts";
import { eras } from "./topics.ts";
import { cleanLook, VOCABULARY } from "./vocabulary.ts";
import { BRAND_THEMES } from "../animation/brand/brand.ts";
import { styleKeys, styleMenu, styleOf } from "../animation/styles.ts";
import { artOf } from "./art.ts";
import { puppetKey, PUPPETS_DIR } from "../animation/puppet/paint.ts";
import { exists } from "../utils/fs.ts";
import type { Plan } from "./write.ts";

const PLAYER = path.join(ROOT, "src", "animation", "player.html");
const SHEET = path.join(ROOT, "src", "studio", "sheet.html");

const STYLE_KEYS = styleKeys(), THEME_KEYS = Object.keys(BRAND_THEMES);
const themeMenu = () => Object.entries(BRAND_THEMES).map(([k, t]) => `- ${k}: ${t.name} (${t.for})`).join("\n");

const SCHEMA = {
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_]{1,23}$" },
          name: { type: "string" },
          kind: { enum: ["human", "horse", "animal"] },
          archetype: { type: "string" },
          look: { type: "object", additionalProperties: true },
          scale: { type: "number" },
          group: { type: "boolean" },
          formOf: { type: "string" },
          speaks: { type: "array", items: { type: "string" } },
          role: { type: "string" },
        },
        required: ["id", "name", "kind", "archetype", "look", "scale", "group", "formOf", "speaks", "role"],
      },
    },
    art: {
      type: "object",
      properties: {
        style: { enum: STYLE_KEYS },
        intro: { enum: THEME_KEYS },
        outro: { enum: THEME_KEYS },
        why: { type: "string" },
      },
      required: ["style", "intro", "outro", "why"],
    },
  },
  required: ["characters", "art"],
};

export interface Designed extends CastMember { speaks: string[]; role: string }

const merge = (base: unknown, over: unknown): unknown => {
  if (!base || typeof base !== "object" || Array.isArray(base) || !over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
  const out: Record<string, unknown> = { ...(base as object) };
  for (const [k, v] of Object.entries(over as object)) out[k] = merge(out[k], v);
  return out;
};

/** Design the cast of a job: studio/jobs/<slug>/cast.json (CastMember[] + who speaks). */
export async function designCast(slug: string, log: (s: string) => void = console.log): Promise<Designed[]> {
  const job = await loadJob(slug), dir = jobDir(slug);
  const plan: Plan = JSON.parse(await fs.readFile(path.join(dir, "plan.json"), "utf8"));
  const all = await eras() as Record<string, { name: string; avoid?: string[]; archetypes?: Record<string, unknown> }>;
  const era = job.era ? all[job.era] : undefined;
  const story = plan.scenes.map((s, i) => `${i + 1}. ${s.parts.map((p) => (p.who ? `${p.who}: "${p.text}"` : p.text)).join(" ")}`).join("\n");
  const system = "Bạn là họa sĩ thiết kế nhân vật cho phim hoạt hình 2D thiếu nhi về truyện Việt Nam. Bạn chỉ dùng đúng các từ của thư viện hình, và vẽ trang phục đúng thời đại của truyện.";
  const prompt = [
    `Thiết kế nhân vật cho "${plan.title}". Thời đại: ${era?.name ?? job.era ?? "chưa rõ"}.`,
    era?.avoid?.length ? `Tránh: ${era.avoid.join("; ")}` : "",
    "",
    "Thư viện hình:", VOCABULARY, "",
    era?.archetypes ? `Mẫu nhân vật có sẵn của thời đại này (archetype; look của bạn được ghép đè lên mẫu, chỉ cần ghi chỗ khác):\n${JSON.stringify(era.archetypes)}` : "Thời đại chưa có mẫu: ghi đầy đủ look.",
    "",
    "Mô tả trang phục từ biên kịch:", plan.look, "",
    "Nhân vật có lời thoại:", ...plan.cast.map((c) => `- ${c.name}: ${c.role} (${c.gender}, ${c.age}${c.villain ? ", phe ác" : ""})`), "",
    "Yêu cầu:",
    "- Mỗi nhân vật trên màn hình một mục: người có lời thoại, cộng nhân vật không nói nhưng xuất hiện (ngựa, voi, đoàn quân, dân làng…). Vật không có trong thư viện thì bỏ qua.",
    "- speaks: các tên trong danh sách lời thoại mà nhân vật này nói (\"Dân làng\" là một đám đông: group true).",
    "- archetype: khóa mẫu gần nhất, hoặc \"none\". formOf: id của dạng trước nếu nhân vật biến hình, không thì \"none\".",
    "- scale: 1 người thường; trẻ nhỏ 0.75–0.85; khổng lồ khoảng 2.4.",
    "- Mỗi nhân vật chính phải dễ phân biệt: màu áo, kiểu tóc, mũ, khuôn mặt khác nhau.",
    "- role: một dòng mô tả cho bảng trang phục (tiếng Việt).",
    "- art: phong cách vẽ hợp nhất với truyện này (style), intro và outro của kênh (thường cùng một bộ, có thể khác), why: một câu tiếng Việt giải thích vì sao.",
    "",
    "Phong cách vẽ:", styleMenu(),
    "Intro/outro:", themeMenu(),
    "",
    "Truyện:", story,
  ].filter((l) => l !== "").join("\n");
  const { data } = await think<{ characters: (Omit<Designed, "formOf"> & { archetype: string; formOf: string })[]; art: { style: string; intro: string; outro: string; why: string } }>({ job: slug, step: "design-cast", model: "sonnet", system, prompt, schema: SCHEMA }, log);
  const cast: Designed[] = data.characters.map((c) => {
    const base = c.archetype !== "none" ? era?.archetypes?.[c.archetype] : undefined;
    const { archetype: _, ...rest } = c;
    const merged = base ? merge(JSON.parse(JSON.stringify(base)), c.look) : c.look;
    const { look, dropped } = c.kind === "human" ? cleanLook(merged as Record<string, unknown>) : { look: merged, dropped: [] };
    if (dropped.length) log(`  ${c.id}: left out ${dropped.join(", ")} (not in the library)`);
    return { ...rest, look, formOf: c.formOf !== "none" ? c.formOf : undefined, designed: true };
  });
  await fs.writeFile(path.join(dir, "cast.json"), JSON.stringify(cast, null, 2));
  // The look the brain suggests; a choice the user already made is kept.
  const a = data.art, fresh = await loadJob(slug);
  const suggest = { style: a.style, intro: a.intro, outro: a.outro, why: a.why, by: "brain" as const };
  fresh.art = fresh.art && (fresh.art.style !== fresh.art.suggest.style || fresh.art.intro !== fresh.art.suggest.intro || fresh.art.outro !== fresh.art.suggest.outro)
    ? { ...fresh.art, suggest } : { style: a.style, intro: a.intro, outro: a.outro, suggest };
  await saveJob(fresh);
  return cast;
}

/** The costume sheet: every character standing, with name and role (costumes.png). */
export async function costumeSheet(slug: string): Promise<string> {
  const job = await loadJob(slug), dir = jobDir(slug);
  const cast: Designed[] = JSON.parse(await fs.readFile(path.join(dir, "cast.json"), "utf8"));
  const plan: Plan = JSON.parse(await fs.readFile(path.join(dir, "plan.json"), "utf8"));
  const all = await eras() as Record<string, { name: string }>;
  const art = artOf(job), style = art.style, styleLook = styleOf(style).look;
  const tiles = path.join(dir, "sheet");
  await fs.mkdir(tiles, { recursive: true });
  const items: { src: string; name: string; role: string }[] = [];
  for (const c of cast) {
    const out = path.join(tiles, `${c.id}.png`);
    const scene = {
      duration: 2, time: "day", era: job.era, backdrop: false, style, styleLook, set: { name: c.kind !== "human" ? "field" : "sky" },
      cast: [{ id: c.id, type: c.kind, look: c.look, x: 0, scale: 1 }],
      actions: [{ actor: c.id, at: 0, do: c.kind === "horse" ? "stand" : "idle", ...(c.kind === "human" ? { face: "happy" } : {}) }],
      shots: [{ at: 0, type: "full", on: c.id }],
    };
    // Hand-painted puppets: the painting itself (when painted), on the sheet's paper.
    const painted = art.characters === "puppet" && c.kind === "human" ? path.join(PUPPETS_DIR, puppetKey(c.look as Record<string, unknown>, job.era, style), "base.png") : "";
    if (painted && (await exists(painted))) { items.push({ src: pathToFileURL(painted).href, name: c.name, role: c.role }); continue; }
    await still({ page: PLAYER, width: 480, height: 640, output: out, at: 1, params: { scene, width: 480, height: 640 } });
    items.push({ src: pathToFileURL(out).href, name: c.name, role: c.role });
  }
  const rows = Math.ceil(items.length / 4), height = 120 + rows * 735 + 40;
  const file = path.join(dir, "costumes.png");
  await still({ page: SHEET, width: 1920, height, output: file, params: { title: `${plan.title}: bảng trang phục`, era: `${all[job.era ?? ""]?.name ?? job.era ?? ""} · phong cách ${styleOf(style).name}${art.characters === "puppet" ? " · nhân vật vẽ tay" : ""}`, items } });
  await fs.rm(tiles, { recursive: true, force: true });
  return file;
}
