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
// (only Shorts leave YouTube since 16/11/2026: films are watched whole on YouTube, not on Facebook)
export const platformsOf = (what: What): Platform[] => (what === "short" ? ["tiktok", "facebook"] : []);

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
/** The video's name in its YouTube title: the first part; a Short titled by its line ("line | name #Shorts"), the last. */
export const postTitle = (meta: Meta, hooked = false) => { const parts = meta.title.replace(/\s*#Shorts\b/i, "").split(" | "); return (hooked && parts.length > 1 ? parts.at(-1)! : parts[0]!).trim(); };

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
 * A line for the parents: on Facebook and TikTok the viewers are the grown-ups (no child under
 * 13 is there), so the post tells them why to show it to their child (16/11/2026). Three of each,
 * one chosen by the title (the same post always says the same, the Page not one line every day).
 */
const PARENT: Record<string, string[]> = {
  story: ["Truyện hay để bố mẹ kể cho bé nghe hôm nay 📖", "Cả nhà cùng xem với bé nhé: truyện ngắn, có bài học hay 💛", "Bố mẹ lưu lại để cho bé xem lúc rảnh nhé 📌"],
  ask: ["Câu hỏi bé hay hỏi bố mẹ, giải thích dễ hiểu trong vài phút 🔍", "Bố mẹ xem cùng bé để trả lời những câu hỏi “vì sao” nhé 💡", "Kiến thức khoa học vui, bố mẹ cho bé xem cùng nhé 🌱"],
  lesson: ["Cho bé học tiếng Anh qua phim hoạt hình vui 🎈", "Bố mẹ cho bé xem rồi cùng nói theo các từ tiếng Anh nhé 🗣️", "Thêm vài từ tiếng Anh mới cho bé mỗi ngày 📚"],
  askEn: ["A fun science question to watch with your kids 🔍", "Parents: an easy answer to a big kid question 💡", "Watch together and learn something new today 🌱"],
  storyEn: ["A Vietnamese folk tale to share with your kids 📖", "Story time: watch it together with your little ones 💛", "Save it for your kids' next story time 📌"],
};
export function parentLine(lang: string, kind: string | undefined, title: string): string {
  const group = lang === "en" ? (kind === "qa" || kind === "fact" ? "askEn" : "storyEn")
    : kind === "lesson" || kind === "episode" ? "lesson" : kind === "qa-vi" || kind === "fact-vi" ? "ask" : "story";
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PARENT[group]![h % 3]!;
}

/**
 * The Facebook caption when the Page writes the link in its first comment (facebook.ts): the
 * YouTube line leaves the caption (a post leading off Facebook is shown to fewer people, and a
 * link in a Reel's caption is not one to tap), a pointer to the comment stands in its place.
 * No YouTube line: undefined (the caption stays as it is).
 */
export function linkToComment(text: string, lang: string): { caption: string; comment: string } | undefined {
  const lines = text.split("\n"), i = lines.findIndex((l) => /https:\/\/(youtu\.be|youtube\.com)\//.test(l));
  if (i < 0) return undefined;
  const comment = lines[i]!.trim();
  lines[i] = lang === "vi" ? "👇 Link xem trên YouTube ở bình luận đầu tiên" : "👇 YouTube link in the first comment";
  return { caption: lines.join("\n"), comment: `${comment} 🎬` };
}

/** Where a post's YouTube link goes until the user pastes it (the studio fills it in then;
 *  Facebook is never posted with it: facebook.ts waits for the link). */
export const LINK_WAIT = "[link YouTube: studio tự điền khi anh dán link video vào trang duyệt]";

/**
 * The words of one post. Every post carries a YouTube link (the user's rule, 16/11/2026): a
 * film's Short the whole film's, a "Did you know?" Short its long version's once that is out,
 * else its own on YouTube (`own`; publish.ts linkOfShort). TikTok makes no link in a caption
 * clickable: the link is written out (to copy) and the profile's (bio) named under it.
 */
export function socialText(platform: Platform, meta: Meta, o: { what: What; kind?: string; channel: string; youtube?: string; link?: string; own?: boolean; isFact?: boolean; hook?: string }): string {
  // A film's Short opens on a line of its own (its posts differ), the film's name under it.
  const vi = meta.lang === "vi", title = o.hook ? `${o.hook}\n${postTitle(meta, true)}` : postTitle(meta), blurb = o.hook ? "" : blurbOf(meta.description);
  const label = o.own ? (vi ? "Xem trên YouTube" : "Watch on YouTube")
    : `${o.isFact ? (vi ? "Xem giải thích đầy đủ" : "Watch the full explanation") : vi ? "Xem trọn phim" : "Watch the whole video"}${vi ? " trên YouTube" : " on YouTube"}`;
  const bio = vi ? `👉 Link bấm được ở trang cá nhân (bio) của kênh ${o.youtube ?? o.channel}` : `👉 Tap the link in our bio (${o.youtube ?? o.channel})`;
  const full = o.what !== "short" ? "" : `${label}: ${o.link ?? LINK_WAIT}${platform === "tiktok" ? `\n${bio}` : ""}`;
  const follow = vi ? `Theo dõi ${o.channel} để cùng bé xem video mới mỗi ngày nhé!` : `Follow ${o.channel} for more videos to watch with your kids!`;
  return [title, blurb, parentLine(meta.lang, o.kind, meta.title), full, follow, hashtagsOf(meta.lang, o.kind, platform).join(" ")].filter(Boolean).join("\n\n").slice(0, 2200);
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
