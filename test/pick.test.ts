import { test } from "node:test";
import assert from "node:assert/strict";
import { approvedToday, lineOf, PICK_DEFAULTS, type Line } from "../src/studio/pick.ts";
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
  assert.deepEqual(gestures("mai", { do: "cheer", face: "joy" }, 8).map((a) => a.do), ["cheer"]);
});
