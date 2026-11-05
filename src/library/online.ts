import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { LIBRARY_DIR, LibraryFile, tokens, type LibraryEntry } from "../storyboard/assets.ts";
import { acquireLock, exists, sha256, tmpPathFor, writeFileAtomic } from "../utils/fs.ts";
import { probe } from "../utils/probe.ts";
import { cleanTags } from "./tag.ts";

/** One search result, before download. */
export interface Candidate {
  source: "pexels" | "pixabay" | "openverse";
  /** Stable id within the source, e.g. "pexels:12345". */
  id: string;
  downloadUrl: string;
  pageUrl: string;
  width: number;
  height: number;
  /** Alt text or title. */
  description: string;
  tags: string[];
  author?: string;
  license: string;
  licenseUrl?: string;
}

export interface ImageSource {
  id: Candidate["source"];
  /** Results are relevant enough to use without a vision check. */
  trusted: boolean;
  search(query: string, opts: { orientation: "landscape" | "portrait" }): Promise<Candidate[]>;
}

const USER_AGENT = "WataVideoStudio/0.1 (local video generator)";
const SEARCH_TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
/** Smaller than this on the short side is useless even shown whole over a blurred fill. */
const MIN_SHORT_SIDE = 600;

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT, ...headers }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) {
    // Short plain-text bodies carry the reason, e.g. Pixabay's "[ERROR 400] Invalid or missing API key".
    const body = (await res.text().catch(() => "")).trim();
    const reason = body && body.length < 200 && !body.startsWith("<") ? `: ${body}` : "";
    const hint = res.status === 401 || res.status === 403 ? " (check the API key)" : res.status === 429 ? " (rate limit; try again later)" : "";
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}${reason}${hint}`);
  }
  return res.json();
}

const PexelsPhoto = z.object({
  id: z.number(),
  width: z.number(),
  height: z.number(),
  url: z.string(),
  photographer: z.string().optional(),
  alt: z.string().nullish(),
  src: z.object({ original: z.string() }),
});

/** Pexels: high-quality photos, free for commercial use. Needs a free API key. */
export function pexels(apiKey: string): ImageSource {
  return {
    id: "pexels",
    trusted: true,
    async search(query, { orientation }) {
      const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query, orientation, per_page: "15", size: "large" })}`;
      const data = (await getJson(url, { authorization: apiKey })) as { photos?: unknown[] };
      return (data.photos ?? []).flatMap((p) => {
        const photo = PexelsPhoto.safeParse(p);
        if (!photo.success) return [];
        const { id, width, height, url: pageUrl, photographer, alt, src } = photo.data;
        // Pexels serves resized copies through query parameters; 3000px is plenty for 1080p crops.
        const scale = Math.min(1, 3000 / Math.max(width, height));
        const downloadUrl = `${src.original}?${new URLSearchParams({ auto: "compress", cs: "tinysrgb", fit: "max", w: "3000", h: "3000" })}`;
        return [{
          source: "pexels" as const,
          id: `pexels:${id}`,
          downloadUrl,
          pageUrl,
          width: Math.round(width * scale),
          height: Math.round(height * scale),
          description: alt ?? "",
          tags: [],
          author: photographer,
          license: "Pexels License",
          licenseUrl: "https://www.pexels.com/license/",
        }];
      });
    },
  };
}

const PixabayHit = z.object({
  id: z.number(),
  pageURL: z.string(),
  tags: z.string().optional(),
  largeImageURL: z.string(),
  imageWidth: z.number(),
  imageHeight: z.number(),
  user: z.string().optional(),
});

/**
 * Pixabay: free photos for commercial use, attribution not required. Needs a free API key.
 * Without "full API access" the largest copy is 1280px, which the renderer shows whole over a
 * blurred fill where cropping would make it soft.
 */
export function pixabay(apiKey: string): ImageSource {
  return {
    id: "pixabay",
    trusted: true,
    async search(query, { orientation }) {
      const url = `https://pixabay.com/api/?${new URLSearchParams({
        key: apiKey,
        q: query.slice(0, 100),
        image_type: "photo",
        orientation: orientation === "landscape" ? "horizontal" : "vertical",
        safesearch: "true",
        per_page: "20",
      })}`;
      const data = (await getJson(url)) as { hits?: unknown[] };
      return (data.hits ?? []).flatMap((h) => {
        const hit = PixabayHit.safeParse(h);
        if (!hit.success) return [];
        const { id, pageURL, tags, largeImageURL, imageWidth, imageHeight, user } = hit.data;
        const scale = Math.min(1, 1280 / Math.max(imageWidth, imageHeight));
        const tagList = (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
        return [{
          source: "pixabay" as const,
          id: `pixabay:${id}`,
          downloadUrl: largeImageURL,
          pageUrl: pageURL,
          width: Math.round(imageWidth * scale),
          height: Math.round(imageHeight * scale),
          description: tagList.join(", "),
          tags: tagList,
          author: user,
          license: "Pixabay Content License",
          licenseUrl: "https://pixabay.com/service/license-summary/",
        }];
      });
    },
  };
}

const OpenverseImage = z.object({
  id: z.string(),
  url: z.string(),
  foreign_landing_url: z.string().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  title: z.string().nullish(),
  creator: z.string().nullish(),
  license: z.string(),
  license_version: z.string().nullish(),
  license_url: z.string().nullish(),
  tags: z.array(z.object({ name: z.string() })).nullish(),
});

/** Openverse: Creative Commons images, no key needed. Only licenses that allow commercial use and edits. */
export function openverse(): ImageSource {
  return {
    id: "openverse",
    trusted: false,
    async search(query) {
      const url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q: query, license_type: "commercial,modification", page_size: "20", mature: "false" })}`;
      const data = (await getJson(url)) as { results?: unknown[] };
      return (data.results ?? []).flatMap((r) => {
        const img = OpenverseImage.safeParse(r);
        if (!img.success || !img.data.width || !img.data.height) return [];
        const { id, url: downloadUrl, foreign_landing_url, width, height, title, creator, license, license_version, license_url, tags } = img.data;
        const name = license === "cc0" || license === "pdm" ? license.toUpperCase() : `CC ${license.toUpperCase()}${license_version ? ` ${license_version}` : ""}`;
        return [{
          source: "openverse" as const,
          id: `openverse:${id}`,
          downloadUrl,
          pageUrl: foreign_landing_url ?? downloadUrl,
          width: width!,
          height: height!,
          description: title ?? "",
          tags: (tags ?? []).map((t) => t.name),
          author: creator ?? undefined,
          license: name,
          licenseUrl: license_url ?? undefined,
        }];
      });
    },
  };
}

/**
 * Order candidates for a query: relevance (query words in its description and tags, and the
 * source's own ranking), then resolution and orientation. Candidates that share no word
 * with the query are dropped when the source's ranking isn't trustworthy on its own.
 */
export function rankCandidates(query: string, candidates: Candidate[], opts: { orientation: "landscape" | "portrait"; exclude: Set<string> }): Candidate[] {
  const wanted = new Set(tokens(query));
  const scored = candidates.flatMap((c, rank) => {
    if (opts.exclude.has(c.id) || opts.exclude.has(c.pageUrl) || Math.min(c.width, c.height) < MIN_SHORT_SIDE) return [];
    const words = new Set(tokens(`${c.description} ${c.tags.join(" ")}`));
    const hits = [...wanted].filter((w) => words.has(w)).length;
    if (hits === 0 && c.source !== "pexels") return [];
    const landscape = c.width >= c.height;
    const score =
      hits * 3 +
      (1 - rank / candidates.length) * (c.source === "pexels" ? 3 : 1) +
      Math.min(Math.min(c.width, c.height) / 1080, 1.5) +
      (landscape === (opts.orientation === "landscape") ? 1 : 0);
    return [{ c, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.c);
}

/** Shorter queries for when the full one finds nothing: the scriptwriter puts key words first. */
export function queryVariants(query: string): string[] {
  const words = query.split(/\s+/).filter(Boolean);
  const variants = [words.join(" ")];
  for (const n of [3, 2]) if (words.length > n) variants.push(words.slice(0, n).join(" "));
  return [...new Set(variants)];
}

async function download(c: Candidate, dir: string): Promise<{ file: string; width: number; height: number }> {
  const res = await fetch(c.downloadUrl, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const ext = type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : type.includes("jpeg") || type.includes("jpg") ? ".jpg" : "";
  if (!ext) throw new Error(`not an image (${type || "no content-type"})`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES) throw new Error("file too large");

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_DOWNLOAD_BYTES) throw new Error("file too large");
    chunks.push(Buffer.from(chunk));
  }
  const data = Buffer.concat(chunks);
  const file = path.join(dir, `${sha256(data).slice(0, 12)}${ext}`);
  if (!(await exists(file))) {
    const tmp = tmpPathFor(file);
    await fs.writeFile(tmp, data);
    // Downloaded bytes are only ever decoded as an image; make sure they are one.
    const v = (await probe(tmp).catch(() => undefined))?.streams.find((s) => s.codec_type === "video");
    if (!v?.width || !v.height) {
      await fs.rm(tmp, { force: true });
      throw new Error("downloaded file is not a readable image");
    }
    await fs.rename(tmp, file);
  }
  const v = (await probe(file)).streams.find((s) => s.codec_type === "video")!;
  return { file, width: v.width!, height: v.height! };
}

/** Search results are reused for a day: Pixabay requires it, and it makes rebuilds offline-safe. */
const SEARCH_CACHE_MS = 24 * 3600_000;

async function cachedSearch(source: ImageSource, query: string, orientation: "landscape" | "portrait"): Promise<Candidate[]> {
  const file = path.join(LIBRARY_DIR, source.id, "searches.json");
  const key = `${orientation}|${query}`;
  let cache: Record<string, { at: number; results: Candidate[] }> = {};
  try {
    cache = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    // No cache yet, or unreadable: start a new one.
  }
  const hit = cache[key];
  if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) return hit.results;
  const results = await source.search(query, { orientation });
  for (const [k, v] of Object.entries(cache)) if (Date.now() - v.at >= SEARCH_CACHE_MS) delete cache[k];
  cache[key] = { at: Date.now(), results };
  await writeFileAtomic(file, `${JSON.stringify(cache)}\n`);
  return results;
}

/** Read-modify-write of a library index; waits briefly if another build holds it. */
export async function appendToIndex(dir: string, entry: LibraryEntry): Promise<void> {
  let release: (() => Promise<void>) | undefined;
  for (let i = 0; !release; i++) {
    try {
      release = await acquireLock(path.join(dir, ".lock"));
    } catch (err) {
      if (i >= 50) throw err;
      await sleep(200);
    }
  }
  try {
    const indexFile = path.join(dir, "library.json");
    const images = (await exists(indexFile)) ? LibraryFile.parse(JSON.parse(await fs.readFile(indexFile, "utf8"))).images : [];
    const at = images.findIndex((img) => img.file === entry.file);
    if (at >= 0) images[at] = entry;
    else images.push(entry);
    await writeFileAtomic(indexFile, `${JSON.stringify({ images }, null, 2)}\n`);
  } finally {
    await release();
  }
}

/**
 * Verdicts by "<candidate id>|<query>|<criteria>", so a rejected photo is never downloaded or
 * judged again — until the acceptance criteria change (bump VERDICT_VERSION).
 */
const VERDICT_VERSION = 2;
type VerdictCache = Record<string, Verdict>;
/** `shows`: what the image shows; `note`: why it was accepted or rejected. */
export type Verdict = { ok: boolean; shows: string; note: string };

async function readVerdicts(file: string): Promise<VerdictCache> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as VerdictCache;
  } catch {
    return {};
  }
}

export type Judge = (file: string, query: string) => Promise<Verdict>;

/** Most candidates checked by the vision model for one scene (each check takes ~30–60 s on CPU). */
const MAX_JUDGED = 4;

function describe(c: Candidate, seen: string | undefined, query: string): string[] {
  const tags = cleanTags([...c.tags.flatMap(tokens), ...tokens(seen || c.description)]);
  return tags.length ? tags : cleanTags(tokens(query));
}

export interface Found {
  file: string;
  entry: LibraryEntry;
  candidate: Candidate;
}

/**
 * Find a photo for a scene online and keep it in assets/library/<source>/ with its license
 * and author, so the next video that needs the same thing finds it locally. Tries each
 * source in order and shorter queries before giving up; never throws for network reasons.
 */
export async function findOnline(
  query: string,
  sources: ImageSource[],
  opts: { orientation: "landscape" | "portrait"; exclude: Set<string>; log: (msg: string) => void; judge?: Judge },
): Promise<Found | undefined> {
  let judged = 0;
  for (const source of sources) {
    const dir = path.join(LIBRARY_DIR, source.id);
    const verdictFile = path.join(dir, "verdicts.json");
    const judge = source.trusted ? undefined : opts.judge;
    for (const q of queryVariants(query)) {
      let candidates: Candidate[];
      try {
        candidates = rankCandidates(q, await cachedSearch(source, q, opts.orientation), opts);
      } catch (err) {
        opts.log(`${source.id}: search "${q}" failed: ${(err as Error).message}`);
        break;
      }
      for (const c of candidates.slice(0, judge ? 6 : 3)) {
        const key = `${c.id}|${query}|v${VERDICT_VERSION}`;
        const cached = judge ? (await readVerdicts(verdictFile))[key] : undefined;
        if (cached && !cached.ok) continue;
        if (judge && !cached && judged >= MAX_JUDGED) break;
        try {
          await fs.mkdir(dir, { recursive: true });
          const { file, width, height } = await download(c, dir);
          let seen = cached?.shows;
          if (judge && !cached) {
            judged++;
            const verdict = await judge(file, query);
            seen = verdict.shows;
            opts.log(`${source.id}: ${c.id} ${verdict.ok ? "accepted" : "rejected"} for "${query}": ${verdict.shows} (${verdict.note})`);
            const verdicts = await readVerdicts(verdictFile);
            verdicts[key] = verdict;
            await writeFileAtomic(verdictFile, `${JSON.stringify(verdicts, null, 2)}\n`);
            if (!verdict.ok) {
              const indexFile = path.join(dir, "library.json");
              const inIndex = (await exists(indexFile)) && (await fs.readFile(indexFile, "utf8")).includes(`"${path.basename(file)}"`);
              if (!inIndex) await fs.rm(file, { force: true });
              continue;
            }
          }
          const entry: LibraryEntry = {
            file: path.basename(file),
            // Tags describe the photo, not the search: a beach photo found for "sleeping bed"
            // must not later match "bedroom". The query is only a last resort.
            tags: describe(c, seen, q),
            // What the vision model saw is a better description than a photo's title.
            description: seen || c.description || undefined,
            source: c.pageUrl,
            license: c.license,
            licenseUrl: c.licenseUrl,
            author: c.author,
            width,
            height,
            taggedBy: `${source.id} search "${q}"`,
          };
          await appendToIndex(dir, entry);
          return { file, entry, candidate: c };
        } catch (err) {
          opts.log(`${source.id}: download ${c.id} failed: ${(err as Error).message}`);
        }
      }
    }
  }
  return undefined;
}

/** Sources to use, best first. Pexels and Pixabay only when their key is configured. */
export function imageSources(): ImageSource[] {
  const pexelsKey = process.env.PEXELS_API_KEY?.trim();
  const pixabayKey = process.env.PIXABAY_API_KEY?.trim();
  return [...(pexelsKey ? [pexels(pexelsKey)] : []), ...(pixabayKey ? [pixabay(pixabayKey)] : []), openverse()];
}
