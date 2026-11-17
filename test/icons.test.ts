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

test("children's words the word match got wrong have their own pictures", { skip: !hasIcons() }, () => {
  for (const [ask, got] of [["ball", "soccer-ball"], ["red ball", "soccer-ball"], ["two", "keycap-2"], ["number eight", "keycap-8"], ["face", "slightly-smiling-face"], ["kitchen", "cooking"], ["spring", "cherry-blossom"], ["name tag", "name-badge"], ["toy blocks", "blocks"], ["red", "red-circle"], ["blue", "blue-circle"]]) {
    assert.equal(resolveIcon(ask!)?.name, got, ask);
  }
});

test("a thing doing something is the thing; a picture named so keeps its name", { skip: !hasIcons() }, () => {
  for (const [ask, got] of [["rabbit eating carrot", "rabbit"], ["girl holding a kite", "girl"], ["sun with face", "sun-with-face"], ["cup with straw", "cup-with-straw"], ["black cat", "black-cat"]]) {
    assert.equal(resolveIcon(ask!)?.name, got, ask);
  }
});

test("things the set lacks are drawn by the studio; a word never lands on a picture of another age", { skip: !hasIcons() }, () => {
  for (const [ask, got] of [["Great Pyramid", "pyramid"], ["beehive", "beehive"], ["honeycomb", "honeycomb"], ["Venus", "venus"], ["sugar cube", "sugar-cube"], ["crumpled paper ball", "paper-ball"], ["bacteria", "microbe"], ["pink granite", "rock"], ["workers pulling", "man"]]) {
    assert.equal(resolveIcon(ask!)?.name, got, ask);
  }
  assert.equal(resolveIcon("sledge with stone block"), undefined); // (not a snow sled in ancient Egypt)
});
