/**
 * Script writing: research → the brain writes a 5–8 minute script with dialogue, faithful to
 * the sources and to the era → checks (format the voice builder reads, length, moods) → a
 * revision when the checks fail → script.txt, plan.json and project.json in the job folder,
 * then the job waits for the user's review.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { research, type Source } from "../research/wiki.ts";
import { moodOf, splitSpeakers } from "../tts/narrate.ts";
import { exists } from "../utils/fs.ts";
import { castVoices, type CastMember } from "./cast.ts";
import { jobDir, loadJob, saveJob, type Job } from "./jobs.ts";
import { eras } from "./topics.ts";

export interface Part { who: string; how: string; text: string }
export interface Plan {
  title: string;
  scenes: { parts: Part[] }[];
  cast: CastMember[];
  facts: { claim: string; source: string }[];
  /** What the era looks like for this story: dress, houses, objects (for the costume sheet). */
  look: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          parts: {
            type: "array",
            items: {
              type: "object",
              properties: { who: { type: "string" }, how: { type: "string" }, text: { type: "string" } },
              required: ["who", "how", "text"],
            },
          },
        },
        required: ["parts"],
      },
    },
    cast: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          gender: { enum: ["male", "female"] },
          age: { enum: ["child", "young", "adult", "elder"] },
          role: { type: "string" },
          villain: { type: "boolean" },
        },
        required: ["name", "gender", "age", "role", "villain"],
      },
    },
    facts: {
      type: "array",
      items: { type: "object", properties: { claim: { type: "string" }, source: { type: "string" } }, required: ["claim", "source"] },
    },
    look: { type: "string" },
  },
  required: ["title", "scenes", "cast", "facts", "look"],
};

const SCENES_SCHEMA = {
  type: "object",
  properties: { scenes: { type: "array", items: { type: "object", properties: { index: { type: "number" }, parts: SCHEMA.properties.scenes.items.properties.parts }, required: ["index", "parts"] } } },
  required: ["scenes"],
};

const MOOD_WORDS = "vui vẻ, mừng rỡ, hớn hở, cười, buồn rầu, thở dài, khóc, lo lắng, sợ hãi, hoảng hốt, tức giận, quát, ngạc nhiên, sửng sốt, hô to, hét, dõng dạc, quyết tâm, tự hào, mệt";

const SYSTEM = `Bạn là biên kịch của kênh YouTube hoạt hình "Huy Kể Chuyện" (chủ kênh Nguyễn Đức Huy), kể truyện cổ tích, truyền thuyết và lịch sử Việt Nam cho trẻ em 4–10 tuổi, theo phong cách các kênh truyện cổ tích hàng triệu lượt xem: lời kể ấm áp, nhiều lời thoại sinh động.

Nguyên tắc bắt buộc:
- Trung thành với tư liệu được cung cấp. Không thêm tình tiết lớn trái với truyện gốc. Lời thoại được đặt thêm cho đúng tính cách nhân vật.
- Thuần Việt, đúng thời đại: chỉ nhắc đồ vật, trang phục, nhà cửa, phong tục có ở thời đó. Tránh những thứ trong danh sách "tránh".
- Giữ thuần phong mỹ tục: kính trọng vua, tổ tiên, cha mẹ; trang phục kín đáo. Đánh nhau hợp với trẻ em: không máu, không chết chóc chi tiết (giặc "ngã rạp", "tan tác bỏ chạy").
- Ngôn ngữ trong sáng, câu ngắn, dễ hiểu với trẻ nhỏ.
- Mỗi cảnh là một nơi, một khoảnh khắc vẽ được thành hoạt hình.`;

function prompt(job: Job, era: string, sources: Source[], notes: string[], previous?: string): string {
  return [
    `Viết kịch bản video "${job.topic}" (${job.kind ?? "truyện"}), thời đại: ${era}.`,
    job.summary ? `Tóm tắt: ${job.summary}` : "",
    "",
    "Cấu trúc:",
    "- 28–36 cảnh, tổng lời kể và lời thoại khoảng 1.100–1.400 chữ (5–7 phút đọc).",
    "- Cảnh 1: câu hỏi gợi tò mò cho trẻ, rồi \"Hôm nay, Huy Kể Chuyện sẽ kể cho các bạn nghe…\".",
    "- Kể đủ các chi tiết quen thuộc của truyện theo tư liệu; nếu có dấu tích, lễ hội, địa danh còn lại thì kể ở gần cuối.",
    "- Cảnh cuối: bài học nhẹ nhàng cho trẻ, và lời mời đăng ký kênh Huy Kể Chuyện.",
    "- Hầu hết các cảnh có 1–3 lời thoại; cả video khoảng 40–50 lời thoại.",
    "",
    "Mỗi cảnh là danh sách parts theo thứ tự đọc:",
    "- Lời kể: who = \"\", how = \"\", text = câu kể. Không dùng dấu hai chấm và dấu ngoặc kép trong lời kể.",
    "- Lời thoại: who = tên nhân vật (viết hoa chữ đầu, ngắn gọn, giữ nguyên một tên cho cả truyện, ví dụ \"Mẹ\", \"Vua Hùng\", \"Sơn Tinh\"), how = cách nói, text = lời nói không có ngoặc kép.",
    `- how chọn trong: ${MOOD_WORDS}. Gương mặt nhân vật được vẽ theo từ này.`,
    "",
    "cast: mọi nhân vật có lời thoại (không gồm người kể), theo thứ tự quan trọng; villain = true cho phe ác.",
    "facts: 6–12 chi tiết chính của truyện kèm tên bài tư liệu chứa chi tiết đó.",
    "look: mô tả ngắn trang phục từng nhân vật, nhà cửa, đồ vật đúng thời đại, để họa sĩ vẽ.",
    "",
    era,
    "",
    "Tư liệu:",
    ...sources.map((s) => `### ${s.title}\n${s.text}`),
    ...(previous ? ["", "Bản trước (viết lại theo góp ý, giữ những gì không bị góp ý):", previous] : []),
    ...(notes.length ? ["", "Góp ý cần sửa:", ...notes.map((n) => `- ${n}`)] : []),
  ].join("\n");
}

/** The era described for the writer: what to draw, what to avoid, customs. */
async function eraBrief(key?: string): Promise<string> {
  const all = await eras() as Record<string, { name: string; draw?: string[]; avoid?: string[]; customs?: string[] }>;
  const e = key ? all[key] : undefined;
  if (!e) return `Thời đại: ${key ?? "chưa rõ"} (chưa có trong thư viện; hãy mô tả đúng thời kỳ theo tư liệu).`;
  return [`Thời đại: ${e.name}`, e.draw ? `Có: ${e.draw.join("; ")}` : "", e.avoid ? `Tránh: ${e.avoid.join("; ")}` : "", e.customs ? `Phong tục: ${e.customs.join("; ")}` : ""].filter(Boolean).join("\n");
}

const clean = (s: string) => s.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();

/** The plan as script lines the voice builder reads (title first, one line per scene). */
export function toScript(plan: Plan): string {
  const lines = plan.scenes.map((sc) => sc.parts.map((p) => p.who.trim()
    ? `${clean(p.who)}${p.how.trim() ? ` (${clean(p.how)})` : ""}: "${clean(p.text)}"`
    : clean(p.text).replace(/:/g, ",")).join(" "));
  return [plan.title, ...lines].join("\n") + "\n";
}

/** What is wrong with a plan, in words the writer can fix. */
export function check(plan: Plan): string[] {
  const problems: string[] = [];
  const words = plan.scenes.flatMap((s) => s.parts).reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  if (words < 950) problems.push(`Kịch bản quá ngắn (${words} chữ): cần khoảng 1.100–1.400 chữ.`);
  if (words > 1650) problems.push(`Kịch bản quá dài (${words} chữ): cần khoảng 1.100–1.400 chữ.`);
  if (plan.scenes.length < 24 || plan.scenes.length > 40) problems.push(`Có ${plan.scenes.length} cảnh: cần 28–36 cảnh.`);
  const names = new Set(plan.cast.map((c) => c.name));
  plan.scenes.forEach((sc, i) => {
    const said = sc.parts.filter((p) => p.who.trim());
    for (const p of said) {
      if (!/^\p{Lu}[\p{L}\p{M} ]{0,29}$/u.test(clean(p.who))) problems.push(`Cảnh ${i + 1}: tên "${p.who}" phải là chữ, viết hoa chữ đầu, tối đa 30 ký tự.`);
      if (!names.has(p.who.trim())) problems.push(`Cảnh ${i + 1}: "${p.who}" có lời thoại nhưng không có trong cast.`);
      if (p.how.trim() && !moodOf(p.how)) problems.push(`Cảnh ${i + 1}: cách nói "${p.how}" không có trong danh sách cách nói.`);
    }
    const line = toScript({ ...plan, scenes: [sc] }).split("\n")[1]!;
    const parsed = splitSpeakers(line).filter((x) => x.who);
    if (parsed.length !== said.length) problems.push(`Cảnh ${i + 1}: đọc ra ${parsed.length} lời thoại thay vì ${said.length} (kiểm tra dấu hai chấm, ngoặc kép).`);
  });
  return [...new Set(problems)];
}

/**
 * Write (or rewrite, with the user's notes) the script of a job. The job stays where it is;
 * the caller moves it on (after the costume sheet). Returns the problems the checks left.
 */
export async function writeScript(slug: string, log: (s: string) => void = console.log): Promise<string[]> {
  let job = await loadJob(slug);
  const dir = jobDir(slug);
  {
    const topicFile = path.join(dir, "topic.json");
    const topic = (await exists(topicFile)) ? JSON.parse(await fs.readFile(topicFile, "utf8")) : {};
    const sources = await research(job.topic, { titles: topic.wiki });
    await fs.writeFile(path.join(dir, "sources.json"), JSON.stringify(sources.map(({ title, url }) => ({ title, url })), null, 2));
    log(`  research: ${sources.map((s) => s.title).join(", ")}`);
    const era = await eraBrief(job.era);
    const notes = job.notes.filter((n) => n.on === "script").map((n) => n.text);
    const prevFile = path.join(dir, "script.txt");
    const previous = job.status === "rewrite" && (await exists(prevFile)) ? await fs.readFile(prevFile, "utf8") : undefined;
    const ask = { job: slug, system: SYSTEM, schema: SCHEMA };
    let { data: plan, by } = await think<Plan>({ ...ask, step: previous ? "rewrite-script" : "write-script", model: "opus", effort: "medium", prompt: prompt(job, era, sources, previous ? notes : [], previous) }, log);
    let problems = check(plan);
    if (problems.length) {
      // Problems in a few scenes: only those scenes go back (a whole script costs ~30k tokens).
      const local = problems.every((p) => /^Cảnh \d+:/.test(p));
      const bad = [...new Set(problems.map((p) => Number(/^Cảnh (\d+):/.exec(p)?.[1]) - 1).filter((i) => i >= 0))];
      log(`  checks: ${problems.length} problem(s), revising ${local ? `scene(s) ${bad.map((i) => i + 1).join(", ")}` : "the script"}`);
      if (local) {
        const { data } = await think<{ scenes: { index: number; parts: Part[] }[] }>({ ...ask, step: "revise-scenes", model: "sonnet", schema: SCENES_SCHEMA, prompt: [
          "Sửa các cảnh dưới đây cho hết lỗi, giữ nguyên nội dung và giọng văn. Trả lại đúng các cảnh này (index giữ nguyên).",
          `Nhân vật được phép có lời thoại: ${plan.cast.map((c) => c.name).join(", ")}.`,
          `Cách nói chọn trong: ${MOOD_WORDS}.`,
          "Lỗi:", ...problems.map((p) => `- ${p}`), "",
          JSON.stringify(bad.map((i) => ({ index: i + 1, parts: plan.scenes[i]!.parts }))),
        ].join("\n") }, log);
        for (const sc of data.scenes) if (plan.scenes[sc.index - 1]) plan.scenes[sc.index - 1] = { parts: sc.parts };
      } else {
        ({ data: plan } = await think<Plan>({ ...ask, step: "revise-script", model: "sonnet", prompt: [
          "Sửa kịch bản (JSON) dưới đây cho hết các lỗi, giữ nguyên nội dung và giọng văn, trả lại toàn bộ kịch bản.",
          "Lỗi:", ...problems.map((p) => `- ${p}`), "", JSON.stringify(plan),
        ].join("\n") }, log));
      }
      problems = check(plan);
    }
    await fs.writeFile(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2));
    await fs.writeFile(path.join(dir, "script.txt"), toScript(plan));
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify({ engine: "vieneu", voice: "Minh Đức", speed: 1.1, imageGen: "off", onlineImages: false, era: job.era, profiles: ["16x9"], voices: castVoices(plan.cast, "Minh Đức") }, null, 2));
    job = await loadJob(slug);
    job.by = by;
    await saveJob(job);
    return problems;
  }
}
