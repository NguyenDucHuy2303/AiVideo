/**
 * Research from Vietnamese Wikipedia (free, no key): find the articles for a topic and keep
 * their plain text, trimmed of references and links. The brain reads these, not the web, so
 * a script costs only the text it needs. Cached per topic in studio/research/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists, slugify } from "../utils/fs.ts";
import { STUDIO_DIR } from "../brain/claude.ts";

const API = "https://vi.wikipedia.org/w/api.php";
const AGENT = "WataVideoStudio/0.1 (local video tool)";
const DROP = /^(Tham khảo|Chú thích|Liên kết ngoài|Xem thêm|Đọc thêm|Ghi chú|Thư mục|Nguồn)$/i;

export interface Source { title: string; url: string; text: string }

async function api(params: Record<string, string>): Promise<any> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return res.json();
}

/** The article's text without its reference sections, at most `max` characters. */
export async function article(title: string, max = 12_000): Promise<Source | undefined> {
  const d = await api({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title });
  const p = d.query?.pages?.[0];
  if (!p || p.missing || !p.extract) return undefined;
  const out: string[] = [];
  let skip = false;
  for (const line of (p.extract as string).split("\n")) {
    const h = line.match(/^=+\s*(.*?)\s*=+$/);
    if (h) { skip = DROP.test(h[1]!); if (!skip) out.push(`## ${h[1]}`); continue; }
    if (!skip && line.trim()) out.push(line.trim());
  }
  return { title: p.title, url: `https://vi.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`, text: out.join("\n").slice(0, max) };
}

/** Article titles for a search. */
export async function search(query: string, limit = 5): Promise<string[]> {
  const d = await api({ action: "query", list: "search", srsearch: query, srlimit: String(limit) });
  return (d.query?.search ?? []).map((s: { title: string }) => s.title);
}

/**
 * Sources for a topic: the named articles (when given) plus the best search hits, up to
 * `count` articles and about `budget` characters in all.
 */
export async function research(topic: string, opts: { titles?: string[]; count?: number; budget?: number } = {}): Promise<Source[]> {
  const file = path.join(STUDIO_DIR, "research", `${slugify(topic)}.json`);
  if (await exists(file)) return JSON.parse(await fs.readFile(file, "utf8"));
  const count = opts.count ?? 3, budget = opts.budget ?? 24_000;
  const titles = [...new Set([...(opts.titles ?? []), ...(await search(topic, 6))])];
  const sources: Source[] = [];
  let used = 0;
  for (const t of titles) {
    if (sources.length >= count || used >= budget) break;
    const s = await article(t, Math.min(12_000, budget - used));
    if (!s || sources.some((x) => x.title === s.title) || s.text.length < 400) continue;
    sources.push(s);
    used += s.text.length;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(sources, null, 2));
  return sources;
}
