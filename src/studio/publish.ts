/**
 * Publishing to YouTube (Data API v3, no library: plain fetch). A video the user approved
 * ("done") is uploaded by the studio as private with a publish time (publishAt): YouTube makes
 * it public at that hour. Then its Shorts (linking to the full video) and its English version
 * (to the English channel), as they become ready. Every channel is off until the user connects
 * it (OAuth, once, on the review page) and turns it on.
 *
 * Channels are keyed like the content lines (settings "pick.lines": ask-huy, huy-ke-chuyen);
 * the English versions of stories go to "huy-tells-tales". Secrets stay in studio/secrets/
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
import { lineOf, type Line } from "./pick.ts";

export const SECRETS = path.join(STUDIO_DIR, "secrets");
const CLIENT = path.join(SECRETS, "client_secret.json");
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

export interface ChannelCfg {
  name: string;
  lang: "vi" | "en";
  /** YouTube category: 1 Film & Animation, 27 Education. */
  category: string;
  /** Local times for full videos (one a day each) and for Shorts. */
  long: string[];
  shorts: string[];
  enabled: boolean;
}
export type PublishSettings = Record<string, ChannelCfg>;
export const PUBLISH_DEFAULTS: PublishSettings = {
  "huy-ke-chuyen": { name: "Huy Kể Chuyện", lang: "vi", category: "1", long: ["18:00"], shorts: ["11:30", "16:30", "20:30"], enabled: false },
  "huy-tells-tales": { name: "Huy Tells Tales", lang: "en", category: "1", long: ["19:00"], shorts: [], enabled: false },
  "ask-huy": { name: "Ask Huy", lang: "en", category: "27", long: ["17:00"], shorts: ["12:00", "15:00", "19:30"], enabled: false },
  "hoi-huy": { name: "Hỏi Huy", lang: "vi", category: "27", long: ["17:30"], shorts: ["12:30", "19:00"], enabled: false },
};

export interface Published { videoId: string; url: string; publishAt: string; channel: string; at: string }
export type What = "long" | "short" | "en";

/** Which channel a job's video goes to. */
export function channelOf(job: Job, what: What, lines: Line[]): string {
  if (what === "en") return "huy-tells-tales";
  return lineOf(job, lines)?.id ?? "huy-ke-chuyen";
}

// ── OAuth (installed app, loopback redirect, PKCE) ──────────────────────────────────────────

interface Client { client_id: string; client_secret: string }
interface Token { refresh_token: string; access_token?: string; expiry?: number; channelId?: string; channelTitle?: string }

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
  if (!c) throw new Error("chưa có studio/secrets/client_secret.json (xem README: Kết nối YouTube)");
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

export interface Meta { title: string; description: string; tags: string[]; categoryId: string; lang: string }
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
export async function metaOf(job: Job, what: What, cfg: ChannelCfg, longUrl?: string): Promise<Meta> {
  const dir = jobDir(job.slug);
  const read = async (f: string) => ((await exists(path.join(dir, f))) ? JSON.parse(await fsp.readFile(path.join(dir, f), "utf8")) : undefined);
  const sources = ((await read("sources.json")) ?? []) as { title: string; url: string }[];
  const qa = job.kind === "qa" || job.kind === "qa-vi";
  const plan = what === "en" ? (await read("plan.en.json")) ?? (await read("plan.json")) : await read("plan.json");
  const title0 = String(plan?.title ?? job.topic);
  const watch = longUrl ? (cfg.lang === "vi" ? `Xem trọn video: ${longUrl}\n\n` : `Watch the full video: ${longUrl}\n\n`) : "";
  if (qa && cfg.lang === "vi") {
    const question = String(plan?.question ?? job.topic);
    const base = what === "short" ? `${cut(question, 88)} #Shorts` : title0.includes(cfg.name) ? title0 : `${title0} | ${cfg.name}`;
    return {
      title: cut(base, 100), categoryId: cfg.category, lang: "vi",
      description: cut(`${watch}${plan?.description ?? ""}\n\n${plan?.answer ? `Trả lời ngắn: ${plan.answer}\n\n` : ""}${sources.length ? `Nguồn tư liệu:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Hỏi Huy: mỗi video trả lời một câu hỏi lớn cho các bạn nhỏ hay tò mò.\n\n#HoiHuy #KhoaHocThieuNhi #HocMaChoi`, 5000),
      tags: tagsOf(["Hỏi Huy", "khoa học thiếu nhi", "giải đáp thắc mắc", "phim hoạt hình giáo dục", question]),
    };
  }
  if (qa) {
    const question = String(plan?.question ?? job.topic);
    const base = what === "short" ? `${cut(question, 88)} #Shorts` : title0.includes(cfg.name) ? title0 : `${title0} | ${cfg.name}`;
    return {
      title: cut(base, 100), categoryId: cfg.category, lang: "en",
      description: cut(`${watch}${plan?.description ?? ""}\n\n${plan?.answer ? `The short answer: ${plan.answer}\n\n` : ""}${sources.length ? `Sources:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Ask Huy answers one big question for curious kids in every video. New questions every week!\n\n#AskHuy #KidsScience #LearningForKids`, 5000),
      tags: tagsOf(["Ask Huy", "kids science", "science for kids", "learning for kids", "educational cartoon", question, ...String(job.topic).toLowerCase().replace(/[?!.]/g, "").split(/\s+/).filter((w) => w.length > 3)]),
    };
  }
  if (what === "en") {
    return {
      title: cut(`${title0} | Vietnamese Folk Tale for Kids`, 100), categoryId: cfg.category, lang: "en",
      description: cut(`${watch}A Vietnamese ${job.kind === "lịch sử" ? "history story" : "folk tale"} told as a cartoon for children.\n\n${sources.length ? `Sources (Vietnamese Wikipedia):\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Huy Tells Tales: Vietnamese folk tales and history for kids.\n\n#HuyTellsTales #VietnameseFolkTales #KidsStories`, 5000),
      tags: tagsOf(["Huy Tells Tales", "Vietnamese folk tale", "stories for kids", "kids cartoon", "Vietnam", title0]),
    };
  }
  const kind = job.kind ?? "truyện cổ tích";
  const base = what === "short" ? `${cut(title0, 85)} #Shorts` : `${title0} | ${kind[0]!.toUpperCase()}${kind.slice(1)} Việt Nam | ${cfg.name}`;
  return {
    title: cut(base, 100), categoryId: cfg.category, lang: "vi",
    description: cut(`${watch}${job.summary ?? ""}\n\n${sources.length ? `Nguồn tư liệu:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\n` : ""}Huy Kể Chuyện: truyện cổ tích, truyền thuyết và lịch sử Việt Nam cho bé, kể bằng phim hoạt hình.\n\n#HuyKeChuyen #TruyenCoTich #TruyenThieuNhi`, 5000),
    tags: tagsOf(["Huy Kể Chuyện", "truyện cổ tích", "truyện thiếu nhi", "phim hoạt hình", kind, title0, "Việt Nam"]),
  };
}

// ── When it goes public ─────────────────────────────────────────────────────────────────────

/**
 * The next free publishing time of a channel for a kind of video: the first of its times, at
 * least two hours from now, not yet taken by another video of that channel.
 */
export function nextSlot(cfg: ChannelCfg, kind: "long" | "short", taken: string[], now = new Date()): Date | undefined {
  const times = kind === "short" ? cfg.shorts : cfg.long, used = new Set(taken.map((t) => new Date(t).getTime()));
  if (!times.length) return undefined;
  const earliest = now.getTime() + 2 * 3600_000;
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

/** What of a finished job is still to be published, in order: the film, its English version, its Shorts. */
export function toPublish(job: Job, files: string[]): { what: What; file: string; index?: number }[] {
  if (job.status !== "done" || job.publishHold) return [];
  const p = job.published ?? {}, out: { what: What; file: string; index?: number }[] = [];
  if (files.includes("video.mp4") && !p.long) out.push({ what: "long", file: "video.mp4" });
  if (files.includes("video.en.mp4") && !p.en) out.push({ what: "en", file: "video.en.mp4" });
  (job.shorts ?? []).forEach((f, i) => { if (p.long && !p.shorts?.[i]) out.push({ what: "short", file: f, index: i }); });
  return out;
}

/** Every publish time already taken on a channel (all jobs). */
export function takenTimes(jobs: Job[], channel: string): string[] {
  return jobs.flatMap((j) => [j.published?.long, j.published?.en, ...(j.published?.shorts ?? [])]).filter((x): x is Published => !!x && x.channel === channel).map((x) => x.publishAt);
}

/** Publish one item of a job (the scheduler calls this once per item). */
export async function publishOne(slug: string, item: { what: What; file: string; index?: number }, jobs: Job[], settings: PublishSettings, lines: Line[], log: (s: string) => void): Promise<Published> {
  const job = await loadJob(slug), channel = channelOf(job, item.what, lines), cfg = settings[channel];
  if (!cfg) throw new Error(`không có kênh "${channel}" trong cài đặt đăng`);
  const at = nextSlot(cfg, item.what === "short" ? "short" : "long", takenTimes(jobs, channel));
  if (!at) throw new Error(`kênh ${cfg.name} không có giờ đăng cho ${item.what}`);
  const meta = await metaOf(job, item.what, cfg, item.what === "short" ? job.published?.long?.url : undefined);
  log(`  upload ${item.file} → ${cfg.name}, công khai lúc ${at.toLocaleString("vi")}`);
  const videoId = await upload(channel, path.join(jobDir(slug), item.file), meta, at);
  const jpg = path.join(jobDir(slug), item.what === "en" ? "thumbnail.en.jpg" : "thumbnail.jpg");
  if (item.what !== "short" && (await exists(jpg))) await setThumbnail(channel, videoId, jpg, log);
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
export async function publishSettings(): Promise<PublishSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fsp.readFile(SETTINGS, "utf8")) : {};
  return { ...PUBLISH_DEFAULTS, ...(raw.publish ?? {}) };
}
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Change a channel's settings from the review page (on/off, times). */
export async function savePublishSettings(channel: string, change: { enabled?: boolean; long?: string[]; shorts?: string[] }): Promise<PublishSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fsp.readFile(SETTINGS, "utf8")) : {};
  const all: PublishSettings = { ...PUBLISH_DEFAULTS, ...(raw.publish ?? {}) };
  const cfg = all[channel];
  if (!cfg) throw new Error(`không có kênh "${channel}"`);
  if (typeof change.enabled === "boolean") cfg.enabled = change.enabled;
  for (const k of ["long", "shorts"] as const) if (Array.isArray(change[k])) cfg[k] = change[k]!.map((x) => String(x).trim()).filter((x) => HHMM.test(x));
  raw.publish = all;
  await fsp.writeFile(SETTINGS, JSON.stringify(raw, null, 2));
  return all;
}
