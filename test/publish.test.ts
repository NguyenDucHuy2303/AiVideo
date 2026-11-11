import { test } from "node:test";
import assert from "node:assert/strict";
import { channelOf, nextSlot, PUBLISH_DEFAULTS, toPublish } from "../src/studio/publish.ts";
import { PICK_DEFAULTS } from "../src/studio/pick.ts";
import type { Job } from "../src/studio/jobs.ts";

const job = (extra: Partial<Job> = {}): Job => ({ slug: "x", topic: "x", status: "done", notes: [], history: [{ at: "2026-11-10T01:00:00Z", status: "writing" }], ...extra });

test("a story goes to Huy Kể Chuyện, its English version to Huy Tells Tales, a question to Ask Huy", () => {
  const lines = PICK_DEFAULTS.lines;
  assert.equal(channelOf(job({ kind: "truyền thuyết" }), "long", lines), "huy-ke-chuyen");
  assert.equal(channelOf(job({ kind: "truyền thuyết" }), "en", lines), "huy-tells-tales");
  assert.equal(channelOf(job({ kind: "qa" }), "short", lines), "ask-huy");
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
