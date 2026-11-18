import { test } from "node:test";
import assert from "node:assert/strict";
import { approvedToday, lineOf, PICK_DEFAULTS, proposerOf, type Line } from "../src/studio/pick.ts";
import { gestures } from "../src/studio/qaproduce.ts";
import type { Job } from "../src/studio/jobs.ts";

const job = (kind: string | undefined, history: Job["history"] = [{ at: "2026-11-10T01:00:00Z", status: "writing" }]): Job =>
  ({ slug: "x", topic: "x", kind, status: "review", notes: [], history });

test("jobs fall into content lines by kind; a line without kinds takes the rest", () => {
  const lines = PICK_DEFAULTS.lines;
  assert.equal(lineOf(job("qa"), lines)?.id, "ask-huy");
  assert.equal(lineOf(job("truyền thuyết"), lines)?.id, "huy-ke-chuyen");
  assert.equal(lineOf(job(undefined), lines)?.id, "huy-ke-chuyen");
  const more: Line[] = [{ id: "shorts", name: "Shorts", kinds: ["short"], perDay: 1 }, ...lines];
  assert.equal(lineOf(job("short"), more)?.id, "shorts");
});

test("approved today counts the user's and the pick's approvals of that day only", () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  assert.equal(approvedToday(job("qa", [{ at: today.toISOString(), status: "approved" }])), true);
  assert.equal(approvedToday(job("qa", [{ at: yesterday.toISOString(), status: "approved" }])), false);
  assert.equal(approvedToday(job("qa", [{ at: today.toISOString(), status: "review" }])), false);
});

test("a presenter points in the middle of a scene, not the whole time", () => {
  const g = gestures("huy", { do: "point", face: "happy" }, 8);
  assert.deepEqual(g.map((a) => a.do), ["talk", "point", "talk"]);
  assert.deepEqual(gestures("huy", { do: "point", face: "happy" }, 2).map((a) => a.do), ["point"]);
  assert.deepEqual(gestures("boi", { do: "cheer", face: "joy" }, 8).map((a) => a.do), ["cheer"]);
});

test("each line finds topics its own way; old settings without it are inferred from the kinds", () => {
  assert.equal(proposerOf({ id: "a", name: "A", kinds: ["qa"], perDay: 1 }), "questions");
  assert.equal(proposerOf({ id: "b", name: "B", perDay: 1 }), "stories");
  assert.equal(proposerOf({ id: "c", name: "C", kinds: ["qa"], perDay: 1, propose: "stories" }), "stories");
});

import { needToday, weekly } from "../src/studio/pick.ts";
import { occasionOf, upcoming } from "../src/studio/trends.ts";

const approvedOn = (d: string): Job => job("qa", [{ at: "2026-11-01T01:00:00Z", status: "review" }, { at: `${d}T10:00:00`, status: "approved" }]);

test("videos a week: no more than the week allows, spread out; without it, perDay × 7", () => {
  const now = new Date("2026-11-12T17:00:00");
  const three: Line = { id: "a", name: "A", perDay: 1, perWeek: 3 };
  assert.equal(weekly(three), 3);
  assert.equal(weekly({ id: "b", name: "B", perDay: 1 }), 7);
  assert.equal(needToday(three, [], now), 1);
  assert.equal(needToday(three, [approvedOn("2026-11-11")], now), 0, "yesterday's: not yet (every 2 days)");
  assert.equal(needToday(three, [approvedOn("2026-11-10")], now), 1, "two days ago: its turn");
  assert.equal(needToday(three, [approvedOn("2026-11-06"), approvedOn("2026-11-08"), approvedOn("2026-11-10")], now), 0, "three in the last 7 days");
  assert.equal(needToday(three, [approvedOn("2026-11-04"), approvedOn("2026-11-08"), approvedOn("2026-11-10")], now), 1, "the oldest is out of the week");
  assert.equal(needToday(three, [approvedOn("2026-11-12")], now), 0, "one approved today");
  assert.equal(needToday({ id: "c", name: "C", perDay: 1, perWeek: 14 }, [approvedOn("2026-11-12")], now), 1, "two a day");
  assert.equal(needToday({ id: "d", name: "D", perDay: 1, perWeek: 0 }, [], now), 0, "off");
});

test("occasions: a topic is for one only in the weeks before it", () => {
  const now = new Date("2026-11-12T10:00:00");
  assert.deepEqual(upcoming(now, 14).map((u) => [u.key, u.left]), [["teachers", 8]]);
  const t = occasionOf("Đồ dùng học tập (dịp Ngày Nhà giáo Việt Nam)", now)!;
  assert.equal(t.key, "teachers");
  assert.equal(t.date, "2026-11-20");
  assert.equal(occasionOf("Why do reindeer have antlers?", now), undefined, "Christmas: more than five weeks off");
  assert.equal(occasionOf("Why do reindeer have antlers?", new Date("2026-12-01T10:00:00"))?.key, "christmas");
  assert.equal(occasionOf("Sơn Tinh – Thủy Tinh, thời vua Hùng", now), undefined, "Giỗ Tổ is months away");
  assert.equal(occasionOf("Sơn Tinh – Thủy Tinh, thời vua Hùng", new Date("2027-04-01T10:00:00"))?.key, "gio-to");
  assert.equal(occasionOf("Tết Trung Thu", now), undefined, "Trung Thu is not Tết Nguyên Đán");
  assert.equal(occasionOf("Bánh chưng bánh giầy", new Date("2027-01-20T10:00:00"))?.key, "tet");
});

test("before the weekend off, a daily line approves the weekend's films on Thursday", () => {
  const daily: Line = { id: "q", name: "Q", perDay: 1, perWeek: 7 };
  assert.equal(needToday(daily, [], new Date(2026, 10, 19, 17), [0, 6]), 3, "Thursday: Friday's turn plus Saturday's and Sunday's");
  assert.equal(needToday(daily, [], new Date(2026, 10, 18, 17), [0, 6]), 1, "Wednesday: one");
  assert.equal(needToday(daily, [], new Date(2026, 10, 19, 17)), 1, "no days off: one");
});

import { needAhead, pending } from "../src/studio/pick.ts";
test("a line keeps its videos ready days ahead: it approves more while behind, then only what is posted", () => {
  const now = new Date("2026-11-17T10:00:00Z"), daily = { id: "a", name: "A", perDay: 1, perWeek: 7 };
  const j = (status: string, o: Partial<Job> = {}): Job => ({ slug: "x", topic: "x", kind: "qa", status: status as Job["status"], notes: [], history: [], ...o });
  assert.equal(needAhead(daily, [], now, 3), 3, "nothing ready: three today (at most)");
  assert.equal(needAhead(daily, [j("producing"), j("video")], now, 3), 2);
  assert.equal(needAhead(daily, [j("done"), j("done"), j("approved"), j("producing")], now, 3), 0, "four days ready");
  const out = { videoId: "v", url: "u", publishAt: "2026-11-16T12:00:00Z", channel: "c", at: "t" };
  assert.equal(pending(j("done", { published: { long: out } }), now), false, "already out on YouTube");
  assert.equal(pending(j("done", { published: { long: { ...out, publishAt: "2026-11-19T12:00:00Z" } } }), now), true, "scheduled for later");
  assert.equal(pending(j("failed"), now), false);
  assert.equal(pending(j("done", { publishHold: true }), now), false, "held back: not coming out, does not stop the line");
  assert.equal(needAhead({ id: "b", name: "B", perDay: 1, perWeek: 2 }, [], now, 3), 2, "two a week: two ready");
});

test("a video with its YouTube link is not made again", async () => {
  const { onYouTube } = await import("../src/studio/jobs.ts");
  const base = { slug: "x", topic: "x", status: "done", notes: [], history: [] } as unknown as Job;
  const rec = { videoId: "v", url: "https://youtu.be/v", publishAt: "t", channel: "c", at: "t" };
  assert.equal(onYouTube({ ...base, kind: "qa" }), false);
  assert.equal(onYouTube({ ...base, kind: "qa", published: { long: rec } }), true);
  assert.equal(onYouTube({ ...base, kind: "qa", published: { shorts: [rec] } }), false, "only its Shorts are up: the film is not");
  assert.equal(onYouTube({ ...base, kind: "fact", published: { shorts: [rec] } }), true, "a Did-you-know Short is its own video");
});
