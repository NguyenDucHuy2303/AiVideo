import { test } from "node:test";
import assert from "node:assert/strict";
import { dueAutoApprove, problemsOf, spans, waitingSince } from "../src/studio/autoreview.ts";
import type { Job } from "../src/studio/jobs.ts";

const job = (extra: Partial<Job> = {}): Job => ({ slug: "x", topic: "x", status: "video", notes: [], history: [
  { at: "2026-11-10T01:00:00Z", status: "writing" }, { at: "2026-11-11T20:00:00Z", status: "video" },
], ...extra });

test("auto-approve: only a video waiting long enough, never when off", () => {
  assert.equal(waitingSince(job())?.toISOString(), "2026-11-11T20:00:00.000Z");
  assert.ok(!dueAutoApprove(job(), 12, new Date("2026-11-12T07:59:00Z")));
  assert.ok(dueAutoApprove(job(), 12, new Date("2026-11-12T08:00:00Z")));
  assert.ok(!dueAutoApprove(job(), 0, new Date("2026-11-20T00:00:00Z")), "0 hours: off");
  assert.ok(!dueAutoApprove(job({ status: "done" }), 12, new Date("2026-11-20T00:00:00Z")));
  // Waiting counts from the last time it came back to "video" (after a fix).
  const fixed = job({ history: [...job().history, { at: "2026-11-12T01:00:00Z", status: "fix" }, { at: "2026-11-12T10:00:00Z", status: "video" }] });
  assert.ok(!dueAutoApprove(fixed, 12, new Date("2026-11-12T20:00:00Z")));
});

test("detector spans: closed ones, and one still open at the end", () => {
  const log = "[freezedetect] lavfi.freezedetect.freeze_start: 10\n[freezedetect] lavfi.freezedetect.freeze_end: 22.5\n[freezedetect] lavfi.freezedetect.freeze_start: 95\n";
  assert.deepEqual(spans(log, "freeze", 100), [12.5, 5]);
  assert.deepEqual(spans("[blackdetect] black_start:3 black_end:6.5 black_duration:3.5", "black", 50), [3.5]);
  assert.deepEqual(spans("silence_start: 4\nsilence_end: 6 | silence_duration: 2", "silence", 50), [2]);
});

test("machine check: a clean film passes; black, freeze, silence, wrong shape, no sound fail", () => {
  const ok = { fact: false, width: 1920, height: 1080, hasAudio: true, seconds: 390, log: "mean_volume: -17.4 dB" };
  assert.deepEqual(problemsOf(ok), []);
  assert.deepEqual(problemsOf({ ...ok, fact: true, width: 1080, height: 1920, seconds: 50 }), []);
  assert.equal(problemsOf({ ...ok, log: "black_start:100 black_end:104 black_duration:4\nfreeze_start: 200\nfreeze_end: 215\nsilence_start: 300\nsilence_end: 308\nmean_volume: -17 dB" }).length, 3);
  assert.match(problemsOf({ ...ok, width: 1080, height: 1920 })[0]!, /sai chiều/);
  assert.ok(problemsOf({ ...ok, hasAudio: false }).includes("không có tiếng"));
  assert.match(problemsOf({ ...ok, seconds: 40 })[0]!, /bất thường/);
  assert.match(problemsOf({ ...ok, log: "mean_volume: -50.2 dB" })[0]!, /quá nhỏ/);
  // Short black or frozen bits (a fade, a held pose) are fine.
  assert.deepEqual(problemsOf({ ...ok, log: "black_start:0 black_end:1.6 black_duration:1.6\nfreeze_start: 5\nfreeze_end: 13\nmean_volume: -18 dB" }), []);
});
