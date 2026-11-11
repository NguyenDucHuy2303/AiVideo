/**
 * Topic proposals: the brain suggests Vietnamese folk tales, legends and history stories for
 * young children that the channel has not made yet, eras already in the library first.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { think } from "../brain/claude.ts";
import { listJobs } from "./jobs.ts";

export interface Topic {
  title: string;
  kind: "cổ tích" | "truyền thuyết" | "lịch sử" | "ngụ ngôn";
  /** An era key from library/eras.json, or a new key (snake_case) for an era to be built. */
  era: string;
  eraName: string;
  newEra: boolean;
  summary: string;
  /** Why children will watch it to the end. */
  hook: string;
  /** Vietnamese Wikipedia article titles to research. */
  wiki: string[];
}

const SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          kind: { enum: ["cổ tích", "truyền thuyết", "lịch sử", "ngụ ngôn"] },
          era: { type: "string" },
          eraName: { type: "string" },
          newEra: { type: "boolean" },
          summary: { type: "string" },
          hook: { type: "string" },
          wiki: { type: "array", items: { type: "string" } },
        },
        required: ["title", "kind", "era", "eraName", "newEra", "summary", "hook", "wiki"],
      },
    },
  },
  required: ["topics"],
};

export async function eras(): Promise<Record<string, { name: string; stories?: string[] }>> {
  return JSON.parse(await fs.readFile(path.join(ROOT, "src", "animation", "library", "eras.json"), "utf8"));
}

/** Titles already made or in the works. */
async function made(): Promise<string[]> {
  const titles = (await listJobs()).map((j) => j.topic);
  const projects = path.join(ROOT, "projects");
  for (const d of await fs.readdir(projects)) {
    const sb = path.join(projects, d, "storyboard.json");
    if (await exists(sb)) titles.push(JSON.parse(await fs.readFile(sb, "utf8")).title ?? d);
  }
  return [...new Set(titles)];
}

/** The animals the cartoon can draw (runtime/animals.js, horse.js): a fable's cast must be among them. */
export const ANIMALS = "trâu, hổ, voi, chó, mèo, thỏ, cáo, rùa, hươu, dê, ngựa";

/**
 * Topics for the next videos. fables: only animal fables whose characters the cartoon can draw;
 * otherwise folk tales, legends and history (fables left to their own line).
 */
export async function proposeTopics(count: number, log?: (s: string) => void, opts: { fables?: boolean; hints?: string[] } = {}): Promise<Topic[]> {
  const known = await eras();
  const done = await made();
  const system = "Bạn là biên tập viên nội dung của kênh YouTube hoạt hình \"Huy Kể Chuyện\" kể truyện cổ tích, truyền thuyết và lịch sử Việt Nam cho trẻ em 4–10 tuổi. Bạn am hiểu văn học dân gian và lịch sử Việt Nam, chỉ đề xuất truyện có thật trong kho tàng Việt Nam, không bịa truyện.";
  const prompt = [
    `Đề xuất ${count} chủ đề cho các video tiếp theo (mỗi video 5–8 phút).`,
    "",
    "Thời đại đã có sẵn trong thư viện hình (ưu tiên, vì làm được ngay):",
    ...Object.entries(known).map(([k, v]) => `- ${k}: ${v.name}${v.stories ? ` (ví dụ: ${v.stories.join(", ")})` : ""}`),
    "",
    "Đã làm hoặc đang làm (không đề xuất lại):",
    ...done.map((t) => `- ${t}`),
    "",
    "Yêu cầu:",
    "- Khoảng hai phần ba thuộc thời đại đã có; còn lại có thể thuộc thời đại mới (newEra: true, era là khóa snake_case mới như bac_thuoc, ly_tran, co_tich_lang_que; eraName ghi rõ thời kỳ và niên đại).",
    "- Truyện cổ tích không gắn thời điểm cụ thể (Tấm Cám, Sọ Dừa…) dùng era co_tich_lang_que: làng quê Bắc Bộ thời phong kiến.",
    "- Truyện có cốt truyện rõ, nhiều nhân vật và lời thoại, hợp với trẻ nhỏ, đúng thuần phong mỹ tục; truyện lịch sử thì kể theo hướng anh hùng, không bạo lực chi tiết.",
    "- Xếp theo mức độ hấp dẫn với trẻ em (nổi tiếng, có phép màu, có bài học).",
    "- wiki: 1–3 tên bài Wikipedia tiếng Việt chính xác để tra cứu.",
    ...(opts.fables ? [
      "",
      "CHỈ đề xuất truyện ngụ ngôn (kind: \"ngụ ngôn\") có nhân vật chính là con vật biết nói, mỗi truyện một bài học rõ ràng cho trẻ 3–7 tuổi:",
      "- Ưu tiên ngụ ngôn Việt Nam (Thầy bói xem voi, Đeo nhạc cho mèo…), rồi truyện ngụ ngôn kinh điển của thế giới hợp với trẻ Việt (Rùa và Thỏ…).",
      `- Mọi con vật trong truyện phải thuộc các loài vẽ được: ${ANIMALS}. Có thể có thêm người. Không chọn truyện cần ếch, quạ, chuột, gà, kiến… (chưa vẽ được).`,
      "- era: co_tich_lang_que (làng quê, rừng núi Việt Nam), newEra: false.",
    ] : ["", "Không đề xuất truyện ngụ ngôn con vật (có dòng riêng)."]),
    ...(opts.hints?.length ? ["", "Đang vào mùa hoặc đang được quan tâm (dùng khi hợp, không gượng ép):", ...opts.hints.map((h) => `- ${h}`)] : []),
  ].join("\n");
  const { data } = await think<{ topics: Topic[] }>({ job: "topics", step: "propose-topics", model: "sonnet", system, prompt, schema: SCHEMA }, log);
  return data.topics.filter((t) => !done.some((d) => d.toLowerCase() === t.title.toLowerCase()) && (!opts.fables || t.kind === "ngụ ngôn")).slice(0, count);
}
