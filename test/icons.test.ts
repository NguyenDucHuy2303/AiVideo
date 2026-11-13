import { test } from "node:test";
import assert from "node:assert/strict";
import { boardIcons, hasIcons, resolveIcon } from "../src/animation/icons.ts";

test("school things the emoji set lacks are drawn by the studio, colours or not", () => {
  for (const [ask, got] of [["eraser", "eraser"], ["pink eraser", "eraser"], ["pencil case", "pencil-case"], ["pencil sharpener", "sharpener"], ["glue stick", "glue-stick"]]) {
    assert.equal(resolveIcon(ask!)?.name, got, ask);
    assert.equal(resolveIcon(ask!, "flat")?.name, got, ask);
  }
});

test("a colour said with a thing finds the thing; a picture named with its colour keeps it", { skip: !hasIcons() }, () => {
  assert.equal(resolveIcon("green schoolbag")?.name, "backpack");
  assert.equal(resolveIcon("blue pen")?.name, "pen");
  assert.equal(resolveIcon("red apple")?.name, "red-apple");
  assert.deepEqual(boardIcons(`<svg><icon name="pink eraser"/><icon name="green schoolbag"/></svg>`).missing, []);
});
