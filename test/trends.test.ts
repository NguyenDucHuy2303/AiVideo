import { test } from "node:test";
import assert from "node:assert/strict";
import { lunarToSolar, seasonal } from "../src/studio/trends.ts";

const ymd = (d: Date) => d.toLocaleDateString("sv");

test("lunar dates in Vietnam's calendar (UTC+7)", () => {
  assert.equal(ymd(lunarToSolar(1, 1, 2025)), "2025-01-29"); // Tết Ất Tỵ
  assert.equal(ymd(lunarToSolar(1, 1, 2026)), "2026-02-17"); // Tết Bính Ngọ
  assert.equal(ymd(lunarToSolar(15, 8, 2026)), "2026-09-25"); // Trung Thu 2026
  assert.equal(ymd(lunarToSolar(1, 1, 2027)), "2027-02-06"); // Tết Đinh Mùi
});

test("occasions three weeks ahead, in the line's language", () => {
  const vi = seasonal("vi", new Date(2026, 10, 11)); // 11/11/2026: Teachers' Day 20/11 is near
  assert.ok(vi.some((h) => /Nhà giáo/.test(h)));
  assert.ok(!vi.some((h) => /Halloween/.test(h)));
  const en = seasonal("en", new Date(2026, 9, 20)); // 20/10: Halloween ahead
  assert.ok(en.some((h) => /Halloween/.test(h)));
});
