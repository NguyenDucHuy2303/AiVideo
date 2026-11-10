/**
 * Research from Wikipedia (free, no key; Vietnamese by default, English or Simple English for the
 * English channels): find the articles for a topic and keep
 * their plain text, trimmed of references and links. The brain reads these, not the web, so
 * a script costs only the text it needs. Cached per topic in studio/research/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { exists, slugify } from "../utils/fs.ts";
import { STUDIO_DIR } from "../brain/claude.ts";

/** vi (Vietnamese), en (English), simple (Simple English: written for children and learners). */
export type WikiLang = "vi" | "en" | "simple";
const host = (lang: WikiLang) => `https://${lang}.wikipedia.org`;
const AGENT = "WataVideoStudio/0.1 (local video tool)";
const DROP = /^(Tham khảo|Chú thích|Liên kết ngoài|Xem thêm|Đọc thêm|Ghi chú|Thư mục|Nguồn|References|Notes|External links|See also|Further reading|Bibliography|Sources|Citations|Footnotes|Other websites|Related pages)$/i;

export interface Source { title: string; url: string; text: string }

async function api(params: Record<string, string>, lang: WikiLang = "vi"): Promise<any> {
  const url = `${host(lang)}/w/api.php?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  // Too many requests (429) or a busy server: wait as asked (Retry-After), at most 4 tries.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) return res.json();
    if ((res.status !== 429 && res.status < 500) || attempt >= 3) throw new Error(`Wikipedia HTTP ${res.status}`);
    const wait = Math.min(60, Number(res.headers.get("retry-after")) || 5 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

/** The article's text without its reference sections, at most `max` characters. */
export async function article(title: string, max = 12_000, lang: WikiLang = "vi"): Promise<Source | undefined> {
  const d = await api({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title }, lang);
  const p = d.query?.pages?.[0];
  if (!p || p.missing || !p.extract) return undefined;
  const out: string[] = [];
  let skip = false;
  for (const line of (p.extract as string).split("\n")) {
    const h = line.match(/^=+\s*(.*?)\s*=+$/);
    if (h) { skip = DROP.test(h[1]!); if (!skip) out.push(`## ${h[1]}`); continue; }
    if (!skip && line.trim()) out.push(line.trim());
  }
  return { title: p.title, url: `${host(lang)}/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`, text: out.join("\n").slice(0, max) };
}

/** Article titles for a search. */
export async function search(query: string, limit = 5, lang: WikiLang = "vi"): Promise<string[]> {
  const d = await api({ action: "query", list: "search", srsearch: query, srlimit: String(limit) }, lang);
  return (d.query?.search ?? []).map((s: { title: string }) => s.title);
}

/**
 * Sources for a topic: the named articles (when given) plus the best search hits, up to
 * `count` articles and about `budget` characters in all.
 */
export async function research(topic: string, opts: { titles?: string[]; count?: number; budget?: number; lang?: WikiLang; query?: string; skip?: string[] } = {}): Promise<Source[]> {
  const lang = opts.lang ?? "vi";
  const file = path.join(STUDIO_DIR, "research", `${slugify(topic)}${lang === "vi" ? "" : `.${lang}`}.json`);
  if (await exists(file)) return JSON.parse(await fs.readFile(file, "utf8"));
  const count = opts.count ?? 3, budget = opts.budget ?? 24_000;
  // The search may use other words than the topic (a question's key words); `skip`: titles already read elsewhere.
  const titles = [...new Set([...(opts.titles ?? []), ...(await search(opts.query ?? topic, 6, lang))])].filter((t) => !opts.skip?.includes(t));
  const sources: Source[] = [];
  let used = 0;
  for (const t of titles) {
    if (sources.length >= count || used >= budget) break;
    const s = await article(t, Math.min(12_000, budget - used), lang);
    if (!s || sources.some((x) => x.title === s.title) || s.text.length < 400) continue;
    sources.push(s);
    used += s.text.length;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(sources, null, 2));
  return sources;
}
