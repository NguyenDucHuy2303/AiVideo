/**
 * Publishing to YouTube (Data API v3, no library: plain fetch). Each channel has a mode:
 *   off     nothing is published
 *   manual  (the default) every video the user approved ("done") is laid out in a folder of
 *           ~/Videos/Wata/<channel>/ — the film, its thumbnail, and a text with the title,
 *           description, tags, settings and a publishing time — for the user to upload in
 *           YouTube Studio; then the user pastes the link back (markPublished)
 *   auto    the studio uploads it as private with a publish time (publishAt): YouTube makes it
 *           public at that hour. Videos uploaded through an API project that has not passed
 *           YouTube's audit stay locked private: after the hour the studio checks, and if the
 *           video is still private it turns the channel back to manual and lays the locked
 *           videos out to be uploaded by hand.
 * The film first, then its Shorts (linking to it) and its English version (English channel).
 *
 * Two channels (since 2026-11-12): "huy-ke-chuyen" is the storytelling channel (the stories, and
 * their English versions as the series Huy Tells Tales at their own hour, the Hỏi Huy questions,
 * the English lessons, "Bạn có biết?" Shorts), "ask-huy" the English question channel (the Ask
 * Huy questions, "Did you know?" Shorts): no stories there. Each video goes into a playlist of
 * its series. The older channel keys (hoi-huy, huy-tells-tales) are read as the channel they
 * were merged into.
 * Secrets stay in studio/secrets/
 * (git-ignored): client_secret.json (an OAuth "Desktop app" client from Google Cloud) and
 * youtube-<channel>.json (each channel's refresh token).
 *
 * Quota (2026): uploads have their own bucket of 100 a day; a thumbnail costs 50 of the 10,000
 * daily units shared by everything else.
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { STUDIO_DIR } from "../brain/claude.ts";
import { exists } from "../utils/fs.ts";
import { jobDir, loadJob, saveJob, type Job } from "./jobs.ts";
import { relevantSources, storyCopy } from "./copy.ts";
import { lineOf, type Line } from "./pick.ts";
import { PLATFORM_NAME, platformsOf, SETTINGS_VI, shortHooks, socialText, type Platform } from "./social.ts";

export const SECRETS = path.join(STUDIO_DIR, "secrets");
const CLIENT = path.join(SECRETS, "client_secret.json");
// (youtube: playlists — find, create, add to; youtube.upload alone cannot)
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube"];

export interface ChannelCfg {
  name: string;
  lang: "vi" | "en";
  /** Local times for full videos (one a day each) and for Shorts. */
  long: string[];
  shorts: string[];
  /** Times for the English versions of the stories (Huy Tells Tales), apart from the
   *  Vietnamese films (so they do not take their days); none: the long times. */
  english?: string[];
  mode: Mode;
  /** Why the studio turned the channel from auto back to manual (a locked video). */
  locked?: string;
}
export type Mode = "off" | "manual" | "auto";
/** Settings written before the modes had "enabled": on meant auto, off now means manual. */
export const modeOf = (cfg?: Partial<ChannelCfg> & { enabled?: boolean }): Mode => cfg?.mode ?? (cfg?.enabled ? "auto" : "manual");
export type PublishSettings = Record<string, ChannelCfg>;
export const PUBLISH_DEFAULTS: PublishSettings = {
  // (four lines a day in Vietnamese: stories, fables, questions, lessons; each with Shorts)
  "huy-ke-chuyen": { name: "Huy Kể Chuyện", lang: "vi", long: ["08:00", "16:00", "18:00", "19:30"], shorts: ["07:30", "10:30", "12:30", "15:30", "17:30", "20:30"], english: ["08:30"], mode: "manual" },
  "ask-huy": { name: "Ask Huy", lang: "en", long: ["17:00", "19:00"], shorts: ["09:00", "12:00", "15:00", "19:30"], mode: "manual" },
};
/** Channels merged into another (2026-11-12). */
export const MERGED: Record<string, string> = { "hoi-huy": "huy-ke-chuyen", "huy-tells-tales": "huy-ke-chuyen" };

export interface Published {
  videoId: string; url: string; publishAt: string; channel: string; at: string;
  /** Uploaded by the user from an exported folder (not by the studio). */
  manual?: boolean;
  /** Seen public after its hour (auto uploads), and when it was last looked at. */
  checked?: string; lastCheck?: string;
}
/** A video laid out for upload by hand: where, and the time it was given. */
export interface Exported { dir: string; publishAt: string; channel: string; at: string }
export type What = "long" | "short" | "en";

/** Which channel a job's video goes to. */
export function channelOf(job: Job, what: What, lines: Line[]): string {
  if (what === "en") return "huy-ke-chuyen"; // (Huy Tells Tales: a story stays on the story channel)
  const line = lineOf(job, lines), ch = line?.channel ?? line?.id ?? "huy-ke-chuyen";
  return MERGED[ch] ?? ch;
}

const isStory = (job: Job) => !["qa", "qa-vi", "fact", "fact-vi", "lesson"].includes(job.kind ?? "");
/** YouTube category of a video: stories 1 (Film & Animation), questions and lessons 27 (Education). */
export const categoryOf = (job: Job) => (isStory(job) ? "1" : "27");
/** The playlist (series) a video goes into, on its channel; none for a film's Shorts. */
export function seriesOf(job: Job, what: What): string | undefined {
  if (what === "en") return "Huy Tells Tales: Vietnamese Folk Tales";
  switch (job.kind) {
    case "qa": return what === "short" ? undefined : "Ask Huy: Big Questions";
    case "qa-vi": return what === "short" ? undefined : "Hỏi Huy";
    case "fact": return "Did You Know? (Shorts)";
    case "fact-vi": return "Bạn có biết? (Shorts)";
    case "lesson": return what === "short" ? undefined : "Học tiếng Anh cùng Huy";
  }
  if (what === "short") return undefined;
  return { "truyền thuyết": "Truyền thuyết Việt Nam", "lịch sử": "Lịch sử Việt Nam cho bé", "ngụ ngôn": "Truyện ngụ ngôn" }[job.kind ?? ""] ?? "Truyện cổ tích Việt Nam";
}

// ── OAuth (installed app, loopback redirect, PKCE) ──────────────────────────────────────────

interface Client { client_id: string; client_secret: string }
interface Token { refresh_token: string; access_token?: string; expiry?: number; channelId?: string; channelTitle?: string; playlists?: Record<string, string> }

async function client(): Promise<Client | undefined> {
  if (!(await exists(CLIENT))) return undefined;
  const raw = JSON.parse(await fsp.readFile(CLIENT, "utf8"));
  return raw.installed ?? raw.web ?? raw;
}
export const hasClient = async () => !!(await client());
const tokenFile = (channel: string) => path.join(SECRETS, `youtube-${channel}.json`);
export async function token(channel: string): Promise<Token | undefined> {
  return (await exists(tokenFile(channel))) ? JSON.parse(await fsp.readFile(tokenFile(channel), "utf8")) : undefined;
}
async function saveToken(channel: string, t: Token): Promise<void> {
  await fsp.mkdir(SECRETS, { recursive: true, mode: 0o700 });
  await fsp.writeFile(tokenFile(channel), JSON.stringify(t, null, 2), { mode: 0o600 });
}

const pending = new Map<string, { channel: string; verifier: string; redirect: string }>();
const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The Google sign-in page for connecting a channel (the user picks the channel there). */
export async function authUrl(channel: string, redirect: string): Promise<string> {
  const c = await client();
  if (!c) throw new Error("chưa có studio/secrets/client_secret.json (xem README: Đăng YouTube → Kết nối để tự đăng)");
  const state = b64url(randomBytes(16)), verifier = b64url(randomBytes(32));
  pending.set(state, { channel, verifier, redirect });
  const q = new URLSearchParams({
    client_id: c.client_id, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent select_account",
    state, code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Google sent the user back: keep the channel's refresh token. Returns the channel's title. */
export async function finishAuth(state: string, code: string): Promise<{ channel: string; title: string }> {
  const p = pending.get(state), c = await client();
  if (!p || !c) throw new Error("phiên kết nối đã hết hạn, hãy bấm Kết nối lại");
  pending.delete(state);
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, code, code_verifier: p.verifier, grant_type: "authorization_code", redirect_uri: p.redirect }) });
  const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string };
  if (!res.ok || !t.refresh_token) throw new Error(`Google: ${t.error_description ?? t.error ?? "không nhận được refresh token"}`);
  const tok: Token = { refresh_token: t.refresh_token, access_token: t.access_token, expiry: Date.now() + (t.expires_in - 60) * 1000 };
  const me = await api("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", tok.access_token!) as { items?: { id: string; snippet: { title: string } }[] };
  tok.channelId = me.items?.[0]?.id;
  tok.channelTitle = me.items?.[0]?.snippet.title ?? "(không rõ)";
  await saveToken(p.channel, tok);
  return { channel: p.channel, title: tok.channelTitle };
}

async function accessToken(channel: string): Promise<string> {
  const t = await token(channel), c = await client();
  if (!t || !c) throw new Error(`kênh ${channel} chưa được kết nối`);
  if (t.access_token && t.expiry && t.expiry > Date.now()) return t.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: t.refresh_token, grant_type: "refresh_token" }) });
  const r = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !r.access_token) throw new Error(`Google không cấp lại quyền cho ${channel}: ${r.error_description ?? r.error} (bấm Kết nối lại)`);
  await saveToken(channel, { ...t, access_token: r.access_token, expiry: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 });
  return r.access_token;
}

async function api(url: string, access: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${access}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// ── What a video says about itself ──────────────────────────────────────────────────────────

export interface Meta { title: string; description: string; tags: string[]; categoryId: string; lang: string; playlist?: string }
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
/** Tags within YouTube's 500 characters. */
function tagsOf(list: string[]): string[] {
  const out: string[] = [];
  let n = 0;
  for (const t of [...new Set(list.map((x) => x.replace(/[<>,"]/g, "").trim()).filter(Boolean))]) {
    if (n + t.length + 3 > 480) break;
    out.push(t); n += t.length + 3;
  }
  return out;
}

/** Title, description and tags from the job's plan, sources and summary (no brain needed). */
/** `hook`: a Short's best line (social.ts shortHooks): its title, so a topic's Shorts are not all named alike. */
export async function metaOf(job: Job, what: What, cfg: ChannelCfg, longUrl?: string, hook?: string): Promise<Meta> {
  return { ...(await metaText(job, what, cfg, longUrl, hook)), categoryId: categoryOf(job), playlist: seriesOf(job, what) };
}
/** A Short's title: its line first, then what it is from, " #Shorts" at the end, within 100. */
export function shortTitle(base: string, hook?: string): string {
  let line = hook?.replace(/[“”"«»]/g, "").replace(/\s+/g, " ").trim();
  // Too long: its first sentence whole, rather than a line cut in the middle.
  if (line && line.length > 60) { const first = /^.+?[.!?…](?=\s|$)/.exec(line)?.[0]; if (first && first.length >= 12 && first.length <= 60) line = first; }
  return `${cut(line ? `${cut(line, 60)} | ${base}` : base, 92)} #Shorts`;
}
/** The first sentences of a text, within n characters (a Short's description). */
const opening = (text: string, n = 220) => { let out = ""; for (const x of text.match(/[^.!?…]+[.!?…]+["”]?\s*/g) ?? [text]) { if ((out + x).length > n && out) break; out += x; } return out.trim(); };
/** A summary written for choosing topics, not for viewers: without its "for the occasion" sentence. */
const forViewers = (summary = "") => summary.split(/(?<=[.!?])\s+/).filter((x) => !/\bdịp\b|Ngày Nhà giáo|Tết|Trung thu/i.test(x)).join(" ");
async function metaText(job: Job, what: What, cfg: ChannelCfg, longUrl?: string, hook?: string): Promise<Omit<Meta, "categoryId" | "playlist">> {
  const dir = jobDir(job.slug);
  const read = async (f: string) => ((await exists(path.join(dir, f))) ? JSON.parse(await fsp.readFile(path.join(dir, f), "utf8")) : undefined);
  const sources = ((await read("sources.json")) ?? []) as { title: string; url: string }[];
  const qa = ["qa", "qa-vi", "fact", "fact-vi"].includes(job.kind ?? "");
  const series = job.kind === "qa-vi" || job.kind === "fact-vi" ? "Hỏi Huy" : "Ask Huy";
  const plan = what === "en" ? (await read("plan.en.json")) ?? (await read("plan.json")) : await read("plan.json");
  const title0 = String(plan?.title ?? job.topic);
  const watch = longUrl ? (cfg.lang === "vi" ? `Xem trọn video: ${longUrl}\n\n` : `Watch the full video: ${longUrl}\n\n`) : "";
  if (job.kind === "lesson") {
    const wordsTaught = ((plan?.words ?? []) as { en: string; vi: string }[]).map((w) => `${w.en} (${w.vi})`).join(", ");
    return {
      title: what === "short" ? shortTitle(title0, hook) : cut(title0, 100), lang: "vi",
      description: cut(`${watch}${plan?.description ?? ""}\n\n${wordsTaught ? `Từ vựng trong bài: ${wordsTaught}\n\n` : ""}Học tiếng Anh cùng Huy: mỗi bài một chủ đề, từ vựng có hình, giọng đọc mẫu chậm và rõ cho các bé.\n\n#HocTiengAnh #TiengAnhChoBe #HocTiengAnhCungHuy`, 5000),
      tags: tagsOf(["học tiếng Anh", "tiếng Anh cho bé", "tiếng Anh trẻ em", "từ vựng tiếng Anh", "Học tiếng Anh cùng Huy", String(plan?.question ?? job.topic), ...((plan?.words ?? []) as { en: string }[]).map((w) => w.en)]),
    };
  }
  if (qa && (job.kind === "qa-vi" || job.kind === "fact-vi")) {
    const question = String(plan?.question ?? job.topic);
    const base = what === "short" ? shortTitle(question, isFactJob(job) ? undefined : hook) : title0.includes(series) ? title0 : `${title0} | ${series}`;
    return {
      title: cut(base, 100), lang: "vi",
      description: cut(`${watch}${plan?.description ?? ""}\n\n${plan?.answer ? `Trả lời ngắn: ${plan.answer}\n\n` : ""}${sources.length ? `Nguồn tư liệu:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Hỏi Huy (kênh Huy Kể Chuyện): mỗi video trả lời một câu hỏi lớn cho các bạn nhỏ hay tò mò.\n\n#HoiHuy #KhoaHocThieuNhi #HocMaChoi`, 5000),
      tags: tagsOf(["Hỏi Huy", "khoa học thiếu nhi", "giải đáp thắc mắc", "phim hoạt hình giáo dục", question]),
    };
  }
  if (qa) {
    const question = String(plan?.question ?? job.topic);
    const base = what === "short" ? shortTitle(question, isFactJob(job) ? undefined : hook) : title0.includes(series) ? title0 : `${title0} | ${series}`;
    return {
      title: cut(base, 100), lang: "en",
      description: cut(`${watch}${plan?.description ?? ""}\n\n${plan?.answer ? `The short answer: ${plan.answer}\n\n` : ""}${sources.length ? `Sources:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Ask Huy answers one big question for curious kids in every video. New questions every week!\n\n#AskHuy #KidsScience #LearningForKids`, 5000),
      tags: tagsOf(["Ask Huy", "kids science", "science for kids", "learning for kids", "educational cartoon", question, ...String(job.topic).toLowerCase().replace(/[?!.]/g, "").split(/\s+/).filter((w) => w.length > 3)]),
    };
  }
  // Stories: the description written for viewers (copy.ts) and only the sources about this story.
  const copy = await storyCopy(job.slug);
  const storySources = relevantSources(String((await read("plan.json"))?.title ?? job.topic), sources, copy?.sources);
  if (what === "en") {
    return {
      title: cut(`${title0} | Vietnamese Folk Tale for Kids`, 100), lang: "en",
      description: cut(`${watch}${copy?.en ?? `A Vietnamese ${job.kind === "lịch sử" ? "history story" : "folk tale"} told as a cartoon for children.`}\n\n${storySources.length ? `Sources (Vietnamese Wikipedia):\n${storySources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Huy Tells Tales: Vietnamese folk tales and history for kids, on the Huy Kể Chuyện channel.\n\n#HuyTellsTales #VietnameseFolkTales #KidsStories`, 5000),
      tags: tagsOf(["Huy Tells Tales", "Vietnamese folk tale", "stories for kids", "kids cartoon", "Vietnam", title0]),
    };
  }
  const kind = job.kind ?? "truyện cổ tích";
  const story = copy?.vi ?? forViewers(job.summary);
  const base = what === "short" ? shortTitle(title0, hook) : `${title0} | ${kind[0]!.toUpperCase()}${kind.slice(1)} Việt Nam | ${cfg.name}`;
  // A Short: a line or two and the way to the film; the film: the whole description and its sources.
  const body = what === "short" ? opening(story) : `${story}${storySources.length ? `\n\nNguồn tư liệu:\n${storySources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}` : ""}`;
  return {
    title: cut(base, 100), lang: "vi",
    description: cut(`${watch}${body}\n\nHuy Kể Chuyện: truyện cổ tích, truyền thuyết và lịch sử Việt Nam cho bé, kể bằng phim hoạt hình.\n\n#HuyKeChuyen #TruyenCoTich #TruyenThieuNhi`, 5000),
    tags: tagsOf(["Huy Kể Chuyện", "truyện cổ tích", "truyện thiếu nhi", "phim hoạt hình", kind, title0, "Việt Nam"]),
  };
}

// ── When it goes public ─────────────────────────────────────────────────────────────────────

/**
 * The next free publishing time of a channel for a kind of video: the first of its times, at
 * least two hours from now (and after `after`: a Short after its film is public), not yet
 * taken by another video of that channel.
 */
export function nextSlot(cfg: ChannelCfg, kind: "long" | "short" | "en", taken: string[], now = new Date(), after?: string): Date | undefined {
  const times = kind === "short" ? cfg.shorts : kind === "en" && cfg.english?.length ? cfg.english : cfg.long, used = new Set(taken.map((t) => new Date(t).getTime()));
  if (!times.length) return undefined;
  const earliest = Math.max(now.getTime() + 2 * 3600_000, after ? new Date(after).getTime() + 60_000 : 0);
  for (let d = 0; d < 120; d++) {
    for (const hhmm of [...times].sort()) {
      const [h, m] = hhmm.split(":").map(Number);
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, m, 0, 0);
      if (at.getTime() >= earliest && !used.has(at.getTime())) return at;
    }
  }
  return undefined;
}

// ── Upload ──────────────────────────────────────────────────────────────────────────────────

/** A resumable upload, private with a publish time, made for kids (COPPA), not synthetic-real. */
export async function upload(channel: string, file: string, meta: Meta, publishAt: Date): Promise<string> {
  const access = await accessToken(channel);
  const size = (await fsp.stat(file)).size;
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify({
      snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId, defaultLanguage: meta.lang, defaultAudioLanguage: meta.lang },
      status: { privacyStatus: "private", publishAt: publishAt.toISOString(), selfDeclaredMadeForKids: true, containsSyntheticMedia: false, embeddable: true },
    }),
  });
  const where = start.headers.get("location");
  if (!start.ok || !where) throw new Error(`YouTube ${start.status}: ${(await start.text()).slice(0, 300)}`);
  const res = await fetch(where, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(size) }, body: Readable.toWeb(fs.createReadStream(file)) as ReadableStream, duplex: "half" } as RequestInit);
  const out = await res.json() as { id?: string; error?: { message: string } };
  if (!res.ok || !out.id) throw new Error(`YouTube ${res.status}: ${out.error?.message ?? "upload failed"}`);
  return out.id;
}

/** The custom thumbnail (needs a phone-verified channel: a refusal is noted, not fatal). */
async function setThumbnail(channel: string, videoId: string, jpg: string, log: (s: string) => void): Promise<void> {
  try {
    await api(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, await accessToken(channel), { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: await fsp.readFile(jpg) });
  } catch (err) {
    log(`  ⚠ thumbnail: ${(err as Error).message.slice(0, 160)} (kênh cần xác minh số điện thoại để đặt ảnh bìa)`);
  }
}

/** Put a video into the channel's playlist of that name (made public if it is new); a failure is noted, not fatal. */
async function addToPlaylist(channel: string, videoId: string, title: string, log: (s: string) => void): Promise<void> {
  try {
    const t = (await token(channel))!, access = await accessToken(channel);
    let id = t.playlists?.[title];
    if (!id) {
      const mine = await api("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", access) as { items?: { id: string; snippet: { title: string } }[] };
      id = mine.items?.find((p) => p.snippet.title === title)?.id;
      if (!id) {
        const made = await api("https://www.googleapis.com/youtube/v3/playlists?part=snippet,status", access, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snippet: { title }, status: { privacyStatus: "public" } }) }) as { id: string };
        id = made.id;
        log(`  + danh sách phát mới: ${title}`);
      }
      await saveToken(channel, { ...((await token(channel))!), playlists: { ...(t.playlists ?? {}), [title]: id } });
    }
    await api("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", access, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snippet: { playlistId: id, resourceId: { kind: "youtube#video", videoId } } }) });
  } catch (err) {
    log(`  ⚠ danh sách phát "${title}": ${(err as Error).message.slice(0, 160)} (kết nối lại kênh nếu thiếu quyền)`);
  }
}

/** What of a finished job is still to be published, in order: the film, its English version, its Shorts. */
export function toPublish(job: Job, files: string[]): { what: What; file: string; index?: number }[] {
  if (job.status !== "done" || job.publishHold) return [];
  const p = job.published ?? {}, out: { what: What; file: string; index?: number }[] = [];
  // A "Did you know?" Short is itself the video: published as a Short.
  if (job.kind === "fact" || job.kind === "fact-vi") return files.includes("video.mp4") && !p.shorts?.[0] ? [{ what: "short", file: "video.mp4", index: 0 }] : [];
  if (files.includes("video.mp4") && !p.long) out.push({ what: "long", file: "video.mp4" });
  if (files.includes("video.en.mp4") && !p.en) out.push({ what: "en", file: "video.en.mp4" });
  (job.shorts ?? []).forEach((f, i) => { if (p.long && !p.shorts?.[i]) out.push({ what: "short", file: f, index: i }); });
  return out;
}

/** Every publish time already taken on a channel (all jobs). */
export function takenTimes(jobs: Job[], channel: string): string[] {
  const all = (j: Job) => [j.published?.long, j.published?.en, ...(j.published?.shorts ?? []), j.exported?.long, j.exported?.en, ...(j.exported?.shorts ?? [])];
  return jobs.flatMap(all).filter((x): x is Published | Exported => !!x && x.channel === channel).map((x) => x.publishAt);
}

/** Publish one item of a job (the scheduler calls this once per item). */
export async function publishOne(slug: string, item: { what: What; file: string; index?: number }, jobs: Job[], settings: PublishSettings, lines: Line[], log: (s: string) => void): Promise<Published> {
  const job = await loadJob(slug), channel = channelOf(job, item.what, lines), cfg = settings[channel];
  if (!cfg) throw new Error(`không có kênh "${channel}" trong cài đặt đăng`);
  const at = nextSlot(cfg, item.what, takenTimes(jobs, channel), new Date(), item.what !== "long" ? job.published?.long?.publishAt : undefined);
  if (!at) throw new Error(`kênh ${cfg.name} không có giờ đăng cho ${item.what}`);
  const plan = JSON.parse(await fsp.readFile(path.join(jobDir(slug), "plan.json"), "utf8").catch(() => "{}"));
  const hook = item.what === "short" && !isFactJob(job) ? (await shortHooks(slug, job.shorts ?? [], jobDir(slug), plan.shorts))[item.index!] : undefined;
  const meta = await metaOf(job, item.what, cfg, item.what === "short" ? job.published?.long?.url : undefined, hook);
  log(`  upload ${item.file} → ${cfg.name}, công khai lúc ${at.toLocaleString("vi")}`);
  const videoId = await upload(channel, path.join(jobDir(slug), item.file), meta, at);
  const jpg = path.join(jobDir(slug), item.what === "en" ? "thumbnail.en.jpg" : "thumbnail.jpg");
  if (item.what !== "short" && (await exists(jpg))) await setThumbnail(channel, videoId, jpg, log);
  if (meta.playlist) await addToPlaylist(channel, videoId, meta.playlist, log);
  const done: Published = { videoId, url: item.what === "short" ? `https://youtube.com/shorts/${videoId}` : `https://youtu.be/${videoId}`, publishAt: at.toISOString(), channel, at: new Date().toISOString() };
  const fresh = await loadJob(slug);
  fresh.published ??= {};
  if (item.what === "long") fresh.published.long = done;
  else if (item.what === "en") fresh.published.en = done;
  else { fresh.published.shorts ??= []; fresh.published.shorts[item.index!] = done; }
  delete fresh.publishError;
  await saveJob(fresh);
  log(`  ✔ ${done.url}`);
  return done;
}

// ── Settings (studio/settings.json "publish") ───────────────────────────────────────────────

const SETTINGS = path.join(STUDIO_DIR, "settings.json");
/** The channels' settings, old ones ("enabled") read as modes. */
export function normalise(raw?: Record<string, Partial<ChannelCfg> & { enabled?: boolean }>): PublishSettings {
  const out: PublishSettings = {};
  for (const [k, def] of Object.entries(PUBLISH_DEFAULTS)) {
    const c = { ...def, ...(raw?.[k] ?? {}) } as ChannelCfg & { enabled?: boolean; category?: string };
    const { enabled: _, category: __, ...rest } = c;
    out[k] = { ...rest, mode: modeOf(raw?.[k] ?? def) };
  }
  return out;
}
export async function publishSettings(): Promise<PublishSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fsp.readFile(SETTINGS, "utf8")) : {};
  return normalise(raw.publish);
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Change a channel's settings from the review page (on/off, times). */
export async function savePublishSettings(channel: string, change: { mode?: Mode; long?: string[]; shorts?: string[]; english?: string[]; locked?: string | null }): Promise<PublishSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fsp.readFile(SETTINGS, "utf8")) : {};
  const all = normalise(raw.publish);
  const cfg = all[channel];
  if (!cfg) throw new Error(`không có kênh "${channel}"`);
  if (change.mode && ["off", "manual", "auto"].includes(change.mode)) { cfg.mode = change.mode; if (change.mode === "auto") delete cfg.locked; }
  if (change.locked) cfg.locked = change.locked;
  for (const k of ["long", "shorts", "english"] as const) if (Array.isArray(change[k])) cfg[k] = change[k]!.map((x) => String(x).trim()).filter((x) => HHMM.test(x));
  raw.publish = all;
  await fsp.writeFile(SETTINGS, JSON.stringify(raw, null, 2));
  return all;
}

// ── By hand: one folder per topic for YouTube Studio ───────────────────────────────────────

/** ~/youtube/<topic>/: the film, its Shorts, its English version, thumbnails, one sheet. */
export const EXPORT_DIR = () => process.env.WATA_EXPORT_DIR ?? path.join(process.env.HOME ?? "/tmp", "youtube");
/** The main film is named by its language (a Vietnamese story: "Bản tiếng Việt"; an Ask Huy
 *  question: "Bản tiếng Anh"); a story's English version is "Bản tiếng Anh" too. */
export const longLabel = (lang: "vi" | "en") => (lang === "en" ? "Bản tiếng Anh" : "Bản tiếng Việt");
const WHAT_VI = (what: What, lang: "vi" | "en") => (what === "long" ? longLabel(lang).toUpperCase() : what === "en" ? "BẢN TIẾNG ANH" : "SHORT");
const CATEGORY_VI: Record<string, string> = { "1": "Phim và hoạt hình (Film & Animation)", "27": "Giáo dục (Education)" };
const safe = (s: string) => s.replace(/[\/\\:*?"<>|#]/g, "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
const two = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const when = (at: Date) => `${two(at.getHours())}:${two(at.getMinutes())} ${DAYS[at.getDay()]} ${at.getDate()}/${at.getMonth() + 1}/${at.getFullYear()}`;
/** Where a Short's description links to the film, until the film's link is known. */
export const LINK_HERE = "[dán link video dài vào đây]";

export interface Item { what: What; file: string; index?: number }
const isFactJob = (job: Job) => job.kind === "fact" || job.kind === "fact-vi";
/** Everything of a job that goes on YouTube, in upload order: the film, its Shorts, its English version. */
export function allItems(job: Job, files: string[]): Item[] {
  if (isFactJob(job)) return files.includes("video.mp4") ? [{ what: "short", file: "video.mp4", index: 0 }] : [];
  const out: Item[] = [];
  if (files.includes("video.mp4")) out.push({ what: "long", file: "video.mp4" });
  (job.shorts ?? []).forEach((f, i) => out.push({ what: "short", file: f, index: i }));
  if (files.includes("video.en.mp4")) out.push({ what: "en", file: "video.en.mp4" });
  return out;
}
/** The names inside the topic folder: the main film by its language, like its label (an Ask
 *  Huy question is in English; a story, a Hỏi Huy question, a lesson in Vietnamese). */
export const OLD_LONG_NAME = "video-dai.mp4";
export function fileNameOf(job: Job, item: Item): string {
  if (item.what === "long") return job.kind === "qa" ? "video-tieng-anh.mp4" : "video-tieng-viet.mp4";
  if (item.what === "en") return "video-tieng-anh.mp4";
  return isFactJob(job) ? "short.mp4" : `short-${item.index! + 1}.mp4`;
}
const publishedOf = (job: Job, item: Item) => (item.what === "short" ? job.published?.shorts?.[item.index!] : job.published?.[item.what]) ?? undefined;
const exportedOf = (job: Job, item: Item) => (item.what === "short" ? job.exported?.shorts?.[item.index!] : job.exported?.[item.what]) ?? undefined;
const inExportDir = (dir?: string) => !!dir && (dir + path.sep).startsWith(EXPORT_DIR() + path.sep);

/**
 * A finished job whose folder should be made (or completed) now: approved, not held, its
 * Shorts already cut (so the folder is whole at once), and some video of a manual channel not
 * yet published nor laid out in ~/youtube.
 */
export function needsExport(job: Job, files: string[], settings: PublishSettings, lines: Line[]): boolean {
  if (job.status !== "done" || job.publishHold || (!isFactJob(job) && job.shorts === undefined)) return false;
  return allItems(job, files).some((item) => {
    const cfg = settings[channelOf(job, item.what, lines)];
    if (cfg?.mode !== "manual" || !(item.what === "short" ? cfg.shorts : cfg.long).length || publishedOf(job, item)) return false;
    return !inExportDir(exportedOf(job, item)?.dir);
  });
}

/**
 * A laid-out video made again since (a render after a fix): its file in the topic folder is
 * still the old one (a hard link to the old file), so the folder is laid out again (same times).
 */
export async function staleExport(job: Job, files: string[]): Promise<boolean> {
  if (job.status !== "done" || job.publishHold) return false;
  for (const item of allItems(job, files)) {
    const ex = exportedOf(job, item);
    if (!ex || publishedOf(job, item) || !inExportDir(ex.dir)) continue;
    const st = await fsp.stat(path.join(jobDir(job.slug), item.file)).catch(() => undefined);
    if (st && st.mtimeMs > new Date(ex.at).getTime()) return true;
  }
  return false;
}

/** One video's part of the sheet: everything to fill in on YouTube Studio's upload page. */
/** The other thumbnails of a film's main one ("thumbnail.jpg" → thumbnail-2.jpg, -3; "thumbnail.en.jpg" → thumbnail-2.en.jpg…). */
export const thumbVariants = (jpg: string, files: string[]) => [2, 3].map((k) => jpg.replace(/^thumbnail/, `thumbnail-${k}`)).filter((f) => files.includes(f));

/**
 * Everything to fill in on YouTube Studio's upload page, in the page's own order: the file and
 * the channel first (the English version goes to Ask Huy, not the Vietnamese channel), then each
 * box. The sheet (dang-len-youtube.txt) and the studio's pages show the same rows.
 */
export interface FormRow { label: string; value: string; copy?: boolean; must?: boolean; note?: string }
export function youtubeForm(file: string, meta: Meta, cfg: ChannelCfg, what: What, at: Date | undefined, thumb: string | undefined, moreThumbs: string[] = []): FormRow[] {
  return [
    { label: "Tệp tải lên", value: file, must: true },
    { label: "Kênh", value: cfg.name, must: true, note: "đăng đúng kênh này (đổi kênh: ảnh đại diện → Chuyển đổi tài khoản)" },
    { label: "Tiêu đề", value: meta.title, copy: true },
    { label: "Mô tả", value: meta.description, copy: true },
    thumb ? { label: "Hình thu nhỏ", value: `Tải tệp lên: ${thumb}`, note: moreThumbs.length ? `có thêm ${moreThumbs.join(", ")} để chọn; sau 3–4 ngày tỷ lệ nhấp CTR thấp thì đổi ảnh khác` : undefined }
      : { label: "Hình thu nhỏ", value: what === "short" ? "Short: không cần tải ảnh" : "Chọn trong video" },
    ...(meta.playlist ? [{ label: "Danh sách phát", value: meta.playlist, copy: true, note: "chưa có thì bấm Tạo danh sách phát mới với đúng tên này" }] : []),
    { label: "Đối tượng người xem", value: "Có, nội dung này dành cho trẻ em", must: true, note: "bắt buộc với phim thiếu nhi, theo luật COPPA" },
    { label: "Nội dung được trả tiền để quảng cáo", value: "Không" },
    { label: "Sử dụng AI", value: "Không", note: "câu hỏi chỉ về hình ảnh, âm thanh giống thật như người thật, sự kiện thật; phim hoạt hình vẽ thì không" },
    { label: "Thẻ", value: meta.tags.join(", "), copy: true, note: "ở mục Hiện thêm; xóa thẻ cũ nếu có" },
    { label: "Ngôn ngữ video", value: meta.lang === "vi" ? "Tiếng Việt" : "Tiếng Anh (Hoa Kỳ)" },
    { label: "Danh mục", value: CATEGORY_VI[meta.categoryId] ?? meta.categoryId },
    { label: "Các mục khác", value: "Giữ mặc định", note: "bình luận tự tắt khi chọn dành cho trẻ em, như vậy là bình thường" },
    at ? { label: "Chế độ hiển thị", value: `Lên lịch: ${when(at)}`, must: true } : { label: "Chế độ hiển thị", value: "Giờ đăng được xếp khi studio duyệt xong video" },
    { label: "Đăng xong", value: "Dán link video vào trang duyệt của studio (bài này, mục YouTube) rồi bấm ✔ Đã đăng" },
  ];
}

/**
 * TikTok and Facebook, box by box in the order of their upload pages (TikTok Studio on the
 * computer or the app; Meta Business Suite for the Page), as youtubeForm does for YouTube.
 */
export function socialForm(platform: Platform, p: { what: What; name: string; account: string; publishAt?: string; text: string; youtube: Meta; thumb?: string }): FormRow[] {
  const at = p.publishAt ? new Date(p.publishAt) : undefined;
  const done: FormRow = { label: "Đăng xong", value: `Đánh dấu ✔ ${PLATFORM_NAME[platform]} ở bài này trên trang duyệt của studio` };
  if (platform === "tiktok") return [
    { label: "Tệp tải lên", value: p.name, must: true },
    { label: "Tài khoản", value: `TikTok ${p.account}`, must: true, note: "tài khoản TikTok của kênh, không phải tài khoản cá nhân" },
    { label: "Mô tả", value: p.text, copy: true },
    { label: "Ảnh bìa", value: "Chọn một khung hình đẹp trong video", note: "khung có nhân vật rõ mặt" },
    { label: "Âm thanh", value: "Không thêm nhạc", note: "video đã có nhạc và lời" },
    { label: "Vị trí", value: "Không thêm" },
    { label: "Ai có thể xem video này", value: "Mọi người" },
    { label: "Cho phép người dùng", value: "Bình luận: Bật · Duet: Tắt · Stitch: Tắt", note: "giữ video nguyên vẹn, không bị ghép vào video khác" },
    { label: "Công khai nội dung (nội dung thương hiệu)", value: "Tắt" },
    { label: "Nội dung do AI tạo", value: "Bật", must: true, note: "ở mục Hiện thêm; giọng đọc là giọng AI" },
    at ? { label: "Lịch đăng", value: when(at), must: true, note: "TikTok Studio trên máy tính đặt giờ được, tối đa 10 ngày trước; trên điện thoại thì đăng đúng giờ này" }
      : { label: "Lịch đăng", value: "Giờ được xếp khi studio duyệt xong video" },
    done,
  ];
  const reel = p.what === "short", title = p.text.split("\n")[0]!;
  return [
    { label: "Tệp tải lên", value: p.name, must: true },
    { label: "Đăng lên", value: `Trang ${p.account}`, must: true, note: "Trang (Page) của kênh, không phải trang cá nhân; Meta Business Suite → Tạo " + (reel ? "thước phim (Reel)" : "bài viết → Thêm video") },
    { label: "Dạng bài", value: reel ? "Thước phim (Reel)" : "Video" },
    ...(reel ? [] : [{ label: "Tiêu đề", value: title, copy: true }]),
    { label: reel ? "Mô tả" : "Nội dung bài viết", value: p.text, copy: true },
    p.thumb && !reel ? { label: "Ảnh thu nhỏ", value: `Tải lên: ${p.thumb}` } : { label: "Ảnh bìa", value: "Chọn một khung hình đẹp trong video" },
    ...(reel ? [] : [{ label: "Thẻ", value: p.youtube.tags.join(", "), copy: true, note: "ô Thẻ (tags) của video, có thể bỏ qua" }]),
    { label: "Thông tin AI (AI info)", value: "Bật", must: true, note: "giọng đọc là giọng AI" },
    { label: "Đối tượng", value: "Công khai" },
    at ? { label: "Lên lịch", value: when(at), must: true, note: "Meta Business Suite: Tùy chọn lên lịch → chọn ngày giờ" }
      : { label: "Lên lịch", value: "Giờ được xếp khi studio duyệt xong video" },
    done,
  ];
}

export function sheetSection(n: number, file: string, meta: Meta, cfg: ChannelCfg, what: What, at: Date, thumb: string | undefined, done?: Published, moreThumbs: string[] = []): string {
  const rows = youtubeForm(file, meta, cfg, what, at, thumb, moreThumbs);
  return [
    `════════ ${n}. ${WHAT_VI(what, cfg.lang)}: ${file} ════════`,
    ...(done ? [`✔ ĐÃ ĐĂNG: ${done.url}`, ""] : []),
    ...rows.flatMap((r) => r.copy
      ? [`${r.label.toUpperCase()}:${r.note ? ` — ${r.note}` : ""}`, r.value, ""]
      : [`${r.must ? "⚠ " : ""}${r.label}: ${r.value}${r.note ? ` — ${r.note}` : ""}`]),
    "", "",
  ].join("\n");
}

/** A hard link (same disk: no copy), else a copy. */
async function place(from: string, to: string): Promise<void> {
  await fsp.rm(to, { force: true });
  try { await fsp.link(from, to); } catch { await fsp.copyFile(from, to); }
}

/** Remove `old` only when it is another link to the same film (same file on disk): nothing is lost. */
async function dropOldLink(film: string, old: string): Promise<void> {
  const [a, b] = await Promise.all([fsp.stat(film).catch(() => undefined), fsp.stat(old).catch(() => undefined)]);
  if (a && b && a.ino === b.ino && a.dev === b.dev) await fsp.unlink(old);
}

/** The topic's folder: kept from before, else ~/youtube/<title>, "(2)"… if another topic has that name. */
async function folderOf(job: Job, title: string): Promise<string> {
  const before = [job.exported?.long, job.exported?.en, ...(job.exported?.shorts ?? [])].find((x) => x && inExportDir(x.dir))?.dir;
  if (before) return before;
  for (let n = 1; ; n++) {
    const dir = path.join(EXPORT_DIR(), `${safe(title) || job.slug}${n > 1 ? ` (${n})` : ""}`);
    const owner = await fsp.readFile(path.join(dir, ".studio"), "utf8").catch(() => undefined);
    if (owner === undefined && !(await exists(dir))) return dir;
    if (owner?.trim() === job.slug) return dir;
  }
}

/**
 * Lay a finished job out in one folder, ~/youtube/<topic>/: the film, every Short, the English
 * version, the thumbnails, and dang-len-youtube.txt with every video's details. Each video not
 * yet published gets a publishing time from its channel (kept if it had one; Shorts after the
 * film). Videos of channels that are off, or auto (unless forced: the button), are left out.
 * The sheet marks what is already published and fills the film's link into the Shorts once
 * known. Returns the folder (undefined if there was nothing to lay out).
 */
export async function exportJob(slug: string, jobs: Job[], settings: PublishSettings, lines: Line[], opts: { force?: boolean; now?: Date } = {}): Promise<string | undefined> {
  const job = await loadJob(slug), dir = jobDir(slug);
  const files = await fsp.readdir(dir).catch(() => [] as string[]);
  const items = allItems(job, files).filter((item) => {
    const cfg = settings[channelOf(job, item.what, lines)];
    return cfg && cfg.mode !== "off" && (cfg.mode === "manual" || opts.force || publishedOf(job, item));
  });
  if (!items.length) return undefined;
  const plan = JSON.parse(await fsp.readFile(path.join(dir, "plan.json"), "utf8").catch(() => "{}"));
  const hooks = isFactJob(job) ? [] : await shortHooks(job.slug, job.shorts ?? [], dir, plan.shorts);
  // (the topic's name: the title without its " | Ask Huy" series tail)
  const folder = await folderOf(job, String(plan.title ?? job.topic).split(" | ")[0]!);
  await fsp.mkdir(folder, { recursive: true });
  await fsp.writeFile(path.join(folder, ".studio"), job.slug);
  const taken: Record<string, string[]> = {};
  const takenOn = (ch: string) => (taken[ch] ??= takenTimes(jobs.filter((j) => j.slug !== slug), ch));
  const longAt = publishedOf(job, { what: "long", file: "" })?.publishAt;
  let filmAt = longAt;
  const sections: string[] = [], exported: NonNullable<Job["exported"]> = {};
  for (const [n, item] of items.entries()) {
    const channel = channelOf(job, item.what, lines), cfg = settings[channel]!, done = publishedOf(job, item);
    const before = exportedOf(job, item);
    const at = done ? new Date(done.publishAt) : before ? new Date(before.publishAt)
      : nextSlot(cfg, item.what, takenOn(channel), opts.now, item.what !== "long" && !isFactJob(job) ? filmAt : undefined);
    if (!at) continue;
    if (!done) takenOn(channel).push(at.toISOString());
    if (item.what === "long") filmAt = at.toISOString();
    const name = fileNameOf(job, item);
    await place(path.join(dir, item.file), path.join(folder, name));
    // (laid out before under the old name "video-dai.mp4": that link to the same film goes)
    if (item.what === "long") await dropOldLink(path.join(dir, item.file), path.join(folder, OLD_LONG_NAME));
    const jpg = item.what === "short" ? undefined : item.what === "en" ? "thumbnail.en.jpg" : "thumbnail.jpg", thumb = jpg && files.includes(jpg) ? (item.what === "en" ? "anh-bia-tieng-anh.jpg" : "anh-bia.jpg") : undefined;
    // The other two pictures (thumbnail-2.jpg, -3): to choose from, or to change to later.
    const more = thumb ? thumbVariants(jpg!, files).map((f, k) => [f, thumb.replace(/\.jpg$/, `-${k + 2}.jpg`)] as const) : [];
    if (thumb) for (const [from, to] of [[jpg!, thumb] as const, ...more]) await place(path.join(dir, from), path.join(folder, to));
    const meta = await metaOf(job, item.what, cfg, item.what === "short" && !isFactJob(job) ? job.published?.long?.url ?? LINK_HERE : undefined, item.what === "short" ? hooks[item.index!] : undefined);
    sections.push(sheetSection(n + 1, name, meta, cfg, item.what, at, thumb, done, more.map((m) => m[1])));
    if (!done) {
      const ex: Exported = { dir: folder, publishAt: at.toISOString(), channel, at: (opts.now ?? new Date()).toISOString() };
      if (item.what === "short") (exported.shorts ??= [])[item.index!] = ex; else exported[item.what] = ex;
    }
  }
  const head = [
    `CHỦ ĐỀ: ${String(plan.title ?? job.topic).split(" | ")[0]}`,
    "",
    "Cách đăng:",
    "1. Đăng mục 1 (video chính, không phải Short) trước, đặt lịch đúng giờ ghi bên dưới.",
    "2. Mở trang duyệt của studio, bài này, mục YouTube: dán link mục 1 vào ô \"Đã đăng\".",
    `   Studio tự điền link đó vào mô tả các Short trong tệp này (chỗ ${LINK_HERE}).`,
    "3. Đăng từng Short theo giờ của nó, rồi dán link từng cái vào trang duyệt.",
    "", "",
  ].join("\n");
  await fsp.writeFile(path.join(folder, "dang-len-youtube.txt"), head + sections.join(""));
  const placed = new Set(items.map((i) => i.file));
  const posts = (await socialPosts(job, files, settings, lines)).filter((p) => placed.has(p.file));
  await fsp.writeFile(path.join(folder, "dang-tiktok-facebook.txt"), socialSheet(String(plan.title ?? job.topic).split(" | ")[0]!, posts));
  const fresh = await loadJob(slug);
  fresh.exported = exported;
  await saveJob(fresh);
  return folder;
}

// ── TikTok and Facebook (posted by hand) ──────────────────────────────────────────────────

export const socialKey = (platform: Platform, what: What, index?: number) => `${platform}:${what}:${index ?? 0}`;
export interface SocialPost {
  what: What; index?: number;
  /** The job's file, and its name in the topic folder. */
  file: string; name: string; label: string;
  /** The channel (its TikTok / Facebook accounts carry the same name). */
  channel: string; account: string;
  /** The YouTube time, when given: a good time on the other platforms too. */
  publishAt?: string;
  youtube: Meta;
  /** What to fill in on YouTube Studio's page, in its order (youtubeForm). */
  form: FormRow[];
  /** The same for TikTok and Facebook (socialForm). */
  forms: Partial<Record<Platform, FormRow[]>>;
  text: Partial<Record<Platform, string>>;
  /** Marked posted by the user: when. */
  done: Partial<Record<Platform, string>>;
}
const labelOf = (job: Job, item: Item, lang: "vi" | "en") => item.what === "long" ? longLabel(lang) : item.what === "en" ? "Bản tiếng Anh" : isFactJob(job) ? "Short" : `Short ${item.index! + 1}`;

/** Every video of a job with its YouTube details and its TikTok / Facebook words. */
export async function socialPosts(job: Job, files: string[], settings: PublishSettings, lines: Line[]): Promise<SocialPost[]> {
  const out: SocialPost[] = [];
  const plan = JSON.parse(await fsp.readFile(path.join(jobDir(job.slug), "plan.json"), "utf8").catch(() => "{}"));
  const hooks = isFactJob(job) ? [] : await shortHooks(job.slug, job.shorts ?? [], jobDir(job.slug), plan.shorts);
  for (const item of allItems(job, files)) {
    const channel = channelOf(job, item.what, lines), cfg = settings[channel] ?? PUBLISH_DEFAULTS[channel]!;
    const fact = isFactJob(job), longUrl = item.what === "short" && !fact ? job.published?.long?.url : undefined;
    const youtube = await metaOf(job, item.what, cfg, longUrl, item.what === "short" ? hooks[item.index!] : undefined);
    const text: SocialPost["text"] = {}, done: SocialPost["done"] = {};
    for (const p of platformsOf(item.what)) {
      text[p] = socialText(p, youtube, { what: item.what, kind: job.kind, channel: cfg.name, longUrl, isFact: fact, hook: item.what === "short" ? hooks[item.index!] : undefined });
      const d = job.social?.[socialKey(p, item.what, item.index)];
      if (d) done[p] = d;
    }
    const publishAt = (publishedOf(job, item) ?? exportedOf(job, item))?.publishAt;
    // (the thumbnails' names in the topic folder, as exportJob lays them out)
    const jpg = item.what === "short" ? undefined : item.what === "en" ? "thumbnail.en.jpg" : "thumbnail.jpg";
    const thumb = jpg && files.includes(jpg) ? (item.what === "en" ? "anh-bia-tieng-anh.jpg" : "anh-bia.jpg") : undefined;
    const more = thumb ? thumbVariants(jpg!, files).map((_, k) => thumb.replace(/\.jpg$/, `-${k + 2}.jpg`)) : [];
    out.push({
      what: item.what, index: item.index, file: item.file, name: fileNameOf(job, item), label: labelOf(job, item, cfg.lang),
      channel, account: cfg.name, publishAt, youtube, text, done,
      form: youtubeForm(fileNameOf(job, item), youtube, cfg, item.what, publishAt ? new Date(publishAt) : undefined, thumb, more),
      forms: Object.fromEntries((Object.entries(text) as [Platform, string][]).map(([pl, t]) => [pl, socialForm(pl, { what: item.what, name: fileNameOf(job, item), account: cfg.name, publishAt, text: t, youtube, thumb })])),
    });
  }
  return out;
}

/** dang-tiktok-facebook.txt: the words of every post, what to set, what is already posted. */
export function socialSheet(title: string, posts: SocialPost[]): string {
  const head = [
    `CHỦ ĐỀ: ${title}`, "",
    "Short (dọc 9:16) đăng lên TikTok và Facebook Reels; video dài đăng lên Trang Facebook.",
    "Mỗi kênh có tài khoản TikTok và Trang Facebook cùng tên (dòng TÀI KHOẢN). Điện thoại: mở trang /m của studio,",
    "có nút tải video và nút chép lời đăng.", "",
    ...(["tiktok", "facebook"] as Platform[]).flatMap((p) => [`${PLATFORM_NAME[p]}:`, ...SETTINGS_VI[p], ""]), "",
  ];
  const body = posts.filter((p) => Object.keys(p.text).length).map((p, n) => [
    `════════ ${n + 1}. ${p.label.toUpperCase()}: ${p.name} ════════`,
    `TÀI KHOẢN: ${p.account}`,
    ...(p.publishAt ? [`GIỜ GỢI Ý: ${when(new Date(p.publishAt))} (cùng giờ với YouTube)`] : []), "",
    ...(Object.entries(p.forms) as [Platform, FormRow[]][]).flatMap(([pl, rows]) => [
      `── ${PLATFORM_NAME[pl]}${pl === "facebook" ? (p.what === "short" ? " (Reel)" : " (Video)") : ""}${p.done[pl] ? " · ✔ ĐÃ ĐĂNG" : ""} ──`,
      ...rows.flatMap((r) => r.copy ? [`${r.label.toUpperCase()}:${r.note ? ` — ${r.note}` : ""}`, r.value, ""] : [`${r.must ? "⚠ " : ""}${r.label}: ${r.value}${r.note ? ` — ${r.note}` : ""}`]),
      "",
    ]), "",
  ].join("\n"));
  return head.join("\n") + body.join("");
}

/**
 * Where a finished topic stands, for the lists: still being prepared (Shorts not cut), ready to
 * post, downloaded, partly posted, or posted everywhere (YouTube, plus TikTok and Facebook for
 * the platforms each video goes to). Counts per platform: [posted, to post].
 */
export type PostStage = "preparing" | "ready" | "downloaded" | "partial" | "all";
export interface PostState { stage: PostStage; items: number; downloaded: number; posted: number; slots: number; by: Record<"youtube" | Platform, [number, number]> }
export function postState(job: Job, files: string[]): PostState | undefined {
  if (job.status !== "done") return undefined;
  const items = allItems(job, files);
  const by: PostState["by"] = { youtube: [0, 0], tiktok: [0, 0], facebook: [0, 0] };
  let downloaded = 0;
  for (const item of items) {
    by.youtube[1]++;
    if (publishedOf(job, item)) by.youtube[0]++;
    for (const p of platformsOf(item.what)) { by[p][1]++; if (job.social?.[socialKey(p, item.what, item.index)]) by[p][0]++; }
    if (job.downloaded?.[item.file]) downloaded++;
  }
  const slots = by.youtube[1] + by.tiktok[1] + by.facebook[1], posted = by.youtube[0] + by.tiktok[0] + by.facebook[0];
  const stage: PostStage = !items.length || (!isFactJob(job) && job.shorts === undefined) ? "preparing"
    : posted >= slots ? "all" : posted > 0 ? "partial" : downloaded > 0 ? "downloaded" : "ready";
  return { stage, items: items.length, downloaded, posted, slots, by };
}

/** A file of the job was downloaded from the studio's pages. */
export async function markDownloaded(slug: string, file: string): Promise<void> {
  const job = await loadJob(slug);
  (job.downloaded ??= {})[file] = new Date().toISOString();
  await saveJob(job);
}

/** The user posted (or un-posted) a video on TikTok / Facebook. */
export async function markSocial(slug: string, platform: Platform, what: What, index: number | undefined, done: boolean): Promise<Job> {
  const job = await loadJob(slug), key = socialKey(platform, what, index);
  job.social ??= {};
  if (done) job.social[key] = new Date().toISOString(); else delete job.social[key];
  await saveJob(job);
  return job;
}

/** The video id in a YouTube link (watch, youtu.be, shorts, Studio), or a bare id. */
export function videoIdOf(link: string): string | undefined {
  const s = link.trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/|\/live\/|\/embed\/)([\w-]{11})(?![\w-])/) ?? s.match(/^([\w-]{11})$/);
  return m?.[1];
}

/** The user uploaded an exported video: keep its link (and drop the exported entry). */
export async function markPublished(slug: string, what: What, index: number | undefined, link: string, lines: Line[]): Promise<Published> {
  const job = await loadJob(slug), id = videoIdOf(link);
  if (!id) throw new Error("Không đọc được mã video trong link này");
  const ex = what === "short" ? job.exported?.shorts?.[index ?? 0] : job.exported?.[what];
  const done: Published = {
    videoId: id, url: what === "short" ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`,
    publishAt: ex?.publishAt ?? new Date().toISOString(), channel: ex?.channel ?? channelOf(job, what, lines), at: new Date().toISOString(), manual: true,
  };
  job.published ??= {};
  if (what === "short") { job.published.shorts ??= []; job.published.shorts[index ?? 0] = done; if (job.exported?.shorts) delete job.exported.shorts[index ?? 0]; }
  else { job.published[what] = done; if (job.exported) delete job.exported[what]; }
  await saveJob(job);
  return done;
}

// ── Auto: was it really made public? ───────────────────────────────────────────────────────

/** An auto upload to look at now: its hour passed half an hour ago, not seen public, not looked at in 30 min. */
export function dueCheck(p: Published | undefined, now = new Date()): boolean {
  if (!p || p.manual || p.checked) return false;
  if (new Date(p.publishAt).getTime() + 30 * 60_000 > now.getTime()) return false;
  return !p.lastCheck || new Date(p.lastCheck).getTime() + 30 * 60_000 <= now.getTime();
}

/** What a video's status says once its hour has passed. */
export function verdict(status: { privacyStatus?: string; uploadStatus?: string; failureReason?: string; rejectionReason?: string } | undefined): "public" | "locked" | "failed" | "gone" {
  if (!status) return "gone";
  if (status.uploadStatus === "rejected" || status.uploadStatus === "failed") return "failed";
  return status.privacyStatus === "public" || status.privacyStatus === "unlisted" ? "public" : "locked";
}

const LOCKED = "Video tải lên bằng API vẫn riêng tư sau giờ công khai: dự án Google chưa qua audit của YouTube nên video bị khóa. Kênh đã chuyển về Xuất tay. Xóa video bị khóa trong YouTube Studio rồi đăng tay bản đã xuất.";

/**
 * Look at one auto upload whose hour has passed. Public: noted. Still private: the channel goes
 * back to manual and every auto upload of it not yet seen public is taken off the job (to be
 * laid out again by hand). Returns what was found.
 */
export async function checkOne(slug: string, what: What, index: number | undefined, log: (s: string) => void): Promise<string> {
  const job = await loadJob(slug), p = what === "short" ? job.published?.shorts?.[index ?? 0] : job.published?.[what];
  if (!p) return "none";
  const r = await api(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${p.videoId}`, await accessToken(p.channel)) as { items?: { status: Parameters<typeof verdict>[0] }[] };
  const v = verdict(r.items?.[0]?.status), now = new Date().toISOString();
  if (v === "public") { p.checked = now; await saveJob(job); log(`  ✔ đã công khai: ${p.url}`); return v; }
  p.lastCheck = now;
  await saveJob(job);
  if (v === "failed" || v === "gone") { log(`  ⚠ ${p.url}: ${v === "gone" ? "không còn trên YouTube" : "YouTube từ chối video"}`); return v; }
  log(`  ✘ ${p.url} vẫn riêng tư sau giờ công khai: video bị khóa (dự án chưa qua audit)`);
  await savePublishSettings(p.channel, { mode: "manual", locked: `${LOCKED} (${new Date().toLocaleString("vi")}, ${p.url})` });
  await unpublishLocked(p.channel);
  return v;
}

/** Take a locked channel's unconfirmed auto uploads off their jobs (kept in lockedVideos). */
async function unpublishLocked(channel: string): Promise<void> {
  const { listJobs } = await import("./jobs.ts");
  for (const j of await listJobs()) {
    const p = j.published;
    if (!p) continue;
    const bad = (x?: Published) => !!x && x.channel === channel && !x.manual && !x.checked;
    let changed = false;
    for (const k of ["long", "en"] as const) if (bad(p[k])) { (j.lockedVideos ??= []).push(p[k]!); delete p[k]; changed = true; }
    if (p.shorts?.some(bad)) { p.shorts = p.shorts.map((x) => { if (bad(x)) { (j.lockedVideos ??= []).push(x); changed = true; return undefined; } return x; }) as Published[]; changed = true; }
    if (changed) await saveJob(j);
  }
}
