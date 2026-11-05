import assert from "node:assert/strict";
import { test } from "node:test";
import { getLayout } from "../src/layouts/index.ts";
import { buildSceneAss } from "../src/renderer/ass.ts";
import { parseTimeline } from "../src/schema/load.ts";
import { MOTIONS, TRANSITIONS } from "../src/schema/timeline.ts";
import { fallbackGradient, matchImage, tokens, type LibraryImage } from "../src/storyboard/assets.ts";
import { pickPreset } from "../src/storyboard/build.ts";
import { Storyboard } from "../src/storyboard/schema.ts";
import { normalizeForSpeech, readInteger, splitSentences } from "../src/tts/normalize-vi.ts";

test("readInteger follows Vietnamese reading rules", () => {
  const cases: Record<string, string> = {
    "0": "không",
    "10": "mười",
    "15": "mười lăm",
    "21": "hai mươi mốt",
    "24": "hai mươi tư",
    "55": "năm mươi lăm",
    "105": "một trăm linh năm",
    "1005": "một nghìn không trăm linh năm",
    "2024": "hai nghìn không trăm hai mươi tư",
    "1000000": "một triệu",
    "3000000000": "ba tỷ",
  };
  for (const [n, words] of Object.entries(cases)) assert.equal(readInteger(n), words, n);
});

test("normalizeForSpeech spells out numbers, ranges, percentages and units", () => {
  assert.equal(normalizeForSpeech("ngủ 7-9 tiếng"), "ngủ bảy đến chín tiếng");
  assert.equal(normalizeForSpeech("30% người lớn"), "ba mươi phần trăm người lớn");
  assert.equal(normalizeForSpeech("1.500.000 người"), "một triệu năm trăm nghìn người");
  assert.equal(normalizeForSpeech("nặng 3,5 kg"), "nặng ba phẩy năm ki lô gam");
  assert.equal(normalizeForSpeech("\"Xin chào\" (thử)"), "Xin chào thử");
});

test("splitSentences splits at sentence ends and breaks very long sentences at commas", () => {
  assert.deepEqual(splitSentences("Câu một. Câu hai! Câu ba?"), ["Câu một.", "Câu hai!", "Câu ba?"]);
  const long = `${"a".repeat(100)}, ${"b".repeat(100)}.`;
  assert.equal(splitSentences(long, 150).length, 2);
});

test("pickPreset maps free-text LLM hints onto presets", () => {
  assert.equal(pickPreset("slow zoom in", MOTIONS), "zoom_in");
  assert.equal(pickPreset("Pan-Right", MOTIONS), "pan_right");
  assert.equal(pickPreset("spin around", MOTIONS), undefined);
  assert.equal(pickPreset("slide left", TRANSITIONS), "slide_left");
  assert.equal(pickPreset(undefined, TRANSITIONS), undefined);
});

test("matchImage prefers more shared tags, then unused images", () => {
  const lib: LibraryImage[] = [
    { path: "/a.jpg", tags: new Set(tokens("night dark desk")), words: new Set<string>() },
    { path: "/b.jpg", tags: new Set(tokens("night bedroom calm")), words: new Set(tokens("a lamp beside a bed")) },
  ];
  assert.equal(matchImage("tired person desk night", lib, new Set())?.path, "/a.jpg");
  assert.equal(matchImage("night", lib, new Set(["/a.jpg"]))?.path, "/b.jpg");
  assert.equal(matchImage("ocean waves", lib, new Set()), undefined);
  assert.equal(matchImage("lamp", lib, new Set()), lib[1], "description words count too");
  assert.equal(matchImage("desk lamp", lib, new Set(["/a.jpg"])), lib[0], "a tag match beats an unused image");
});

test("fallbackGradient is deterministic and flags unknown moods", () => {
  assert.deepEqual(fallbackGradient("calm", 3), { from: "#1E3A8A", to: "#0F172A", known: true });
  assert.equal(fallbackGradient("vibrant neon", 0).known, false);
  assert.deepEqual(fallbackGradient(undefined, 1), fallbackGradient(undefined, 1));
});

test("storyboard schema drops unknown fields and needs no durations", () => {
  const sb = Storyboard.parse({ title: "T", format: "x", scenes: [{ narration: "Xin chào.", duration: 8, extra: true }] });
  assert.deepEqual(sb.scenes[0], { narration: "Xin chào.", onScreen: {}, visual: {} });
  assert.throws(() => Storyboard.parse({ title: "T", scenes: [] }));
});

const cueTimeline = (cues: { text: string; startFrame: number; endFrame: number }[]) => ({
  schemaVersion: 1,
  title: "T",
  scenes: [{ id: "s01", durationFrames: 120, background: { type: "color", color: "#000000" }, captionCues: cues }],
});

test("captionCues must be ordered, non-overlapping and inside the scene", () => {
  assert.doesNotThrow(() => parseTimeline(cueTimeline([{ text: "a", startFrame: 0, endFrame: 50 }, { text: "b", startFrame: 50, endFrame: 120 }])));
  assert.throws(() => parseTimeline(cueTimeline([{ text: "a", startFrame: 0, endFrame: 60 }, { text: "b", startFrame: 50, endFrame: 100 }])), /overlap/);
  assert.throws(() => parseTimeline(cueTimeline([{ text: "a", startFrame: 0, endFrame: 130 }])), /after the scene/);
});

test("caption events follow their cue windows", () => {
  const { timeline } = parseTimeline(cueTimeline([{ text: "Câu một.", startFrame: 6, endFrame: 60 }, { text: "Câu hai.", startFrame: 60, endFrame: 120 }]));
  const { ass } = buildSceneAss(timeline.scenes[0]!, getLayout("16x9"), 30, 120);
  assert.match(ass, /Dialogue: 4,0:00:00\.20,0:00:02\.00,caption,.*Câu một\./);
  assert.match(ass, /Dialogue: 4,0:00:02\.00,0:00:04\.00,caption,.*Câu hai\./);
});
