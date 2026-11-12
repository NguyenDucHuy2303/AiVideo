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

// 1. The calendar: occasions.ts.
export { lunarToSolar, OCCASIONS, occasionOf, jobOccasion, seasonal, upcoming, type Upcoming } from "./occasions.ts";
import { seasonal } from "./occasions.ts";

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
