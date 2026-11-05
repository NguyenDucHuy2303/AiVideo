import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { getLayout } from "../src/layouts/index.ts";
import { assColor, assTime, buildSceneAss } from "../src/renderer/ass.ts";
import { assembleArgs, sceneStartFrames, totalFrames } from "../src/renderer/ffmpeg/assemble.ts";
import { assertFilterSafePath } from "../src/renderer/ffmpeg/scene.ts";
import { narrationMixArgs, loudnessApplyArgs, parseLoudness } from "../src/renderer/ffmpeg/audio.ts";
import { fontMetrics, measureFor } from "../src/renderer/fontMetrics.ts";
import { splitCaptions, wrapBalanced, wrapText } from "../src/renderer/text.ts";
import { parseTimeline, resolveInProject, sanitizeText, TimelineError } from "../src/schema/load.ts";

const demo = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../fixtures/demo/timeline.json"), "utf8"));
const clone = () => structuredClone(demo);

test("demo timeline is valid", () => {
  const { timeline, warnings } = parseTimeline(clone());
  assert.equal(timeline.scenes.length, 3);
  assert.deepEqual(warnings, []);
});

test("sanitizeText: NFD → NFC, strips emoji and ASS control chars", () => {
  const nfd = "Thiếu ngủ".normalize("NFD");
  const { text, notes } = sanitizeText(`${nfd} 😴 {\\b1}  ok`);
  assert.equal(text, "Thiếu ngủ (/b1) ok");
  assert.equal(text, text.normalize("NFC"));
  assert.equal(notes.length, 3);
});

test("schema rejects paths escaping the project", () => {
  const tl = clone();
  tl.scenes[0].background.src = "../../etc/passwd";
  assert.throws(() => parseTimeline(tl), TimelineError);
  assert.throws(() => resolveInProject("/p", "a/../../x"), TimelineError);
});

test("schema rejects a transition longer than the next scene", () => {
  const tl = clone();
  tl.scenes[0].transitionOut.frames = 60;
  tl.scenes[1].durationFrames = 40;
  assert.throws(() => parseTimeline(tl), /transition/);
});

test("schema rejects duplicate scene ids", () => {
  const tl = clone();
  tl.scenes[1].id = tl.scenes[0].id;
  assert.throws(() => parseTimeline(tl), /duplicate/);
});

test("last scene transition is dropped with a warning", () => {
  const tl = clone();
  tl.scenes[2].transitionOut = { type: "fade", frames: 10 };
  const { timeline, warnings } = parseTimeline(tl);
  assert.deepEqual(timeline.scenes[2]!.transitionOut, { type: "cut", frames: 0 });
  assert.equal(warnings.length, 1);
});

const chars = (s: string) => s.length;

test("wrapText respects width and hard-splits long words", () => {
  assert.deepEqual(wrapText("một hai ba bốn năm", 7, chars), ["một hai", "ba bốn", "năm"]);
  assert.deepEqual(wrapText("abcdefghij", 4, chars), ["abcd", "efgh", "ij"]);
  for (const line of wrapText(demo.scenes[1].caption, 20, chars)) assert.ok(line.length <= 20);
});

test("wrapBalanced keeps the line count but avoids a lone last word", () => {
  const text = "Điều gì xảy ra khi bạn thiếu ngủ?";
  assert.deepEqual(wrapText(text, 28, chars), ["Điều gì xảy ra khi bạn thiếu", "ngủ?"]);
  assert.deepEqual(wrapBalanced(text, 28, chars), ["Điều gì xảy ra khi", "bạn thiếu ngủ?"]);
});

test("font metrics read real advance widths from the bundled TTF", () => {
  const bold = fontMetrics(true);
  assert.equal(bold.lineUnits, 1362);
  assert.ok(bold.advance("W".codePointAt(0)!) > bold.advance("i".codePointAt(0)!));
  // Precomposed Vietnamese letters have their own glyphs (not .notdef).
  assert.equal(bold.advance(0x1ebf), bold.advance("e".codePointAt(0)!));
  // Matches the width measured on a libass-rendered frame (≈964 px) within 1%.
  assert.ok(Math.abs(bold.width("Điều gì xảy ra khi bạn thiếu", 96) - 964) < 10);
  assert.ok(measureFor(true, 96, 5)("abc") > bold.width("abc", 96));
});

test("splitCaptions covers the whole scene without gaps", () => {
  const chunks = splitCaptions(demo.scenes[1].caption, 22, chars, 2, 180);
  assert.ok(chunks.length > 1);
  assert.equal(chunks[0]!.startFrame, 0);
  assert.equal(chunks.at(-1)!.endFrame, 180);
  for (let i = 1; i < chunks.length; i++) assert.equal(chunks[i]!.startFrame, chunks[i - 1]!.endFrame);
  for (const c of chunks) {
    assert.ok(c.lines.length <= 2);
    assert.ok(c.endFrame > c.startFrame);
  }
});

test("ASS helpers", () => {
  assert.equal(assColor("#FACC15"), "&H0015CCFA");
  assert.equal(assTime(45, 30), "0:00:01.50");
  assert.equal(assTime(30 * 3661, 30), "1:01:01.00");
});

test("buildSceneAss keeps titles inside maxLines for both layouts", () => {
  const { timeline } = parseTimeline(clone());
  for (const id of ["9x16", "16x9"] as const) {
    for (const scene of timeline.scenes) {
      const { ass, warnings } = buildSceneAss(scene, getLayout(id), 30, scene.durationFrames + scene.transitionOut.frames);
      assert.deepEqual(warnings, [], `${id}/${scene.id}`);
      assert.match(ass, /PlayResX: \d+/);
      assert.ok(ass.includes("Style: caption"));
    }
  }
});

test("assemble timing: scenes start at cumulative durations, total = sum of durations", () => {
  const { timeline } = parseTimeline(clone());
  assert.deepEqual(sceneStartFrames(timeline.scenes), [0, 150, 330]);
  assert.equal(totalFrames(timeline.scenes), 495);

  const args = assembleArgs({
    scenes: timeline.scenes,
    clips: ["a.mp4", "b.mp4", "c.mp4"],
    audioTrack: "master.wav",
    layout: getLayout("9x16"),
    fps: 30,
    encoder: "x264",
    output: "out.mp4",
  });
  const graph = args[args.indexOf("-filter_complex") + 1]!;
  assert.match(graph, /xfade=transition=fade:duration=0\.400000:offset=5\.000000/);
  assert.match(graph, /xfade=transition=slideleft:duration=0\.500000:offset=11\.000000/);
  assert.equal(args.filter((a) => a === "-i").length, 4);
  assert.ok(args.includes("3:a"));
});

test("narration audio is sample-exact per scene", () => {
  const { timeline } = parseTimeline(clone());
  const args = narrationMixArgs(timeline.scenes, ["1.wav", undefined, "3.wav"], 30, "mix.wav");
  const graph = args[args.indexOf("-filter_complex") + 1]!;
  // 150 frames at 30 fps = 240000 samples at 48 kHz.
  assert.match(graph, /\[0:a\].*atrim=end_sample=240000/);
  assert.match(graph, /anullsrc=r=48000:cl=stereo,atrim=end_sample=288000\[a1\]/);
  assert.match(graph, /\[1:a\].*atrim=end_sample=264000/);
  assert.equal(args.filter((a) => a === "-i").length, 2);
});

test("loudness pass 2 uses pass 1 values, and skips normalizing silence", () => {
  const { timeline } = parseTimeline(clone());
  const stderr = 'noise\n[Parsed_loudnorm_0 @ 0x1]\n{\n"input_i" : "-23.1",\n"input_tp" : "-4.0",\n"input_lra" : "3.2",\n"input_thresh" : "-33.5",\n"target_offset" : "0.3"\n}\n';
  const m = parseLoudness(stderr);
  const af = (x: typeof m) => { const a = loudnessApplyArgs("mix.wav", x, -14, timeline.scenes, 30, "o.wav"); return a[a.indexOf("-af") + 1]!; };
  assert.match(af(m), /measured_I=-23\.1:.*linear=true.*atrim=end_sample=792000$/);
  assert.doesNotMatch(af({ ...m, input_i: "-inf" }), /loudnorm/);
});

test("filter paths with special characters are refused", () => {
  assert.equal(assertFilterSafePath("/home/u/WataCreateVideo/assets/fonts"), "/home/u/WataCreateVideo/assets/fonts");
  assert.throws(() => assertFilterSafePath("/home/u/My Videos/x.ass"));
  assert.throws(() => assertFilterSafePath("a:b.ass"));
});
