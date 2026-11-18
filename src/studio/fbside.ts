/**
 * Facebook beside the posting (16/11/2026), every 10 minutes next to the scheduler (never held
 * up by a render), no brain:
 * - The YouTube link as the Page's first comment on its Reels (a link in a comment can be
 *   tapped; one in a Reel's caption cannot, and a caption leading off Facebook is shown to
 *   fewer people). Only once the Page's token may comment (pages_manage_engagement); before
 *   that the link stays in the caption (facebook.ts). Reels posted before get theirs too.
 * - Once a day (from 08:00) the numbers: each Page's followers, each Reel's plays, reach, likes,
 *   comments (plays and reach need read_insights), kept in studio/fbstats.jsonl, and the report
 *   "Bao cao Facebook.txt" (studio/ and the top of the Drive folder): what grew in 7 days.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { STUDIO_DIR } from "../brain/claude.ts";
import { jobDir, listJobs, loadJob, saveJob, type Job } from "./jobs.ts";
import { channelOf, socialPosts, type PublishSettings } from "./publish.ts";
import { COMMENT_SCOPE, GRAPH, pageScopes, secrets, type Secrets } from "./facebook.ts";
import { linkToComment } from "./social.ts";
import { putDriveText } from "./drive.ts";
import type { Line } from "./pick.ts";

const STATS = path.join(STUDIO_DIR, "fbstats.jsonl");
export const REPORT_FILE = "Bao cao Facebook.txt";
const MAX_TRIES = 12;
const DAY = 24 * 3600_000;

type Settings = () => Promise<{ publish: PublishSettings; pick: { lines: Line[] } }>;
interface Page { id: string; name: string; token: string }

async function graph<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${GRAPH}/${url}`, init);
  const j = await r.json() as T & { error?: { message?: string } };
  if (!r.ok || j.error) throw new Error(j.error?.message ?? String(r.status));
  return j;
}

/** The Page a job's Reels went to (its Shorts' channel). */
function pageOf(job: Job, s: { publish: PublishSettings; pick: { lines: Line[] } }, sec: Secrets): Page | undefined {
  const id = s.publish[channelOf(job, "short", s.pick.lines)]?.facebookPage, p = id ? sec.pages?.[id] : undefined;
  return id && p ? { id, name: p.name, token: p.token } : undefined;
}

// ── The link in the first comment ─────────────────────────────────────────────────────────

/** Write the YouTube link under every Reel that lacks it (posted in the last 14 days, not by hand). */
export async function commentLinks(get: Settings, log: (s: string) => void): Promise<void> {
  const sec = await secrets();
  if (!sec) return;
  const s = await get();
  for (const j of await listJobs()) {
    for (const [key, f] of Object.entries(j.facebook ?? {})) {
      if (f.byHand || f.comment || (f.commentTries ?? 0) >= MAX_TRIES || Date.now() - new Date(f.at).getTime() > 14 * DAY) continue;
      const page = pageOf(j, s, sec);
      if (!page || !(await pageScopes(sec, page.token)).includes(COMMENT_SCOPE)) continue;
      let line = f.linkComment;
      if (!line) {
        // (a Reel posted before the comments: its link from the words of its post now)
        const files = await fs.readdir(jobDir(j.slug)).catch(() => [] as string[]);
        const index = Number(key.split(":")[2]);
        const text = (await socialPosts(j, files, s.publish, s.pick.lines)).find((p) => p.what === "short" && p.index === index)?.text.facebook;
        line = text ? linkToComment(text, s.publish[channelOf(j, "short", s.pick.lines)]?.lang ?? "vi")?.comment : undefined;
        if (!line) continue; // (no YouTube link yet)
      }
      const job = await loadJob(j.slug), entry = job.facebook![key]!;
      try {
        const r = await graph<{ id: string }>(`${f.videoId}/comments`, { method: "POST", body: new URLSearchParams({ message: line, access_token: page.token }) });
        entry.comment = r.id;
        log(`[${j.slug}] Facebook: link YouTube ở bình luận đầu tiên (${f.url})`);
      } catch (err) {
        // (a Reel still being made ready takes no comment yet: the next round tries again)
        entry.commentTries = (entry.commentTries ?? 0) + 1;
        if (entry.commentTries >= MAX_TRIES) log(`[${j.slug}] Facebook: ✘ không viết được bình luận link: ${(err as Error).message}`);
      }
      await saveJob(job);
    }
  }
}

// ── The numbers ───────────────────────────────────────────────────────────────────────────

export interface Snapshot {
  at: string;
  pages: Record<string, { name: string; followers?: number }>;
  reels: { slug: string; key: string; name: string; page: string; posted: string; plays?: number; reach?: number; likes?: number; comments?: number }[];
  /** The Pages whose token may not read insights (no plays, no reach). */
  noInsights?: string[];
}

async function snapshots(): Promise<Snapshot[]> {
  const text = await fs.readFile(STATS, "utf8").catch(() => "");
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Snapshot);
}

/** Today's numbers from Facebook. */
export async function takeSnapshot(get: Settings): Promise<Snapshot | undefined> {
  const sec = await secrets();
  if (!sec?.pages) return undefined;
  const s = await get(), snap: Snapshot = { at: new Date().toISOString(), pages: {}, reels: [] }, blind = new Set<string>();
  for (const [id, p] of Object.entries(sec.pages)) {
    const r = await graph<{ followers_count?: number; fan_count?: number }>(`${id}?fields=followers_count,fan_count&access_token=${p.token}`).catch(() => undefined);
    snap.pages[id] = { name: p.name, followers: r?.followers_count ?? r?.fan_count };
  }
  for (const j of await listJobs()) {
    const page = pageOf(j, s, sec);
    if (!page) continue;
    for (const [key, f] of Object.entries(j.facebook ?? {})) {
      if (Date.now() - new Date(f.at).getTime() > 90 * DAY) continue;
      const reel: Snapshot["reels"][number] = { slug: j.slug, key, name: `${j.topic.split(" | ")[0]} (Short ${Number(key.split(":")[2]) + 1})`, page: page.id, posted: f.at };
      const c = await graph<{ likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(
        `${f.videoId}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0)&access_token=${page.token}`).catch(() => undefined);
      reel.likes = c?.likes?.summary?.total_count;
      reel.comments = c?.comments?.summary?.total_count;
      if (!blind.has(page.id)) {
        try {
          const ins = await graph<{ data?: { name: string; values?: { value?: number }[] }[] }>(`${f.videoId}/video_insights?metric=blue_reels_play_count,post_impressions_unique&access_token=${page.token}`);
          const v = (n: string) => ins.data?.find((d) => d.name === n)?.values?.[0]?.value;
          reel.plays = v("blue_reels_play_count");
          reel.reach = v("post_impressions_unique");
        } catch { blind.add(page.id); }
      }
      snap.reels.push(reel);
    }
  }
  if (blind.size) snap.noInsights = [...blind];
  await fs.appendFile(STATS, JSON.stringify(snap) + "\n");
  return snap;
}

const day = (d: Date) => d.toLocaleDateString("vi", { weekday: "short", day: "2-digit", month: "2-digit" });
const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The report: each Page now, and what grew since the numbers of a week before. */
export function reportText(now: Snapshot, all: Snapshot[]): string {
  const t = new Date(now.at).getTime();
  // (the snapshot nearest to 7 days before, at least 5 days old)
  const old = [...all].reverse().find((x) => t - new Date(x.at).getTime() >= 5 * DAY);
  const out = [
    `BÁO CÁO FACEBOOK (studio tự cập nhật mỗi sáng) — ${new Date(now.at).toLocaleString("vi")}`,
    old ? `So với ${day(new Date(old.at))}.` : "Chưa đủ một tuần số liệu để so sánh: cột thay đổi sẽ có sau vài ngày.",
    "",
  ];
  for (const [id, p] of Object.entries(now.pages)) {
    const reels = now.reels.filter((r) => r.page === id), before = old?.pages[id]?.followers;
    const was = new Map((old?.reels ?? []).map((r) => [`${r.slug}|${r.key}`, r]));
    const week = reels.filter((r) => t - new Date(r.posted).getTime() <= 7 * DAY).length;
    const blind = now.noInsights?.includes(id);
    const grew = (r: Snapshot["reels"][number]) => (r.plays ?? 0) - (was.get(`${r.slug}|${r.key}`)?.plays ?? 0);
    out.push(`══ Trang ${p.name} ══`);
    out.push(`Người theo dõi: ${p.followers ?? "?"}${before !== undefined && p.followers !== undefined ? ` (${sign(p.followers - before)} trong tuần)` : ""}`);
    out.push(`Reel đã đăng: ${reels.length} (${week} trong 7 ngày qua)`);
    if (blind) out.push("Lượt phát, lượt tiếp cận: CHƯA CÓ QUYỀN THỐNG KÊ (read_insights): cần tạo lại mã Trang.");
    else {
      out.push(`Lượt phát: ${reels.reduce((a, r) => a + (r.plays ?? 0), 0)} tổng${old ? `, ${reels.reduce((a, r) => a + grew(r), 0)} trong tuần` : ""}`);
      out.push(`Người xem (tiếp cận): ${reels.reduce((a, r) => a + (r.reach ?? 0), 0)} tổng`);
    }
    out.push(`Lượt thích: ${reels.reduce((a, r) => a + (r.likes ?? 0), 0)} · Bình luận: ${reels.reduce((a, r) => a + (r.comments ?? 0), 0)}`);
    const top = [...reels].sort((a, b) => (b.plays ?? 0) - (a.plays ?? 0) || (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 5);
    if (top.length) {
      out.push("Reel nổi nhất:");
      for (const r of top) out.push(`  - ${blind ? "" : `${r.plays ?? 0} lượt phát, `}${r.likes ?? 0} thích, ${r.comments ?? 0} bình luận — ${r.name}, đăng ${day(new Date(r.posted))}`);
    }
    out.push("");
  }
  out.push("Mức thường được nhắc để Facebook mời kiếm tiền (Meta không công bố chính thức): khoảng 10.000 người theo dõi và 600.000 phút xem trong 60 ngày.");
  return out.join("\n") + "\n";
}

let lastDay = "";
/** Once a day from 08:00: the numbers and the report. */
export async function dailyStats(get: Settings, log: (s: string) => void, now = new Date()): Promise<void> {
  const today = now.toLocaleDateString("sv");
  if (now.getHours() < 8 || lastDay === today) return;
  const all = await snapshots();
  if (all.at(-1) && new Date(all.at(-1)!.at).toLocaleDateString("sv") === today) { lastDay = today; return; }
  const snap = await takeSnapshot(get);
  lastDay = today;
  if (!snap) return;
  const text = reportText(snap, all);
  await fs.writeFile(path.join(STUDIO_DIR, REPORT_FILE), text);
  await putDriveText(REPORT_FILE, text).catch((err) => log(`Facebook: báo cáo chưa lên Drive: ${(err as Error).message}`));
  log(`Facebook: báo cáo ngày ${today} (${Object.values(snap.pages).map((p) => `${p.name} ${p.followers ?? "?"} theo dõi`).join(", ")})`);
}

/** Start the rounds (the studio service, beside the scheduler). */
export function startFacebookSide(get: Settings, log: (s: string) => void): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await commentLinks(get, log); } catch (err) { log(`Facebook: lỗi bình luận link: ${(err as Error).message}`); }
    try { await dailyStats(get, log); } catch (err) { log(`Facebook: lỗi số liệu: ${(err as Error).message}`); }
    running = false;
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 10 * 60_000);
}
