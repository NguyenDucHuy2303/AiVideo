import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryOf, channelOf, nextSlot, PUBLISH_DEFAULTS, seriesOf, toPublish } from "../src/studio/publish.ts";
import { PICK_DEFAULTS } from "../src/studio/pick.ts";
import type { Job } from "../src/studio/jobs.ts";

const job = (extra: Partial<Job> = {}): Job => ({ slug: "x", topic: "x", status: "done", notes: [], history: [{ at: "2026-11-10T01:00:00Z", status: "writing" }], ...extra });

test("two channels: everything Vietnamese on Huy Kể Chuyện, everything English on Ask Huy", () => {
  const lines = PICK_DEFAULTS.lines;
  assert.equal(channelOf(job({ kind: "truyền thuyết" }), "long", lines), "huy-ke-chuyen");
  assert.equal(channelOf(job({ kind: "truyền thuyết" }), "en", lines), "ask-huy");
  assert.equal(channelOf(job({ kind: "qa" }), "short", lines), "ask-huy");
  assert.equal(channelOf(job({ kind: "fact" }), "short", lines), "ask-huy");
  for (const kind of ["qa-vi", "fact-vi", "lesson", "ngụ ngôn", "lịch sử"]) assert.equal(channelOf(job({ kind }), "long", lines), "huy-ke-chuyen", kind);
  // (older settings still naming the merged channels)
  const old = lines.map((l) => (l.id === "hoc-tieng-anh" ? { ...l, channel: "hoi-huy" } : l));
  assert.equal(channelOf(job({ kind: "lesson" }), "long", old), "huy-ke-chuyen");
});

test("each video's category and playlist come from its series", () => {
  assert.equal(categoryOf(job({ kind: "truyền thuyết" })), "1");
  assert.equal(categoryOf(job({ kind: "qa-vi" })), "27");
  assert.equal(categoryOf(job({ kind: "lesson" })), "27");
  assert.equal(seriesOf(job({ kind: "truyền thuyết" }), "long"), "Truyền thuyết Việt Nam");
  assert.equal(seriesOf(job({ kind: "truyền thuyết" }), "en"), "Huy Tells Tales: Vietnamese Folk Tales");
  assert.equal(seriesOf(job({ kind: "truyền thuyết" }), "short"), undefined);
  assert.equal(seriesOf(job({ kind: "qa-vi" }), "long"), "Hỏi Huy");
  assert.equal(seriesOf(job({ kind: "fact-vi" }), "short"), "Bạn có biết? (Shorts)");
  assert.equal(seriesOf(job({ kind: "lesson" }), "long"), "Học tiếng Anh cùng Huy");
});

test("the next publishing time: at least two hours ahead, never one already taken", () => {
  const cfg = { ...PUBLISH_DEFAULTS["huy-ke-chuyen"]!, long: ["18:00"] };
  const now = new Date(2026, 10, 11, 17, 0);
  const first = nextSlot(cfg, "long", [], now)!;
  assert.equal(first.getDate(), 12); // 18:00 today is less than two hours away
  assert.equal(first.getHours(), 18);
  const second = nextSlot(cfg, "long", [first.toISOString()], now)!;
  assert.equal(second.getDate(), 13);
  assert.equal(nextSlot({ ...cfg, shorts: [] }, "short", [], now), undefined);
});

test("only approved films are published: the film first, its Shorts after it, nothing while held", () => {
  assert.deepEqual(toPublish(job({ status: "video" }), ["video.mp4"]), []);
  assert.deepEqual(toPublish(job({ shorts: ["shorts/1.mp4"] }), ["video.mp4"]).map((x) => x.what), ["long"]);
  const long = { videoId: "a", url: "u", publishAt: "t", channel: "c", at: "t" };
  assert.deepEqual(toPublish(job({ shorts: ["shorts/1.mp4"], published: { long } }), ["video.mp4", "video.en.mp4"]).map((x) => x.what), ["en", "short"]);
  assert.deepEqual(toPublish(job({ publishHold: true }), ["video.mp4"]), []);
});

test("a Did-you-know Short is published as a Short, once", () => {
  assert.deepEqual(toPublish(job({ kind: "fact" }), ["video.mp4"]).map((x) => x.what), ["short"]);
  const s = { videoId: "a", url: "u", publishAt: "t", channel: "c", at: "t" };
  assert.deepEqual(toPublish(job({ kind: "fact", published: { shorts: [s] } }), ["video.mp4"]), []);
});

import { dueCheck, normalise, takenTimes, uploadSheet, verdict, videoIdOf, type Published } from "../src/studio/publish.ts";

test("channel modes: old settings read as modes; only the two channels, manual by default", () => {
  const s = normalise({ "ask-huy": { enabled: true, category: "27" } as never, "huy-ke-chuyen": { enabled: false } as never, "hoi-huy": { mode: "off" } as never });
  assert.equal(s["ask-huy"]!.mode, "auto");
  assert.equal(s["huy-ke-chuyen"]!.mode, "manual");
  assert.deepEqual(Object.keys(s).sort(), ["ask-huy", "huy-ke-chuyen"]);
  assert.equal(normalise({})["ask-huy"]!.mode, "manual");
  assert.equal("enabled" in s["ask-huy"]!, false);
  assert.equal("category" in s["ask-huy"]!, false);
  assert.deepEqual(s["ask-huy"]!.long, PUBLISH_DEFAULTS["ask-huy"]!.long);
});

test("the video id in any YouTube link the user pastes", () => {
  for (const link of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share", "https://studio.youtube.com/video/dQw4w9WgXcQ/edit", " dQw4w9WgXcQ "]) assert.equal(videoIdOf(link), "dQw4w9WgXcQ", link);
  assert.equal(videoIdOf("https://www.youtube.com/@askhuy"), undefined);
  assert.equal(videoIdOf("không phải link"), undefined);
});

test("an auto upload is looked at half an hour after its hour, every 30 minutes, until seen public", () => {
  const p: Published = { videoId: "a", url: "u", publishAt: "2026-11-12T10:00:00Z", channel: "ask-huy", at: "t" };
  assert.equal(dueCheck(p, new Date("2026-11-12T10:20:00Z")), false);
  assert.equal(dueCheck(p, new Date("2026-11-12T10:31:00Z")), true);
  assert.equal(dueCheck({ ...p, lastCheck: "2026-11-12T10:31:00Z" }, new Date("2026-11-12T10:50:00Z")), false);
  assert.equal(dueCheck({ ...p, lastCheck: "2026-11-12T10:31:00Z" }, new Date("2026-11-12T11:02:00Z")), true);
  assert.equal(dueCheck({ ...p, checked: "x" }, new Date("2026-11-13T00:00:00Z")), false);
  assert.equal(dueCheck({ ...p, manual: true }, new Date("2026-11-13T00:00:00Z")), false);
  assert.equal(verdict({ privacyStatus: "public", uploadStatus: "processed" }), "public");
  assert.equal(verdict({ privacyStatus: "private", uploadStatus: "processed" }), "locked");
  assert.equal(verdict({ privacyStatus: "private", uploadStatus: "rejected" }), "failed");
  assert.equal(verdict(undefined), "gone");
});

test("the sheet beside an exported video, and its time kept from other videos", () => {
  const cfg = { ...PUBLISH_DEFAULTS["ask-huy"]! };
  const txt = uploadSheet({ title: "Why is the sky blue? | Ask Huy", description: "Light from the Sun…", tags: ["Ask Huy", "kids science"], categoryId: "27", lang: "en", playlist: "Ask Huy: Big Questions" }, cfg, "long", new Date(2026, 10, 13, 17, 0), true);
  for (const want of ["KÊNH: Ask Huy", "17:00 Thứ Sáu 13/11/2026", "Why is the sky blue? | Ask Huy", "Ask Huy, kids science", "dành cho trẻ em", "Giáo dục", "Tiếng Anh", "anh-bia.jpg", "Danh sách phát: Ask Huy: Big Questions"]) assert.ok(txt.includes(want), want);
  const ex = { dir: "/x", publishAt: "2026-11-13T10:00:00.000Z", channel: "ask-huy", at: "t" };
  assert.deepEqual(takenTimes([job({ exported: { long: ex } })], "ask-huy"), [ex.publishAt]);
  assert.deepEqual(takenTimes([job({ exported: { long: ex } })], "huy-ke-chuyen"), []);
});

test("a Short goes public after its film, never before", () => {
  const cfg = { ...PUBLISH_DEFAULTS["ask-huy"]!, shorts: ["12:00", "15:00", "19:30"] };
  const now = new Date(2026, 10, 12, 9, 0), film = new Date(2026, 10, 12, 17, 0).toISOString();
  const at = nextSlot(cfg, "short", [], now, film)!;
  assert.equal(at.getDate(), 12);
  assert.equal(at.getHours(), 19);
});
