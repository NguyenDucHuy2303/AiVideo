/**
 * The calendar of occasions (Vietnamese and world festivals, school days) for the topic
 * proposers and the pick: lunar dates converted for the year (Hồ Ngọc Đức's algorithm), and which
 * coming occasion a topic is for (by its words, no brain). No imports beyond types, so any
 * module can use it.
 */
import type { Job } from "./jobs.ts";

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

interface Occasion {
  vi: string; en: string; lang: "vi" | "en" | "both"; at: (year: number) => Date;
  /** For the review page: a short name, an icon, and the words that tell a topic is for it. */
  key: string; short: string; icon: string; words: RegExp;
}
const solar = (d: number, m: number) => (y: number) => new Date(y, m - 1, d);
const lunar = (d: number, m: number) => (y: number) => lunarToSolar(d, m, y);
// (no \b: JavaScript's word boundaries do not know Vietnamese letters)
export const OCCASIONS: Occasion[] = [
  { key: "tet", short: "Tết Nguyên Đán", icon: "🧧", words: /tết nguyên đán|tết cổ truyền|ngày tết|đón tết|ăn tết|chúc tết|lì xì|bánh chưng|mâm ngũ quả|hoa đào|lunar new year|\btet\b/i, vi: "Tết Nguyên Đán (Tết cổ truyền: bánh chưng, lì xì, chúc Tết)", en: "Lunar New Year (Tết)", lang: "both", at: lunar(1, 1) },
  { key: "nguyen-tieu", short: "Rằm tháng Giêng", icon: "🏮", words: /nguyên tiêu|rằm tháng giêng|lantern festival/i, vi: "Tết Nguyên Tiêu (Rằm tháng Giêng)", en: "Lantern Festival", lang: "vi", at: lunar(15, 1) },
  { key: "gio-to", short: "Giỗ Tổ Hùng Vương", icon: "🥁", words: /giỗ tổ|hùng vương|vua hùng|hung kings?/i, vi: "Giỗ Tổ Hùng Vương (mùng 10 tháng 3 âm lịch)", en: "Hung Kings' Festival (Vietnam)", lang: "vi", at: lunar(10, 3) },
  { key: "doan-ngo", short: "Tết Đoan Ngọ", icon: "🐛", words: /đoan ngọ|diệt sâu bọ|dragon boat/i, vi: "Tết Đoan Ngọ (diệt sâu bọ)", en: "Dragon Boat Festival", lang: "vi", at: lunar(5, 5) },
  { key: "vu-lan", short: "Lễ Vu Lan", icon: "🌹", words: /vu lan|báo hiếu|mục kiền liên/i, vi: "Lễ Vu Lan (báo hiếu cha mẹ)", en: "Vu Lan (thanks to parents)", lang: "vi", at: lunar(15, 7) },
  { key: "trung-thu", short: "Trung Thu", icon: "🥮", words: /trung thu|chị hằng|chú cuội|đèn ông sao|cung trăng|bánh nướng|mid-autumn|mooncake|moon festival/i, vi: "Tết Trung Thu (đèn ông sao, phá cỗ, chị Hằng, chú Cuội)", en: "Mid-Autumn Festival (lanterns, mooncakes, the Moon)", lang: "both", at: lunar(15, 8) },
  { key: "ong-tao", short: "Ông Công Ông Táo", icon: "🐟", words: /ông công|ông táo|táo quân|kitchen gods?/i, vi: "Ông Công Ông Táo (23 tháng Chạp)", en: "Kitchen Gods' Day", lang: "vi", at: lunar(23, 12) },
  { key: "new-year", short: "Năm mới", icon: "🎆", words: /năm mới dương lịch|giao thừa|pháo hoa|happy new year|new year'?s|fireworks/i, vi: "Năm mới dương lịch", en: "New Year", lang: "both", at: solar(1, 1) },
  { key: "women-83", short: "8/3", icon: "💐", words: /8\/3|8 tháng 3|quốc tế phụ nữ|women'?s day/i, vi: "Ngày Quốc tế Phụ nữ 8/3 (làm thiệp tặng mẹ, bà, cô)", en: "International Women's Day", lang: "vi", at: solar(8, 3) },
  { key: "earth-day", short: "Ngày Trái Đất", icon: "🌍", words: /ngày trái đất|earth day|bảo vệ môi trường|rác thải|recycl/i, vi: "Ngày Trái Đất (22/4)", en: "Earth Day", lang: "both", at: solar(22, 4) },
  { key: "children", short: "Quốc tế Thiếu nhi", icon: "🎈", words: /thiếu nhi|1\/6|children'?s day|nghỉ hè|kỳ nghỉ hè|summer (holiday|vacation)/i, vi: "Ngày Quốc tế Thiếu nhi 1/6 và nghỉ hè", en: "Children's Day (June 1) and the summer holidays", lang: "both", at: solar(1, 6) },
  { key: "national-day", short: "Quốc khánh", icon: "🇻🇳", words: /quốc khánh|2\/9|tuyên ngôn độc lập|national day/i, vi: "Quốc khánh 2/9", en: "Vietnam's National Day", lang: "vi", at: solar(2, 9) },
  { key: "school", short: "Khai giảng", icon: "🎒", words: /khai giảng|năm học mới|đồ dùng học tập|back to school|school supplies/i, vi: "Khai giảng năm học mới (5/9: đồ dùng học tập, trường lớp)", en: "Back to school", lang: "both", at: solar(5, 9) },
  { key: "vn-women", short: "20/10", icon: "💐", words: /20\/10|phụ nữ việt nam|women'?s day/i, vi: "Ngày Phụ nữ Việt Nam 20/10", en: "Vietnamese Women's Day", lang: "vi", at: solar(20, 10) },
  { key: "halloween", short: "Halloween", icon: "🎃", words: /halloween|pumpkin|bí ngô|trick or treat/i, vi: "Halloween", en: "Halloween (pumpkins, costumes; friendly, not scary)", lang: "en", at: solar(31, 10) },
  { key: "teachers", short: "Ngày Nhà giáo", icon: "🍎", words: /nhà giáo|thầy cô|thầy giáo|cô giáo|20\/11|teachers'? day/i, vi: "Ngày Nhà giáo Việt Nam 20/11", en: "Vietnamese Teachers' Day", lang: "vi", at: solar(20, 11) },
  { key: "christmas", short: "Giáng sinh", icon: "🎄", words: /giáng sinh|noel|ông già tuyết|tuần lộc|christmas|santa|reindeer|snowm[ae]n/i, vi: "Giáng sinh (Noel)", en: "Christmas (snow, gifts, winter)", lang: "both", at: solar(25, 12) },
];

/** An occasion coming up: its day (YYYY-MM-DD) and the days left. */
export interface Upcoming { key: string; short: string; icon: string; date: string; left: number }

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Every occasion from today to `days` ahead, soonest first. */
export function upcoming(now = new Date(), days = 35): Upcoming[] {
  const today = dayStart(now), out: Upcoming[] = [];
  for (const o of OCCASIONS) {
    for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
      let at: Date;
      try { at = dayStart(o.at(y)); } catch { continue; }
      const left = Math.round((at.getTime() - today.getTime()) / 86_400_000);
      if (left >= 0 && left <= days) out.push({ key: o.key, short: o.short, icon: o.icon, date: at.toLocaleDateString("sv"), left });
    }
  }
  return out.sort((a, b) => a.left - b.left);
}

/**
 * The occasion a topic is for, if one is coming (no brain: its words). Only occasions in the
 * next five weeks count, so a Hùng king story is "for Giỗ Tổ" only in the weeks before it.
 */
export function occasionOf(text: string, now = new Date(), days = 35): Upcoming | undefined {
  return upcoming(now, days).find((u) => OCCASIONS.find((o) => o.key === u.key)!.words.test(text));
}
export const jobOccasion = (job: Pick<Job, "topic" | "summary">, now = new Date()) => occasionOf(`${job.topic} ${job.summary ?? ""}`, now);

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
