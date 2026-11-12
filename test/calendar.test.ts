import { test } from "node:test";
import assert from "node:assert/strict";
import { calendar, calendarText, entriesOf } from "../src/studio/calendar.ts";
import { lastPosted } from "../src/studio/drive.ts";
import type { Job } from "../src/studio/jobs.ts";
import type { PublishSettings } from "../src/studio/publish.ts";

const SETTINGS = { "huy-ke-chuyen": { name: "Huy Kể Chuyện", lang: "vi", long: ["19:30"], shorts: ["07:30"], mode: "manual" } } as PublishSettings;
const NOW = new Date(2026, 10, 12, 18, 0);
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const ex = (publishAt: string) => ({ dir: "/home/x/youtube/Ếch ngồi đáy giếng", publishAt, channel: "huy-ke-chuyen", at: at(12, 9) });

const job = (extra: Partial<Job> = {}): Job => ({
  slug: "ech", topic: "Ếch ngồi đáy giếng", kind: "ngụ ngôn", status: "done", notes: [], history: [],
  exported: { long: ex(at(12, 19, 30)), shorts: [ex(at(13, 7, 30)), ex(at(14, 7, 30))] }, ...extra,
});

test("a laid-out film and its Shorts are on the calendar by their YouTube times", () => {
  const es = entriesOf(job(), SETTINGS, NOW);
  assert.deepEqual(es.map((e) => [e.label, e.file]), [["Video dài", "video-dai.mp4"], ["Short 1", "short-1.mp4"], ["Short 2", "short-2.mp4"]]);
  assert.equal(es[0]!.folder, "Ếch ngồi đáy giếng");
  assert.equal(es[0]!.channelName, "Huy Kể Chuyện");
  // A film goes to Facebook too, a Short to TikTok and Facebook.
  assert.deepEqual(es[0]!.social, { facebook: false });
  assert.deepEqual(es[1]!.social, { tiktok: false, facebook: false });
});

test("past its time and not on YouTube: late; posted: its link, not late", () => {
  const posted = job({ published: { long: { videoId: "abcdefghijk", url: "https://youtu.be/abcdefghijk", publishAt: at(11, 19, 30), channel: "huy-ke-chuyen", at: at(11, 12) } }, exported: { long: ex(at(11, 19, 30)) } });
  assert.equal(entriesOf(posted, SETTINGS, NOW)[0]!.late, false);
  assert.equal(entriesOf(posted, SETTINGS, NOW)[0]!.url, "https://youtu.be/abcdefghijk");
  const late = job({ exported: { long: ex(at(11, 19, 30)) } });
  assert.equal(entriesOf(late, SETTINGS, NOW)[0]!.late, true);
});

test("the calendar keeps today and the next days, plus late ones, in time order", () => {
  const far = job({ slug: "far", exported: { long: ex(at(30, 19, 30)) } });
  const late = job({ slug: "late", exported: { long: ex(at(10, 19, 30)) } });
  const es = calendar([job(), far, late], SETTINGS, { now: NOW, days: 7 });
  assert.deepEqual(es.map((e) => e.slug + ":" + e.label), ["late:Video dài", "ech:Video dài", "ech:Short 1", "ech:Short 2"]);
});

test("the text calendar puts late videos first and says what is left to post", () => {
  const t = calendarText(calendar([job(), job({ slug: "late", exported: { long: ex(at(10, 19, 30)) } })], SETTINGS, { now: NOW }), NOW);
  assert.match(t, /ĐÃ QUÁ GIỜ/);
  assert.ok(t.indexOf("ĐÃ QUÁ GIỜ") < t.indexOf("── Thứ Năm 12/11 ──"));
  assert.match(t, /Ếch ngồi đáy giếng \/ short-1\.mp4/);
  assert.match(t, /cần đăng: YouTube, TikTok, Facebook/);
});

test("a topic was last posted at its latest YouTube or TikTok / Facebook mark", () => {
  const j = job({ published: { long: { videoId: "a", url: "u", publishAt: at(11, 19), channel: "c", at: at(11, 20) } }, social: { "tiktok:short:0": at(13, 8) } });
  assert.equal(lastPosted(j), new Date(at(13, 8)).getTime());
  assert.equal(lastPosted(job()), 0);
});
