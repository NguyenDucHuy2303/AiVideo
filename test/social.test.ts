import { test } from "node:test";
import assert from "node:assert/strict";
import { blurbOf, hashtagsOf, hookOf, platformsOf, postTitle, socialText } from "../src/studio/social.ts";
import { hostAllowed, isLoopback, lanAddress } from "../src/studio/phone.ts";
import type { Meta } from "../src/studio/publish.ts";

const meta = (extra: Partial<Meta> = {}): Meta => ({
  title: "Sơn Tinh – Thủy Tinh #Shorts", lang: "vi", tags: [], categoryId: "1",
  description: "Xem trọn video: https://youtu.be/abcdefghijk\n\nVua Hùng kén rể cho Mị Nương. Hai chàng đến cầu hôn. Ai mang lễ trước thì được cưới.\n\nNguồn tư liệu:\n- x: y\n\n#HuyKeChuyen",
  ...extra,
});

test("posts: a Short goes to TikTok and Facebook, a film to Facebook only", () => {
  assert.deepEqual(platformsOf("short"), ["tiktok", "facebook"]);
  assert.deepEqual(platformsOf("long"), ["facebook"]);
  assert.deepEqual(platformsOf("en"), ["facebook"]);
});

test("post title: no #Shorts, no ' | channel' tail", () => {
  assert.equal(postTitle(meta()), "Sơn Tinh – Thủy Tinh");
  assert.equal(postTitle(meta({ title: "Why is the sky blue? | Ask Huy" })), "Why is the sky blue?");
});

test("blurb: the first story paragraph, whole sentences, no link or sources", () => {
  assert.equal(blurbOf(meta().description), "Vua Hùng kén rể cho Mị Nương. Hai chàng đến cầu hôn. Ai mang lễ trước thì được cưới.");
  assert.equal(blurbOf(meta().description, 40), "Vua Hùng kén rể cho Mị Nương.");
  assert.equal(blurbOf("#tags only"), "");
});

test("hashtags: by language and kind, fewer on Facebook, no TikTok tag there", () => {
  assert.ok(hashtagsOf("vi", "lịch sử", "tiktok").includes("#LichSuVietNam"));
  assert.ok(hashtagsOf("vi", "fact-vi", "tiktok").includes("#BanCoBiet"));
  assert.ok(hashtagsOf("en", "qa", "tiktok").includes("#LearnOnTikTok"));
  const fb = hashtagsOf("en", "qa", "facebook");
  assert.equal(fb.length, 3);
  assert.ok(!fb.includes("#LearnOnTikTok"));
});

test("a Short's post: its own line first, where the film is (a link on Facebook only)", () => {
  const o = { what: "short" as const, kind: "truyền thuyết", channel: "Huy Kể Chuyện", hook: "“Chặn nước lại!”" };
  const tt = socialText("tiktok", meta(), { ...o, longUrl: "https://youtu.be/abcdefghijk" });
  assert.ok(tt.startsWith("“Chặn nước lại!”\nSơn Tinh – Thủy Tinh"));
  assert.ok(tt.includes("Xem trọn phim trên YouTube: Huy Kể Chuyện"));
  assert.ok(!tt.includes("https://"), "TikTok shows no links");
  assert.ok(!tt.includes("Vua Hùng"), "the hook stands for the blurb");
  const fb = socialText("facebook", meta(), { ...o, longUrl: "https://youtu.be/abcdefghijk" });
  assert.ok(fb.includes("Xem trọn phim: https://youtu.be/abcdefghijk"));
  // A fact Short is whole: no "watch the film".
  const fact = socialText("tiktok", meta({ lang: "en", title: "Wombat poop is a cube? #Shorts", description: "Wombats make cube poop." }), { what: "short", kind: "fact", channel: "Ask Huy", isFact: true });
  assert.ok(!/whole video/.test(fact));
  assert.ok(fact.includes("Follow Ask Huy for more!"));
});

test("hook: a called-out spoken line, else the first told one", () => {
  assert.equal(hookOf([{ text: "Ngày xưa có một ông vua hiền." }, { text: "Đồi núi ơi, mọc lên!", who: "Sơn Tinh" }]), "“Đồi núi ơi, mọc lên!”");
  assert.equal(hookOf([{ text: "Ngày xưa có một ông vua hiền." }, { text: "Ừ.", who: "A" }]), "Ngày xưa có một ông vua hiền.");
  assert.equal(hookOf([]), undefined);
});

test("phone: the home network address, not Docker's bridges", () => {
  const a = (address: string, internal = false) => ({ address, family: "IPv4" as const, internal, netmask: "", mac: "", cidr: null });
  assert.equal(lanAddress({ lo: [a("127.0.0.1", true)], docker0: [a("172.17.0.1")], "br-a3f4": [a("172.18.0.1")], eno1: [a("192.168.100.107")] }), "192.168.100.107");
  assert.equal(lanAddress({ wlp2s0: [a("10.0.0.5")] }), "10.0.0.5");
  assert.equal(lanAddress({ lo: [a("127.0.0.1", true)] }), undefined);
});

test("phone: only this computer's own names as Host; loopback is the computer", () => {
  assert.ok(hostAllowed("127.0.0.1:5175", "192.168.1.9"));
  assert.ok(hostAllowed("localhost:5175", undefined));
  assert.ok(hostAllowed("192.168.1.9:5175", "192.168.1.9"));
  assert.ok(hostAllowed("[::1]:5175", undefined));
  assert.ok(!hostAllowed("evil.example:5175", "192.168.1.9"));
  assert.ok(!hostAllowed(undefined, "192.168.1.9"));
  assert.ok(isLoopback("::ffff:127.0.0.1") && isLoopback("127.0.0.1") && !isLoopback("192.168.1.20"));
});

import { postState } from "../src/studio/publish.ts";
import type { Job } from "../src/studio/jobs.ts";

test("post stage: preparing, ready, downloaded, partly posted, posted everywhere", () => {
  const files = ["video.mp4", "thumbnail.jpg"];
  const base: Job = { slug: "x", topic: "x", kind: "truyền thuyết", status: "done", notes: [], history: [] };
  assert.equal(postState({ ...base, status: "video" }, files), undefined);
  assert.equal(postState(base, files)!.stage, "preparing", "Shorts not cut yet");
  const job: Job = { ...base, shorts: ["shorts/1.mp4"] };
  const s0 = postState(job, files)!;
  assert.equal(s0.stage, "ready");
  // film: YouTube + Facebook; Short: YouTube + TikTok + Facebook
  assert.deepEqual(s0.by, { youtube: [0, 2], tiktok: [0, 1], facebook: [0, 2] });
  assert.equal(postState({ ...job, downloaded: { "shorts/1.mp4": "t" } }, files)!.stage, "downloaded");
  const pub = { videoId: "abcdefghijk", url: "u", publishAt: "t", channel: "huy-ke-chuyen", at: "t" };
  assert.equal(postState({ ...job, published: { long: pub } }, files)!.stage, "partial");
  const all: Job = { ...job, published: { long: pub, shorts: [pub] }, social: { "tiktok:short:0": "t", "facebook:short:0": "t", "facebook:long:0": "t" } };
  const s = postState(all, files)!;
  assert.equal(s.stage, "all");
  assert.equal(s.posted, s.slots);
});

import { thumbMoments } from "../src/animation/story.ts";
import { thumbVariants } from "../src/studio/publish.ts";

test("thumbnails: three moments apart, one per character (the leads first, a strong face), never on a board", () => {
  const c = (from: number, to: number, who: string, mood?: string) => ({ text: "x", from, to, who, mood });
  const lines = [c(10, 12, "A", "angry"), c(12, 16, "A", "shout"), c(40, 43, "B", "happy"), c(70, 75, "C"), c(100, 104, "B", "surprised")];
  // B speaks most (7 s): its longest strong line; then A (6 s), then C
  assert.deepEqual(thumbMoments(lines, 120), [102, 14, 72.5]);
  // the given moment first; A's line at 14 is too near it (15 s apart at least in a 2-minute film)
  assert.deepEqual(thumbMoments(lines, 120, { at: 3 }), [3, 102, 72.5]);
  // B's line at 100–104 sits on a board: not used
  assert.deepEqual(thumbMoments(lines, 120, { at: 3, avoid: [[95, 110]] }), [3, 41.5, 72.5]);
  assert.equal(thumbMoments([], 60).length, 3, "no lines: points through the film");
  assert.deepEqual(thumbMoments(lines, 120, { at: 3, avoid: [[0, 5]] }), [102, 14, 72.5], "the given moment on a board: dropped");
});

test("thumbnail variants: -2 and -3 beside the main one, English too", () => {
  const files = ["thumbnail.jpg", "thumbnail-2.jpg", "thumbnail-3.jpg", "thumbnail.en.jpg", "thumbnail-2.en.jpg"];
  assert.deepEqual(thumbVariants("thumbnail.jpg", files), ["thumbnail-2.jpg", "thumbnail-3.jpg"]);
  assert.deepEqual(thumbVariants("thumbnail.en.jpg", files), ["thumbnail-2.en.jpg"]);
});
