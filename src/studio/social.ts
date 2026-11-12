/**
 * TikTok and Facebook: the same videos, posted by hand from the phone or the computer. The
 * Shorts (9:16) go to TikTok and Facebook Reels, the film (16:9) to the Facebook Page. Each
 * channel has its own accounts there (Huy Kể Chuyện, Ask Huy). The words come from the YouTube
 * details (publish.ts metaOf): no brain, no tokens.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import type { Meta, What } from "./publish.ts";

export type Platform = "tiktok" | "facebook";
export const PLATFORMS: Platform[] = ["tiktok", "facebook"];
export const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", facebook: "Facebook" };

/** Which platforms a video goes to: a vertical Short to both, a 16:9 film to Facebook only. */
export const platformsOf = (what: What): Platform[] => (what === "short" ? ["tiktok", "facebook"] : ["facebook"]);

/** Hashtags by language and kind: few and plain (TikTok and Facebook rank by them, not by many). */
export function hashtagsOf(lang: string, kind: string | undefined, platform: Platform): string[] {
  let tags: string[];
  if (lang === "en") {
    tags = kind === "qa" || kind === "fact" ? ["#AskHuy", "#DidYouKnow", "#KidsScience", "#FunFacts", "#LearnOnTikTok"]
      : ["#AskHuy", "#HuyTellsTales", "#FolkTales", "#KidsStories", "#Vietnam"];
  } else if (kind === "lesson") tags = ["#HuyKeChuyen", "#HocTiengAnh", "#TiengAnhChoBe", "#hoathinh"];
  else if (kind === "qa-vi" || kind === "fact-vi") tags = ["#HuyKeChuyen", "#HoiHuy", "#BanCoBiet", "#KhoaHocChoBe", "#hoathinh"];
  else {
    const own = { "lịch sử": "#LichSuVietNam", "truyền thuyết": "#TruyenThuyet", "ngụ ngôn": "#NguNgon" }[kind ?? ""] ?? "#TruyenCoTich";
    tags = ["#HuyKeChuyen", own, "#TruyenThieuNhi", "#hoathinh", "#VietNam"];
  }
  if (platform === "facebook") tags = tags.filter((t) => t !== "#LearnOnTikTok").slice(0, 3);
  return tags;
}

/** The video's name for a post: the YouTube title without "#Shorts" and the " | channel" tail. */
export const postTitle = (meta: Meta) => meta.title.replace(/\s*#Shorts\b/i, "").split(" | ")[0]!.trim();

/** One or two sentences of the YouTube description: no link line, no sources, no hashtags. */
export function blurbOf(description: string, max = 220): string {
  const para = description.split(/\n\s*\n/).map((p) => p.trim())
    .find((p) => p && !/^(Xem trọn video|Watch the full video)/.test(p) && !p.startsWith("#") && !/^(Nguồn|Sources)/.test(p));
  if (!para) return "";
  const sentences = para.replace(/\s+/g, " ").split(/(?<=[.!?…])\s+/);
  let out = "";
  for (const s of sentences) {
    if (out && out.length + s.length + 1 > max) break;
    out = out ? `${out} ${s}` : s;
  }
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

/**
 * The words of one post. A Short tells where the whole film is (TikTok shows no links: the
 * channel's name; Facebook: the link once known).
 */
export function socialText(platform: Platform, meta: Meta, o: { what: What; kind?: string; channel: string; longUrl?: string; isFact?: boolean; hook?: string }): string {
  // A film's Short opens on a line of its own (its posts differ), the film's name under it.
  const vi = meta.lang === "vi", title = o.hook ? `${o.hook}\n${postTitle(meta)}` : postTitle(meta), blurb = o.hook ? "" : blurbOf(meta.description);
  const full = o.what === "short" && !o.isFact
    ? platform === "facebook" && o.longUrl ? (vi ? `Xem trọn phim: ${o.longUrl}` : `Watch the whole video: ${o.longUrl}`)
      : vi ? `Xem trọn phim trên YouTube: ${o.channel}` : `Watch the whole video on YouTube: ${o.channel}`
    : "";
  const follow = vi ? `Theo dõi ${o.channel} để xem thêm nhé!` : `Follow ${o.channel} for more!`;
  return [title, blurb, full, follow, hashtagsOf(meta.lang, o.kind, platform).join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
}

/** What to set when posting, the same for every video of the platform. */
export const SETTINGS_VI: Record<Platform, string[]> = {
  tiktok: [
    "- Đăng bằng tài khoản TikTok của kênh (ghi ở dòng TÀI KHOẢN).",
    "- Nhãn \"Nội dung do AI tạo\" (AI-generated content): BẬT (giọng đọc là giọng AI).",
    "- Ảnh bìa: chọn khung hình đẹp trong video. Không cần nhạc thêm: video đã có nhạc.",
    "- Hẹn giờ: TikTok trên máy tính (tiktok.com/upload) đặt giờ được, tối đa 10 ngày trước.",
  ],
  facebook: [
    "- Đăng lên TRANG (Page) của kênh, không phải trang cá nhân.",
    "- Short: đăng dạng Reel. Video dài: đăng dạng Video.",
    "- Thông tin AI (AI info): BẬT (giọng đọc là giọng AI).",
    "- Hẹn giờ: Meta Business Suite (business.facebook.com) → Tạo bài viết → Lên lịch.",
  ],
};

interface CaptionCue { text: string; who?: string }

/** The line a Short opens its post with: a spoken line that calls out (! ?), else the first told one. */
export function hookOf(cues: CaptionCue[]): string | undefined {
  const clean = (t: string) => t.replace(/\s+/g, " ").trim();
  const said = cues.filter((c) => c.who).map((c) => clean(c.text)).find((t) => /[!?]$/.test(t) && t.length >= 12 && t.length <= 90);
  if (said) return `“${said}”`;
  return cues.map((c) => clean(c.text)).find((t) => t.length >= 20 && t.length <= 110);
}

/**
 * Each Short's opening line, from the scenes it was cut from: its file in the job folder is a
 * hard link of projects/<slug>/out/…-short-<a>-<b>_9x16.mp4 (scenes a to b), or, for a question
 * film's planned first Short, the scenes of plan.json "shorts".
 */
export async function shortHooks(slug: string, shorts: string[], jobDir: string, planned?: number[]): Promise<(string | undefined)[]> {
  const project = path.join(ROOT, "projects", slug);
  const timeline = await fs.readFile(path.join(project, "timeline.json"), "utf8").then(JSON.parse).catch(() => undefined) as { scenes: { captionCues?: CaptionCue[] }[] } | undefined;
  if (!timeline) return shorts.map(() => undefined);
  const outs = await fs.readdir(path.join(project, "out")).catch(() => [] as string[]);
  const byInode = new Map<number, string>();
  for (const f of outs.filter((x) => /-short-[\d-]+_9x16\.mp4$/.test(x))) {
    const st = await fs.stat(path.join(project, "out", f)).catch(() => undefined);
    if (st) byInode.set(st.ino, f);
  }
  return Promise.all(shorts.map(async (file, i) => {
    let scenes: number[] | undefined;
    if (i === 0 && planned?.length) scenes = planned;
    else {
      const ino = (await fs.stat(path.join(jobDir, file)).catch(() => undefined))?.ino, name = ino ? byInode.get(ino) : undefined;
      const m = name && /-short-(\d+)-(\d+)_9x16\.mp4$/.exec(name);
      if (m) scenes = Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, k) => Number(m[1]) + k);
    }
    return scenes ? hookOf(scenes.flatMap((n) => timeline.scenes[n - 1]?.captionCues ?? [])) : undefined;
  }));
}
