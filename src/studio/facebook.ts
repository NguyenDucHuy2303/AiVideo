/**
 * Facebook Reels, posted by the studio itself (16/11/2026): every Short goes to its channel's
 * Page at its time on the calendar (the same as YouTube's), with the words social.ts writes.
 * Through Meta's Reels Publishing API (start → upload → finish) with the Page's token, which
 * never expires (made from a long-lived user token of the app "AskHuy", in development mode:
 * the user's own Pages only, no review). Keys in studio/secrets/facebook.json (never in git).
 * The studio posts at the time itself (it runs all day), not with Facebook's scheduling, and
 * all of it (the user's rule: Facebook is the studio's alone; YouTube and TikTok by hand). A
 * Short already on the Page (posted by hand before, its first line the same) is only marked.
 * Late ones go one at a time, GAP apart on a Page, so the Page is never flooded. No brain.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { jobDir, loadJob, saveJob, type Job } from "./jobs.ts";
import { allItems, channelOf, linkOfShort, socialKey, socialPosts, type ChannelCfg, type PublishSettings } from "./publish.ts";
import type { Line } from "./pick.ts";
import { LINK_WAIT } from "./social.ts";

const SECRETS = path.join(ROOT, "studio", "secrets", "facebook.json");
const GRAPH = "https://graph.facebook.com/v21.0";
const RETRY_MS = 30 * 60_000;

interface Secrets { appId: string; appSecret: string; pages?: Record<string, { name: string; token: string }> }
async function secrets(): Promise<Secrets | undefined> {
  return (await exists(SECRETS)) ? JSON.parse(await fs.readFile(SECRETS, "utf8")) : undefined;
}

/** Does the studio post this channel's Shorts to Facebook (its Page known). */
export const autoFacebook = (cfg?: ChannelCfg) => !!cfg?.facebookPage;
/** Least time between two Reels of a Page (late ones wait their turn). */
export const GAP_MS = 90 * 60_000;

/** When each channel's Page last got a Reel from the studio. */
export function lastReels(jobs: Job[], lines: Line[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of jobs) for (const [key, f] of Object.entries(j.facebook ?? {})) {
    if (f.byHand) continue;
    const what = key.split(":")[1] as "short", ch = channelOf(j, what, lines), t = new Date(f.at).getTime();
    if (!(out[ch]! >= t)) out[ch] = t;
  }
  return out;
}

/** The Short of a job due on Facebook now: approved, its time come, not posted, its Page free. */
export function dueReel(job: Job, files: string[], settings: PublishSettings, lines: Line[], now = new Date(), last: Record<string, number> = {}): { what: "short"; index: number; file: string; channel: string } | undefined {
  if (job.status !== "done" || job.publishHold || (job.fbRetryAt && new Date(job.fbRetryAt) > now)) return undefined;
  for (const item of allItems(job, files)) {
    if (item.what !== "short") continue;
    const channel = channelOf(job, item.what, lines), cfg = settings[channel];
    if (!autoFacebook(cfg) || job.social?.[socialKey("facebook", "short", item.index)]) continue;
    const at = (job.published?.shorts?.[item.index!] ?? job.exported?.shorts?.[item.index!])?.publishAt;
    if (!at || new Date(at) > now || (last[channel] && now.getTime() - last[channel]! < GAP_MS)) continue;
    // Every post carries its YouTube link (the user's rule, 16/11/2026): it waits for the link,
    // and for that video to be out on YouTube (a link to a scheduled video shows nothing yet).
    const link = linkOfShort(job, item.index!);
    if (!link || new Date(link.publishAt) > now) continue;
    return { what: "short", index: item.index!, file: item.file, channel };
  }
  return undefined;
}

/** A Reel on the Page already whose words open the same way (posted by hand): its id. */
async function alreadyOnPage(pageId: string, token: string, text: string): Promise<string | undefined> {
  const first = text.split("\n")[0]!.trim().toLowerCase();
  const r = await fetch(`${GRAPH}/${pageId}/video_reels?fields=id,description&limit=100&access_token=${token}`);
  const j = await r.json() as { data?: { id: string; description?: string }[] };
  return j.data?.find((v) => (v.description ?? "").trim().toLowerCase().startsWith(first))?.id;
}

/** One Reel to a Page: start, upload the file, finish (published now). */
export async function postReel(pageId: string, token: string, file: string, description: string): Promise<{ videoId: string; postId?: string; url: string }> {
  const post = async (body: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ ...body, access_token: token }) });
    const j = await r.json() as Record<string, unknown> & { error?: { message?: string } };
    if (!r.ok || j.error) throw new Error(`Facebook: ${j.error?.message ?? r.status}`);
    return j;
  };
  const start = await post({ upload_phase: "start" }) as { video_id: string; upload_url: string };
  const data = await fs.readFile(file);
  const up = await fetch(start.upload_url, { method: "POST", headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(data.length) }, body: data });
  const upj = await up.json() as { success?: boolean; error?: { message?: string } };
  if (!up.ok || !upj.success) throw new Error(`Facebook tải lên: ${upj.error?.message ?? up.status}`);
  const fin = await post({ upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description }) as { post_id?: string };
  return { videoId: start.video_id, postId: fin.post_id, url: `https://www.facebook.com/reel/${start.video_id}/` };
}

/** Post a job's due Short; marked posted on Facebook (the user's tick), or an error to retry. */
export async function postDue(slug: string, settings: PublishSettings, lines: Line[], log: (s: string) => void = () => {}): Promise<Job> {
  let job = await loadJob(slug);
  const files = await fs.readdir(jobDir(slug)).catch(() => [] as string[]);
  const due = dueReel(job, files, settings, lines);
  if (!due) return job;
  const key = socialKey("facebook", "short", due.index), cfg = settings[due.channel]!;
  try {
    const sec = await secrets(), page = sec?.pages?.[cfg.facebookPage!];
    if (!page) throw new Error(`chưa có mã của Trang ${cfg.name} (studio/secrets/facebook.json)`);
    const post = (await socialPosts(job, files, settings, lines)).find((p) => p.what === "short" && p.index === due.index);
    const text = post?.text.facebook;
    if (!text) throw new Error("không có lời đăng Facebook");
    if (text.includes(LINK_WAIT) || !/https:\/\/(youtu\.be|youtube\.com)\//.test(text)) throw new Error("lời đăng Facebook chưa có link YouTube");
    const before = await alreadyOnPage(cfg.facebookPage!, page.token, text);
    if (before) log(`  Facebook: ${post!.name} đã có trên Trang ${page.name} (đăng tay): chỉ đánh dấu`);
    else log(`  Facebook: đăng Reel ${post!.name} lên Trang ${page.name}`);
    const r = before ? { videoId: before, postId: undefined, url: `https://www.facebook.com/reel/${before}/` } : await postReel(cfg.facebookPage!, page.token, path.join(jobDir(slug), due.file), text);
    job = await loadJob(slug);
    (job.social ??= {})[key] = new Date().toISOString();
    (job.facebook ??= {})[key] = { videoId: r.videoId, postId: r.postId, url: r.url, at: new Date().toISOString(), ...(before ? { byHand: true } : {}) };
    delete job.fbError; delete job.fbRetryAt;
    await saveJob(job);
    log(`  Facebook: ✔ ${r.url}`);
  } catch (err) {
    job = await loadJob(slug);
    job.fbError = (err as Error).message.slice(0, 300);
    job.fbRetryAt = new Date(Date.now() + RETRY_MS).toISOString();
    await saveJob(job);
    log(`  Facebook: ✘ ${job.fbError} (thử lại sau 30 phút)`);
  }
  return job;
}
