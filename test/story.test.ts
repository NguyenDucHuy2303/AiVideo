import assert from "node:assert/strict";
import { test } from "node:test";
import { musicExpr, sfxSource, soundtrackArgs } from "../src/audio/soundtrack.ts";
import { getLayout } from "../src/layouts/index.ts";
import { actorFilters, shakeFilters } from "../src/renderer/ffmpeg/actor.ts";
import { effectEvents } from "../src/renderer/graphics/fx.ts";
import { parseStory } from "../src/story/parse.ts";
import { effectsFor, musicSections, sfxEvents, type StorySceneInfo } from "../src/story/visuals.ts";

test("parseStory keeps the words, finds chapters and drops pasted captions", () => {
  const text = [
    "Sự ra đời kỳ lạ",
    "Câu một rất dài để thử chia cảnh ở đây nhé. Câu hai cũng khá dài để vượt mười sáu chữ trong cảnh đầu. Câu ba.",
    "Hình minh họa 1",
    "Hình minh họa 1",
    "Bay về trời",
    "Gióng bay về trời.",
  ].join("\n");
  const s = parseStory(text);
  assert.deepEqual(s.chapters, ["Sự ra đời kỳ lạ", "Bay về trời"]);
  assert.deepEqual(s.dropped, ["Hình minh họa 1 (repeated)"]);
  assert.equal(s.scenes.map((x) => x.narration).join(" "), text.split("\n").filter((l) => l.endsWith(".")).join(" "), "narration is the script, word for word");
  assert.deepEqual(s.scenes.map((x) => x.chapter), [0, 0, 1]);
});

const info = (o: Partial<StorySceneInfo>): StorySceneInfo => ({ start: 0, duration: 8, chapterStart: false, effects: [], ...o });

test("music follows the action and merges short sections", () => {
  const sections = musicSections([
    info({ start: 0, duration: 8 }),
    info({ start: 8, duration: 8, mood: "dark" }),
    info({ start: 16, duration: 4, action: "charge" }),
    info({ start: 20, duration: 8, action: "charge" }),
    info({ start: 28, duration: 8, action: "fly_up" }),
  ]);
  // The 4 s charge is too short for its own section; the next charge starts the battle music.
  assert.deepEqual(sections.map((s) => [s.mood, s.start, s.duration]), [["calm", 0, 8], ["tense", 8, 12], ["battle", 20, 8], ["majestic", 28, 8]]);
});

test("sound effects land on the action", () => {
  const sfx = sfxEvents([info({ start: 0, chapterStart: true }), info({ start: 8, action: "grow", effects: ["flash"] }), info({ start: 16, action: "charge" })]);
  assert.deepEqual(sfx.map((e) => e.type), ["chime", "boom", "shimmer", "drums", "whoosh"]);
  assert.ok(Math.abs(sfx[1]!.at - (8 + 0.3 + 1.4 - 0.2)) < 1e-9);
});

test("flash and shake hit at the climax; other effects run from the start", () => {
  const fx = effectsFor(["embers", "shake", "flash", "embers"], "grow", 30);
  assert.deepEqual(fx.map((f) => [f.type, f.startFrame]), [["embers", 0], ["shake", 51], ["flash", 51]]);
});

test("effects are deterministic per scene and stay inside the clip", () => {
  const layout = getLayout("16x9");
  const a = effectEvents([{ type: "embers", startFrame: 0, intensity: 1 }], layout, 30, 120, "s01");
  const b = effectEvents([{ type: "embers", startFrame: 0, intensity: 1 }], layout, 30, 120, "s01");
  assert.deepEqual(a, b);
  assert.ok(a.length > 10);
  assert.ok(a.every((e) => /^Dialogue: 0,/.test(e)), "effects sit on layer 0, under texts");
  assert.ok(!a.some((e) => /,0:00:04\.(?:[1-9])/.test(e.split(",")[2]!)), "nothing ends after the clip");
});

test("actor filters animate per action", () => {
  const layout = getLayout("16x9");
  const grow = actorFilters({ src: "a.png", action: "grow", startFrame: 9, height: 1, x: 0.5 }, layout, 30, 150);
  assert.match(grow.chain, /scale=w=-2:h='.*':eval=frame/);
  assert.match(grow.overlay, /^overlay=x='960-w\/2':y='1010-h':eval=frame/);
  const fly = actorFilters({ src: "a.png", action: "fly_up", startFrame: 0, height: 0.7, x: 0.5 }, layout, 30, 150);
  assert.match(fly.overlay, /pow\(clip/);
  assert.match(shakeFilters(1, 12.9, 1920, 1080).join(","), /^crop=w=iw-26:h=ih-26:.*scale=1920:1080,setsar=1$/);
});

test("soundtrack args: one input per section and effect, trimmed to the video length", () => {
  const args = soundtrackArgs([{ start: 0, duration: 10, mood: "calm" }, { start: 10, duration: 5, mood: "battle" }], [{ type: "boom", at: 3 }], 15, "out.wav");
  assert.equal(args.filter((a) => a === "-i").length, 3);
  const graph = args[args.indexOf("-filter_complex") + 1]!;
  assert.match(graph, /amix=inputs=3:normalize=0/);
  assert.match(graph, /atrim=end_sample=720000/);
  assert.match(graph, /adelay=3000:all=1/);
  assert.doesNotMatch(musicExpr("calm", 1), /st\(9/, "no drums in calm music");
  assert.match(musicExpr("battle", 1), /st\(9/);
  assert.equal(sfxSource("wind").duration, 5);
});
