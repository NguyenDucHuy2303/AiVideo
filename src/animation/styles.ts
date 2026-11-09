/**
 * Drawing styles (library/styles.json): how the backdrops are painted and how the vector
 * cartoon is dressed (runtime/style.js). A film's style is project.json "style"; every scene
 * of the project takes it (loadScene), unless the scene names its own.
 */
import { readFileSync } from "node:fs";

export interface Style { name: string; for: string; backdrop: string; look: Record<string, unknown>; sky?: Record<string, string>; character?: string }

export const DEFAULT_STYLE = "hien_dai";

let cache: Record<string, Style> | undefined;
export function styles(): Record<string, Style> {
  return (cache ??= JSON.parse(readFileSync(new URL("./library/styles.json", import.meta.url), "utf8")));
}
export const styleKeys = () => Object.keys(styles());
export const styleOf = (key?: string): Style => styles()[key ?? DEFAULT_STYLE] ?? styles()[DEFAULT_STYLE]!;

/** The list for the brain: key, name, what it suits. */
export const styleMenu = () => Object.entries(styles()).map(([k, s]) => `- ${k}: ${s.name} (${s.for})`).join("\n");

const DYNASTIES = new Set(["ly", "ly_tran", "tran", "le_so", "ngo_dinh_le", "tay_son", "nguyen", "le_trung_hung", "bac_thuoc"]);
const GENTLE = /trương chi|chử đồng tử|mị châu|trầu cau|vọng phu|tô thị|chim quyên|ngưu lang|hòn vọng/i;

/** A style from the topic alone (no brain, no tokens): for jobs written before styles existed. */
export function suggestStyle(job: { topic: string; kind?: string; era?: string }): { style: string; why: string } {
  if (GENTLE.test(job.topic)) return { style: "lua", why: "truyện buồn, thơ mộng: tranh lụa êm và dịu" };
  if (job.kind === "ngụ ngôn" || /thú|con vật|rùa|thỏ|cáo|voi|hổ|cóc/i.test(job.kind ?? "")) return { style: "cat_giay", why: "ngụ ngôn có con vật: cắt giấy vui mắt, rõ hình" };
  if (job.kind === "lịch sử" && DYNASTIES.has(job.era ?? "")) return { style: "son_mai", why: "lịch sử triều đại: sơn mài trang nghiêm, ánh vàng cung đình" };
  if (job.kind === "giáo dục") return { style: "sap_mau", why: "bài học cho bé: sáp màu gần gũi như tranh bé vẽ" };
  return { style: "dong_ho", why: "truyện dân gian Việt: tranh Đông Hồ đúng chất làng quê" };
}
