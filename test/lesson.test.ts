import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLesson, TEACHER, type LessonPlan } from "../src/studio/lesson.ts";
import { PROFILES, type QAScene } from "../src/studio/qa.ts";

const P = PROFILES["qa-vi"];
const say = (who: string, text: string) => ({ who, how: "", text });
const scene = (beat: string, parts: ReturnType<typeof say>[]): QAScene => ({ beat: beat as QAScene["beat"], visual: { kind: "labels", what: "x" }, parts });
const filler = Array(30).fill("chữ").join(" ");
const good = (): LessonPlan => ({
  title: "Học tiếng Anh: Con vật", question: "Con vật", answer: "cat, dog", thumbnail: "CAT!", description: "d", shorts: [], facts: [], look: "",
  cast: [P.host, P.kid, P.little, TEACHER], words: Array.from({ length: 8 }, (_, i) => ({ en: `w${i}`, vi: `t${i}` })),
  scenes: [
    scene("hook", [say("Huy", filler)]),
    ...Array.from({ length: 24 }, () => scene("word", [say("Huy", filler), say("Emma", "Cat. Cat."), say("Bối", "Cat!"), say("Beo", "Cát!")])),
    scene("practice", [say("Emma", "What is this?"), say("", "[3s]"), say("Beo", filler), say("Emma", "And this?"), say("", "[2s]")]),
    scene("sentence", [say("Emma", "I have a cat."), say("Huy", filler)]),
    scene("recap", [say("Emma", "Cat, dog, fish.")]),
    scene("next", [say("Huy", filler)]),
  ],
});

test("a well-formed English lesson passes", () => assert.deepEqual(checkLesson(good()), []));

test("Emma speaks only English and reads every word", () => {
  const p = good();
  p.scenes[1] = scene("word", [say("Huy", filler), say("Emma", "Con mèo")]);
  p.scenes[2] = scene("word", [say("Huy", filler)]);
  const problems = checkLesson(p);
  assert.ok(problems.some((x) => /Scene 2: Emma speaks only English/.test(x)));
  assert.ok(problems.some((x) => /Scene 3: a word scene where Emma does not read/.test(x)));
});

import { FORMATS, FORMAT_IDS, nextFormats, formatOf } from "../src/studio/formats.ts";
import { isEnglishLine, splitPauses } from "../src/tts/narrate.ts";
import { pausesOf, scoresOf, tagSvg } from "../src/studio/qaproduce.ts";

test("formats take turns: never the last one, the least lately used first", () => {
  assert.deepEqual(nextFormats(3, []), ["cards", "story", "gameshow"]);
  // lessons from before formats count as cards
  assert.deepEqual(nextFormats(2, [undefined, "story"]), ["gameshow", "roleplay"]);
  assert.deepEqual(nextFormats(7, [], ["cards", "oops"]), ["cards", "oops", "cards", "oops", "cards", "oops", "cards"]);
  const all = nextFormats(FORMAT_IDS.length, [...FORMAT_IDS]);
  assert.deepEqual([...all].sort(), [...FORMAT_IDS].sort());
  assert.equal(formatOf(undefined).id, "cards");
  assert.equal(formatOf("nope").id, "cards");
});

test("every format is complete: beats, Emma's beats among them, a plan line per beat", () => {
  for (const f of Object.values(FORMATS)) {
    assert.ok(f.emma.every((b) => f.beats.includes(b)), f.id);
    for (const b of f.beats) assert.ok(f.plan.some((l) => l.startsWith(`- ${b} `)), `${f.id}: ${b}`);
    assert.ok(f.direct.length > 0 && f.items[0] <= f.items[1] && f.length[0] < f.length[1]);
  }
});

test("a lesson is checked by its format (pauses, beats, points)", () => {
  const p = good();
  p.format = "oops";
  const problems = checkLesson(p);
  assert.ok(problems.some((x) => /beat "oops" is missing/.test(x)));
  assert.ok(problems.some((x) => /pauses for the viewers/.test(x)));
  // a pause is no speaker, and the cards need two
  const q = good();
  q.scenes[25]!.parts = q.scenes[25]!.parts.filter((x) => x.who);
  assert.deepEqual(checkLesson(q).map((x) => x.slice(0, 26)), ["The lesson has 0 pauses fo"]);
  const g = good();
  g.format = "gameshow";
  g.scenes[1]!.point = "Huy";
  assert.ok(checkLesson(g).some((x) => /point "Huy"/.test(x)));
});

test("lines wholly in English go to the English voice", () => {
  assert.equal(isEnglishLine("Cat!"), true);
  assert.equal(isEnglishLine("Hùng, look! A cat."), true);
  assert.equal(isEnglishLine("Cat là con mèo"), false);
  assert.equal(isEnglishLine("Beo!"), false);
  assert.equal(isEnglishLine("Dạ"), false);
});

test("pauses in a script, and found again in the captions", () => {
  assert.deepEqual(splitPauses("Đây là gì? [3s] Mèo"), ["Đây là gì?", 3, "Mèo"]);
  assert.deepEqual(splitPauses("[9s]"), [6]);
  // a line, a 3 s pause (+ the breath), a line; then a pause ending the scene
  const fps = 30, cues = [{ startFrame: 6, endFrame: 60 }, { startFrame: 159, endFrame: 200 }];
  assert.deepEqual(pausesOf(cues, 210, fps), [{ at: 2, seconds: 3 }]);
  assert.deepEqual(pausesOf([{ startFrame: 6, endFrame: 60 }], 60 + 30 * 3.8, fps), [{ at: 2, seconds: 3 }]);
  assert.deepEqual(pausesOf([{ startFrame: 6, endFrame: 60 }, { startFrame: 60, endFrame: 90 }], 96, fps), []);
});

test("a game's score runs from the first round", () => {
  const sc = (beat: string, point?: string) => ({ beat: beat as QAScene["beat"], visual: { kind: "labels" as const, what: "" }, parts: [], ...(point !== undefined ? { point } : {}) });
  const plan = { ...good(), scenes: [sc("hook"), sc("word", ""), sc("round", "Bối"), sc("round", ""), sc("round", "Beo"), sc("final", "both"), sc("result")] };
  assert.deepEqual(scoresOf(plan), [undefined, undefined, { "Bối": 0, "Beo": 0, gain: "Bối" }, { "Bối": 1, "Beo": 0 }, { "Bối": 1, "Beo": 0, gain: "Beo" }, { "Bối": 1, "Beo": 1, gain: "both" }, { "Bối": 2, "Beo": 2 }]);
  assert.ok(scoresOf(good()).every((x) => x === undefined));
});

test("the corner word card", () => {
  const svg = tagSvg("apple | quả táo | red apple");
  assert.match(svg, /<icon name="red apple"/);
  assert.match(svg, />apple</);
  assert.match(svg, />quả táo</);
  assert.equal((tagSvg("How much is this one please? | Cái này bao nhiêu tiền ạ? |").match(/<text/g) ?? []).length >= 4, true);
});
