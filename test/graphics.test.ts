import assert from "node:assert/strict";
import { test } from "node:test";
import { getLayout } from "../src/layouts/index.ts";
import { buildSceneAss } from "../src/renderer/ass.ts";
import { ICON_NAMES, icon } from "../src/renderer/graphics/icons.ts";
import { countable, formatCount } from "../src/renderer/graphics/layout.ts";
import { circleDrawing, iconDrawing, parsePath } from "../src/renderer/graphics/svg.ts";
import { parseTimeline } from "../src/schema/load.ts";
import { graphicFor } from "../src/storyboard/graphic.ts";

test("parsePath handles relative commands, packed arc flags and implicit linetos", () => {
  const [p] = parsePath("M2 2l4 0 0 4z");
  assert.deepEqual(p!.start, [2, 2]);
  assert.deepEqual(p!.segs.map((s) => s.to), [[6, 2], [6, 6], [2, 2]]);
  // "a4 4 0 01-3-4": large=0, sweep=1, then the end point -3,-4.
  const [arc] = parsePath("M15 13a4 4 0 01-3-4");
  const end = arc!.segs.at(-1)!.to;
  assert.ok(Math.abs(end[0] - 12) < 1e-9 && Math.abs(end[1] - 9) < 1e-9);
  assert.ok(arc!.segs.every((s) => s.kind === "c"));
});

test("every vendored icon converts, and drawings retrace each subpath", () => {
  for (const name of ICON_NAMES) assert.ok(icon(name, 48).commands.length > 0, name);
  const d = iconDrawing([["line", { x1: "0", y1: "0", x2: "24", y2: "0" }]], 2);
  assert.equal(d.commands, "m 0 0 l 48 0 l 0 0");
  assert.deepEqual(d.box, { x0: 0, y0: 0, x1: 48, y1: 0 });
  assert.ok(!/-/.test(circleDrawing(10)), "filled shapes stay in positive coordinates");
});

test("big numbers count up in their own format", () => {
  const c = countable("1.500")!;
  assert.equal(formatCount(750, c), "750");
  assert.equal(formatCount(1500, c), "1.500");
  assert.equal(formatCount(3.5, countable("3,5")!), "3,5");
  assert.equal(formatCount(12, countable("30%")!), "12%");
  assert.equal(countable("7–9"), undefined, "ranges pop in instead");
});

const narration = { audioFile: "/x.wav", durationFrames: 300, cues: [0, 100, 200].map((s) => ({ text: "c", startFrame: s + 6, endFrame: s + 100 })) };

test("graphicFor times list items to sentences and maps unknown icons", () => {
  const warnings: string[] = [];
  const g = graphicFor({ type: "list", items: [{ icon: "brain", text: "a" }, { icon: "rocketship", text: "b" }, { text: "c" }] }, narration, 30, warnings, "s");
  assert.ok(g?.type === "list");
  assert.deepEqual(g.items.map((i) => i.startFrame), [6, 106, 180], "third cue is past 60% of the scene, so it is clamped");
  assert.deepEqual(g.items.map((i) => i.icon), ["brain", "circle-check", "circle-check"]);
  assert.match(warnings[0]!, /unknown icon "rocketship"/);
  assert.equal(graphicFor({ type: "none" }, narration, 30, warnings, "s"), undefined);
  assert.equal(graphicFor({ type: "pie" }, narration, 30, warnings, "s"), undefined);
  assert.match(warnings.at(-1)!, /graphic is invalid/);
});

test("graphic scenes put the heading at the top and draw the graphic below it", () => {
  const { timeline } = parseTimeline({
    schemaVersion: 1,
    title: "T",
    scenes: [{
      id: "s01", durationFrames: 90, background: { type: "color", color: "#000000" },
      texts: [{ role: "title", text: "Ngủ đủ" }],
      graphic: { type: "big_number", value: "7–9", unit: "tiếng", label: "mỗi đêm" },
    }],
  });
  const layout = getLayout("9x16");
  const { ass } = buildSceneAss(timeline.scenes[0]!, layout, 30, 90);
  assert.match(ass, new RegExp(`title,,0,0,0,,\\{\\\\an8\\\\pos\\(\\d+,${layout.safe.top + layout.graphicTopPad}\\)`));
  assert.match(ass, /Style: gfxb,/);
  assert.match(ass, /gfxb,,0,0,0,,\{\\an8\\pos\(\d+,\d+\).*\}7–9\{\\fs\d+\\1c&HFFFFFF&\} tiếng/);
  assert.throws(() => parseTimeline({ schemaVersion: 1, title: "T", scenes: [{ id: "a", durationFrames: 30, background: { type: "color", color: "#000000" }, graphic: { type: "icon", icon: "nope" } }] }));
});
