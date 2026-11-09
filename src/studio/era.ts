/**
 * The era builder: an era the library lacks (a job's topic is set in it) is researched and
 * written into library/eras.json in the library's own words: what to draw and to avoid,
 * customs, the houses, the landscape for the backdrop painter, and archetype looks made of
 * garment parts. Built once; every later story of that era uses it. The costume sheet of the
 * job shows the result to the user before anything is made with it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { think } from "../brain/claude.ts";
import { research, search } from "../research/wiki.ts";
import { HOUSES, VOCABULARY, cleanLook } from "./vocabulary.ts";

const ERAS_FILE = path.join(ROOT, "src", "animation", "library", "eras.json");

export interface Era {
  name: string;
  stories: string[];
  draw: string[];
  avoid: string[];
  customs: string[];
  sources: string[];
  architecture: { house: (typeof HOUSES)[number]; palace: (typeof HOUSES)[number] };
  /** English words for the backdrop painter: the land, nature, light of the era (no buildings). */
  backdrop: string;
  archetypes: Record<string, unknown>;
}

const LOOK = { type: "object", additionalProperties: true };
const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    stories: { type: "array", items: { type: "string" } },
    draw: { type: "array", items: { type: "string" } },
    avoid: { type: "array", items: { type: "string" } },
    customs: { type: "array", items: { type: "string" } },
    sources: { type: "array", items: { type: "string" } },
    architecture: { type: "object", properties: { house: { enum: [...HOUSES] }, palace: { enum: [...HOUSES] } }, required: ["house", "palace"] },
    backdrop: { type: "string" },
    archetypes: {
      type: "object",
      properties: Object.fromEntries(["king", "queen", "official", "general", "soldier", "enemy", "scholar", "villager_man", "villager_woman", "girl", "boy", "elder_man", "elder_woman", "mother", "monk", "fairy"].map((k) => [k, LOOK])),
      additionalProperties: LOOK,
    },
  },
  required: ["name", "stories", "draw", "avoid", "customs", "sources", "architecture", "backdrop", "archetypes"],
};

export async function loadEras(): Promise<Record<string, Era>> {
  return JSON.parse(await fs.readFile(ERAS_FILE, "utf8"));
}

/** Research and write an era; returns it (and leaves an existing one alone). */
export async function buildEra(key: string, hint: { eraName?: string; topic?: string; job: string }, log: (s: string) => void = console.log): Promise<Era> {
  const all = await loadEras();
  if (all[key]) return all[key];
  const name = hint.eraName ?? key.replace(/_/g, " ");
  // Dress, houses and daily life of the period; the topic's own article for its setting.
  const titles = [...new Set([
    ...(await search(`trang phục ${name}`, 3)),
    ...(await search(`kiến trúc nhà ở ${name}`, 2)),
    ...(await search(name, 2)),
    "Trang phục Việt Nam",
  ])];
  const sources = await research(`era ${key}`, { titles, count: 5, budget: 30_000 });
  log(`  era research: ${sources.map((s) => s.title).join(", ")}`);
  const example = all.van_lang ? JSON.stringify({ draw: all.van_lang.draw, avoid: all.van_lang.avoid, customs: all.van_lang.customs }) : "";
  const system = "Bạn là nhà nghiên cứu lịch sử trang phục, kiến trúc và phong tục Việt Nam, làm cố vấn cho một phim hoạt hình thiếu nhi. Bạn chỉ khẳng định điều có trong tư liệu hoặc là hiểu biết phổ biến chắc chắn; điều không chắc thì đưa vào danh sách tránh.";
  const prompt = [
    `Mô tả thời đại "${name}" (khóa ${key}) cho thư viện hình${hint.topic ? `; truyện đầu tiên sẽ làm: "${hint.topic}"` : ""}.`,
    "",
    "Thư viện chỉ vẽ được những từ sau (archetypes phải dùng đúng các từ này; trang phục thời sau Văn Lang dùng outfit ghép mảnh):",
    VOCABULARY,
    "",
    `Ví dụ thời Văn Lang đã có: ${example}`,
    "",
    "Yêu cầu:",
    "- name: tên thời đại và niên đại. stories: các truyện, nhân vật thuộc thời này.",
    "- draw: những gì nên vẽ (trang phục từng tầng lớp, nhà cửa, đồ vật, vũ khí). avoid: những gì sai thời (của thời trước hoặc sau), kèm lý do ngắn.",
    "- customs: phong tục cần tôn trọng khi vẽ cho trẻ em (cách chào, lễ nghi, tôn ti).",
    "- architecture.house: nhà dân (boat = nhà sàn mái thuyền Văn Lang; thatch = nhà tranh vách đất; tile = nhà ngói). architecture.palace: cung điện, đình.",
    "- backdrop: một câu tiếng Anh tả cảnh quan thiên nhiên của vùng và thời này cho họa sĩ vẽ nền (không có nhà, không có người).",
    "- archetypes: 10–16 mẫu nhân vật thường gặp (vua, hoàng hậu, quan, tướng, lính, giặc ngoại xâm của thời đó, nông dân nam, nữ, cô gái, trẻ em, cụ già, sư, tiên/bụt nếu hợp…), mỗi mẫu là một look đầy đủ, màu sắc đúng tầng lớp, phân biệt được nhau.",
    "- sources: tên các bài tư liệu đã dùng.",
    "",
    "Tư liệu:",
    ...sources.map((s) => `### ${s.title}\n${s.text}`),
  ].join("\n");
  const { data } = await think<Era>({ job: hint.job, step: `build-era-${key}`, model: "opus", effort: "medium", system, prompt, schema: SCHEMA }, log);
  for (const [k, raw] of Object.entries(data.archetypes)) {
    // Sometimes an archetype comes wrapped as { kind, look }: keep the look.
    const look = raw && typeof raw === "object" && "look" in raw ? (raw as { look: unknown }).look : raw;
    const { look: clean, dropped } = cleanLook(look as Record<string, unknown>);
    if (dropped.length) log(`  ${key}.${k}: left out ${dropped.join(", ")}`);
    data.archetypes[k] = clean;
  }
  // Written last and re-read first: another job may have added an era meanwhile.
  const now = await loadEras();
  if (!now[key]) {
    now[key] = data;
    await fs.writeFile(ERAS_FILE, JSON.stringify(now, null, 2) + "\n");
    log(`  era ${key} written to library/eras.json (${Object.keys(data.archetypes).length} archetypes)`);
  }
  return now[key]!;
}
