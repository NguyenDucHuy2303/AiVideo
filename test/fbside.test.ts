import { test } from "node:test";
import assert from "node:assert/strict";
import { reportText, type Snapshot } from "../src/studio/fbside.ts";

const reel = (o: Partial<Snapshot["reels"][number]>) => ({ slug: "a", key: "facebook:short:0", name: "Sơn Tinh (Short 1)", page: "1", posted: "2026-11-16T08:00:00Z", likes: 1, comments: 0, ...o });

test("the Facebook report: followers and plays grown in the week, the top Reels", () => {
  const old: Snapshot = { at: "2026-11-10T01:00:00Z", pages: { "1": { name: "Huy Kể Chuyện", followers: 2 } }, reels: [reel({ plays: 10, posted: "2026-11-09T08:00:00Z" })] };
  const now: Snapshot = { at: "2026-11-17T01:00:00Z", pages: { "1": { name: "Huy Kể Chuyện", followers: 30 } }, reels: [reel({ plays: 110, posted: "2026-11-09T08:00:00Z" }), reel({ slug: "b", name: "Ếch (Short 1)", plays: 50 })] };
  const t = reportText(now, [old]);
  assert.match(t, /Người theo dõi: 30 \(\+28 trong tuần\)/);
  assert.match(t, /Lượt phát: 160 tổng, 150 trong tuần/);
  assert.match(t, /Reel đã đăng: 2 \(1 trong 7 ngày qua\)/);
  assert.ok(t.indexOf("110 lượt phát") < t.indexOf("50 lượt phát"));
  // No insights yet: said so, no plays.
  const blind = reportText({ ...now, noInsights: ["1"] }, []);
  assert.match(blind, /CHƯA CÓ QUYỀN THỐNG KÊ/);
  assert.match(blind, /Chưa đủ một tuần/);
});
