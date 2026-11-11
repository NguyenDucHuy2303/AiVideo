/**
 * What is in season and what children watch, for the topic proposers (hints, never orders):
 *
 *   1. the calendar: Vietnamese and world festivals and school days, the lunar ones converted
 *      for the year (Hồ Ngọc Đức's algorithm), each three weeks ahead;
 *   2. YouTube: the most watched recent videos for each content line's search words (public data,
 *      an API key in studio/secrets/youtube_api_key.txt; search.list has its own 100-a-day bucket),
 *      once a day, cached in studio/trends.json;
 *   3. our own videos: their views (videos.list, 1 unit per 50 videos), the best and the weakest
 *      of each line, once a day.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { STUDIO_DIR } from "../brain/claude.ts";
import { exists } from "../utils/fs.ts";
import { loadJob, saveJob, type Job } from "./jobs.ts";
import { lineOf, type Line } from "./pick.ts";
import { SECRETS } from "./publish.ts";

// ── Lunar calendar (Vietnamese, UTC+7), after Hồ Ngọc Đức ───────────────────────────────────

const INT = Math.floor;
function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}
function jdToDate(jd: number): [number, number, number] {
  let b: number, c: number;
  if (jd > 2299160) { const a = jd + 32044; b = INT((4 * a + 3) / 146097); c = a - INT((b * 146097) / 4); }
  else { b = 0; c = jd + 32082; }
  const d = INT((4 * c + 3) / 1461), e = c - INT((1461 * d) / 4), m = INT((5 * e + 2) / 153);
  return [e - INT((153 * m + 2) / 5) + 1, m + 3 - 12 * INT(m / 10), b * 100 + d - 4800 + INT(m / 10)];
}
function newMoon(k: number): number {
  const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = Math.PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Jd1 + C1 - deltat;
}
const newMoonDay = (k: number, tz: number) => INT(newMoon(k) + 0.5 + tz / 24);
function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - Math.PI * 2 * INT(L / (Math.PI * 2));
  return L;
}
const sunLong = (dayNumber: number, tz: number) => INT((sunLongitude(dayNumber - 0.5 - tz / 24) / Math.PI) * 6);
function lunarMonth11(yy: number, tz: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021, k = INT(off / 29.530588853);
  let nm = newMoonDay(k, tz);
  if (sunLong(nm, tz) >= 9) nm = newMoonDay(k - 1, tz);
  return nm;
}
function leapMonthOffset(a11: number, tz: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last: number, i = 1, arc = sunLong(newMoonDay(k + i, tz), tz);
  do { last = arc; i++; arc = sunLong(newMoonDay(k + i, tz), tz); } while (arc !== last && i < 14);
  return i - 1;
}
/** A lunar date (day, month, lunar year, leap month?) as a solar Date. */
export function lunarToSolar(ld: number, lm: number, ly: number, leap = false, tz = 7): Date {
  let a11: number, b11: number;
  if (lm < 11) { a11 = lunarMonth11(ly - 1, tz); b11 = lunarMonth11(ly, tz); }
  else { a11 = lunarMonth11(ly, tz); b11 = lunarMonth11(ly + 1, tz); }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lm - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = leapMonthOffset(a11, tz);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (leap && lm !== leapMonth) throw new Error("not a leap month");
    if (leap || off >= leapOff) off += 1;
  }
  const [d, m, y] = jdToDate(newMoonDay(k + off, tz) + ld - 1);
  return new Date(y, m - 1, d);
}

// ── 1. The calendar ─────────────────────────────────────────────────────────────────────────

interface Occasion { vi: string; en: string; lang: "vi" | "en" | "both"; at: (year: number) => Date }
const solar = (d: number, m: number) => (y: number) => new Date(y, m - 1, d);
const lunar = (d: number, m: number) => (y: number) => lunarToSolar(d, m, y);
export const OCCASIONS: Occasion[] = [
  { vi: "Tết Nguyên Đán (Tết cổ truyền: bánh chưng, lì xì, chúc Tết)", en: "Lunar New Year (Tết)", lang: "both", at: lunar(1, 1) },
  { vi: "Tết Nguyên Tiêu (Rằm tháng Giêng)", en: "Lantern Festival", lang: "vi", at: lunar(15, 1) },
  { vi: "Giỗ Tổ Hùng Vương (mùng 10 tháng 3 âm lịch)", en: "Hung Kings' Festival (Vietnam)", lang: "vi", at: lunar(10, 3) },
  { vi: "Tết Đoan Ngọ (diệt sâu bọ)", en: "Dragon Boat Festival", lang: "vi", at: lunar(5, 5) },
  { vi: "Lễ Vu Lan (báo hiếu cha mẹ)", en: "Vu Lan (thanks to parents)", lang: "vi", at: lunar(15, 7) },
  { vi: "Tết Trung Thu (đèn ông sao, phá cỗ, chị Hằng, chú Cuội)", en: "Mid-Autumn Festival (lanterns, mooncakes, the Moon)", lang: "both", at: lunar(15, 8) },
  { vi: "Ông Công Ông Táo (23 tháng Chạp)", en: "Kitchen Gods' Day", lang: "vi", at: lunar(23, 12) },
  { vi: "Năm mới dương lịch", en: "New Year", lang: "both", at: solar(1, 1) },
  { vi: "Ngày Quốc tế Phụ nữ 8/3 (làm thiệp tặng mẹ, bà, cô)", en: "International Women's Day", lang: "vi", at: solar(8, 3) },
  { vi: "Ngày Trái Đất (22/4)", en: "Earth Day", lang: "both", at: solar(22, 4) },
  { vi: "Ngày Quốc tế Thiếu nhi 1/6 và nghỉ hè", en: "Children's Day (June 1) and the summer holidays", lang: "both", at: solar(1, 6) },
  { vi: "Quốc khánh 2/9", en: "Vietnam's National Day", lang: "vi", at: solar(2, 9) },
  { vi: "Khai giảng năm học mới (5/9: đồ dùng học tập, trường lớp)", en: "Back to school", lang: "both", at: solar(5, 9) },
  { vi: "Ngày Phụ nữ Việt Nam 20/10", en: "Vietnamese Women's Day", lang: "vi", at: solar(20, 10) },
  { vi: "Halloween", en: "Halloween (pumpkins, costumes; friendly, not scary)", lang: "en", at: solar(31, 10) },
  { vi: "Ngày Nhà giáo Việt Nam 20/11", en: "Vietnamese Teachers' Day", lang: "vi", at: solar(20, 11) },
  { vi: "Giáng sinh (Noel)", en: "Christmas (snow, gifts, winter)", lang: "both", at: solar(25, 12) },
];

/** Occasions in the next `days` (default three weeks), in the line's language. */
export function seasonal(lang: "vi" | "en", now = new Date(), days = 21): string[] {
  const out: string[] = [], end = now.getTime() + days * 86_400_000;
  for (const o of OCCASIONS) {
    if (o.lang !== "both" && o.lang !== lang) continue;
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      let at: Date;
      try { at = o.at(y); } catch { continue; }
      if (at.getTime() >= now.getTime() - 86_400_000 && at.getTime() <= end) {
        const left = Math.max(0, Math.round((at.getTime() - now.getTime()) / 86_400_000));
        out.push(lang === "vi" ? `${o.vi}: còn ${left} ngày (${at.toLocaleDateString("vi")})` : `${o.en}: in ${left} days (${at.toLocaleDateString("en-GB")})`);
      }
    }
  }
  return out;
}

// ── 2 and 3. YouTube (public data, an API key) ──────────────────────────────────────────────

const KEY = path.join(SECRETS, "youtube_api_key.txt");
const CACHE = path.join(STUDIO_DIR, "trends.json");
export const hasApiKey = () => exists(KEY);
const apiKey = async () => (await fsp.readFile(KEY, "utf8")).trim();

/** What each line searches YouTube for (its kind of video), and where. */
export const SEARCH: Record<string, { q: string; region: string; lang: string }> = {
  "ask-huy": { q: "why for kids explained cartoon", region: "US", lang: "en" },
  "hoi-huy": { q: "vì sao cho bé khoa học hoạt hình", region: "VN", lang: "vi" },
  "ngu-ngon": { q: "truyện ngụ ngôn hoạt hình cho bé", region: "VN", lang: "vi" },
  "ask-huy-shorts": { q: "did you know facts for kids", region: "US", lang: "en" },
  "hoc-tieng-anh": { q: "học tiếng anh cho bé từ vựng", region: "VN", lang: "vi" },
  "hoi-huy-shorts": { q: "bạn có biết sự thật thú vị cho bé", region: "VN", lang: "vi" },
  "huy-ke-chuyen": { q: "truyện cổ tích việt nam hoạt hình", region: "VN", lang: "vi" },
};

interface Cache { day?: string; popular?: Record<string, { title: string; views: number }[]>; statsDay?: string }
async function cache(): Promise<Cache> { return (await exists(CACHE)) ? JSON.parse(await fsp.readFile(CACHE, "utf8")) : {}; }

/** Once a day: the most watched videos of the last 30 days for each line's search words. */
export async function refreshPopular(lines: Line[], log: (s: string) => void = () => {}): Promise<void> {
  const c = await cache(), today = new Date().toLocaleDateString("sv");
  if (c.day === today || !(await hasApiKey())) return;
  const key = await apiKey(), since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  c.popular = {};
  for (const l of lines) {
    const s = SEARCH[l.id];
    if (!s) continue;
    const q = new URLSearchParams({ part: "snippet", type: "video", order: "viewCount", publishedAfter: since, maxResults: "15", q: s.q, regionCode: s.region, relevanceLanguage: s.lang, safeSearch: "strict", key });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${q}`);
    if (!res.ok) { log(`  trends ${l.id}: YouTube ${res.status}`); continue; }
    const items = ((await res.json()) as { items?: { id: { videoId: string }; snippet: { title: string } }[] }).items ?? [];
    const ids = items.map((i) => i.id.videoId).join(",");
    const stats = ids ? (((await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${key}`)).json()) as { items?: { id: string; statistics: { viewCount?: string } }[] }).items ?? []) : [];
    c.popular[l.id] = items.map((i) => ({ title: i.snippet.title.replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&"), views: Number(stats.find((x) => x.id === i.id.videoId)?.statistics.viewCount ?? 0) })).sort((a, b) => b.views - a.views).slice(0, 10);
  }
  c.day = today;
  await fsp.writeFile(CACHE, JSON.stringify(c, null, 2));
  log(`  trends: ${Object.keys(c.popular).length} lines refreshed`);
}

/** Once a day: the views of our published videos (kept in job.stats). */
export async function refreshOwnStats(jobs: Job[]): Promise<void> {
  const c = await cache(), today = new Date().toLocaleDateString("sv");
  if (c.statsDay === today || !(await hasApiKey())) return;
  const key = await apiKey();
  const byVideo = new Map<string, string>();
  for (const j of jobs) for (const p of [j.published?.long, ...(j.published?.shorts ?? [])]) if (p && new Date(p.publishAt) < new Date()) byVideo.set(p.videoId, j.slug);
  const ids = [...byVideo.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.slice(i, i + 50).join(",")}&key=${key}`);
    if (!res.ok) continue;
    for (const it of ((await res.json()) as { items?: { id: string; statistics: { viewCount?: string; likeCount?: string } }[] }).items ?? []) {
      const job = await loadJob(byVideo.get(it.id)!);
      job.stats = { ...(job.stats ?? {}), [it.id]: { views: Number(it.statistics.viewCount ?? 0), likes: Number(it.statistics.likeCount ?? 0), at: new Date().toISOString() } };
      await saveJob(job);
    }
  }
  c.statsDay = today;
  await fsp.writeFile(CACHE, JSON.stringify(c, null, 2));
}

/** Everything a line's proposer should know now: the season, what is watched, how ours do. */
export async function hintsFor(line: Line, lang: "vi" | "en", jobs: Job[], lines: Line[]): Promise<string[]> {
  const hints = seasonal(lang);
  const pop = (await cache()).popular?.[line.id];
  if (pop?.length) hints.push(`${lang === "vi" ? "Video được xem nhiều trên YouTube 30 ngày qua (cùng loại)" : "Most watched similar YouTube videos of the last 30 days"}: ${pop.slice(0, 6).map((p) => `"${p.title}" (${p.views.toLocaleString("en")})`).join("; ")}`);
  const ours = jobs.filter((j) => lineOf(j, lines) === line && j.stats).map((j) => ({ topic: j.topic, views: Object.values(j.stats!).reduce((n, s) => n + s.views, 0) })).sort((a, b) => b.views - a.views);
  if (ours.length >= 3) hints.push(`${lang === "vi" ? "Video của mình xem nhiều nhất" : "Our most watched"}: ${ours.slice(0, 3).map((o) => `${o.topic} (${o.views})`).join("; ")}; ${lang === "vi" ? "ít nhất" : "least watched"}: ${ours.slice(-2).map((o) => `${o.topic} (${o.views})`).join("; ")}`);
  return hints;
}
