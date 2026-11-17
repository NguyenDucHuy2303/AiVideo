import { test } from "node:test";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { stageEpisode, partsOf, thingVoices, type Episode } from "../src/studio/staging.ts";
import { checkEpisode, type Written } from "../src/studio/episode.ts";
import { langRuns, unmark } from "../src/tts/narrate.ts";

const EP: Episode = {
  title: "Hộp quà",
  words: [{ en: "cat", vi: "con mèo", thing: "cat" }],
  things: [{ id: "gift", kind: "item", icon: "wrapped gift", speaker: "Hộp quà" }, { id: "cat", kind: "animal", species: "cat", speaker: "Mèo" }],
  places: { living: "a living room" },
  scenes: [
    { place: "living", say: `[2s] Hùng (vui vẻ): "Có quà nè!" Hộp quà (tinh nghịch): "Open me!"`, beats: [{ line: 0, do: "enter", who: "Hùng", what: "gift", from: "right" }, { line: 2, do: "put", who: "Hùng", what: "gift" }, { line: 3, do: "shake", what: "gift" }] },
    { place: "living", say: `[1s] Mèo (vui vẻ): "Meow! I am a cat!" Bối (vui vẻ): "Các bạn nói cùng Bối nào: *Cat!*" [3s]`, beats: [{ line: 1, do: "open", what: "gift" }, { line: 1, do: "pop_out", what: "cat", to: "gift" }] },
  ],
};
const TL = { fps: 30, scenes: [
  { durationFrames: 180, marks: [{ at: 0.2, end: 2.2, pause: true }, { at: 2.5, end: 3.6, who: "Hùng" }, { at: 3.9, end: 5.0, who: "Hộp quà" }] },
  { durationFrames: 300, marks: [{ at: 0.2, end: 1.2, pause: true }, { at: 1.5, end: 3.0, who: "Mèo" }, { at: 3.3, end: 5.4, who: "Bối" }, { at: 5.7, end: 8.7, pause: true }] },
] };

test("English inside a Vietnamese line is read as English, its marks gone from the captions", () => {
  assert.deepEqual(langRuns("*Cat!* Là con mèo!"), [{ en: true, text: "Cat!" }, { en: false, text: "Là con mèo!" }]);
  assert.deepEqual(langRuns("Các bạn nói cùng Bối nào: *Cat!*").map((r) => r.en), [false, true]);
  assert.equal(unmark("Các bạn nói: *Teddy bear!*"), "Các bạn nói: Teddy bear!");
});

test("a staged scene: all four in the camera, beats on their lines, the word card, the clock", () => {
  const [s1, s2] = stageEpisode(EP, TL) as [Record<string, any>, Record<string, any>];
  for (const s of [s1, s2]) {
    for (const k of ["huy", "hung", "boi", "beo"]) assert.ok(s.shots[0].on.includes(k), `${k} framed`);
    assert.equal(s.speakerShots, false);
  }
  // Hùng comes in from the right carrying the gift, puts it down as his line starts
  const hung = s1.cast.find((c: any) => c.id === "hung");
  assert.ok(hung.x > 600);
  const gift = s1.items.find((i: any) => i.id === "gift");
  assert.equal(gift.carry.by, "hung");
  assert.ok(Math.abs(gift.carry.until - 2.95) < 0.01);
  assert.ok(gift.face, "a talking gift has a face");
  assert.equal(gift.shakes[0].at, 3.9);
  // the cat jumps out of the gift as the first pause starts; its card as it says "cat"; a clock in the 3 s pause
  assert.ok(s2.cast.some((c: any) => c.id === "cat" && c.opacity === 0));
  assert.ok(s2.shots[0].on.includes("cat"));
  assert.ok(s2.items.find((i: any) => i.id === "gift").pops.includes(0.2));
  assert.equal(s2.items.find((i: any) => i.label)?.label.at, 1.5);
  assert.deepEqual(s2.overlay.countdowns, [{ at: 5.7, seconds: 3 }]);
});

test("talking things get voices in both languages; the episode check catches unmarked English", () => {
  const v = thingVoices(EP);
  assert.deepEqual(v.speakers, { "Hộp quà": ["gift"], "Mèo": ["cat"] });
  assert.ok((v.voices["Mèo@en"] as { engine: string }).engine === "kokoro");
  assert.equal(partsOf(EP.scenes[1]!.say).length, 4);
  const bad = { ...EP, youtubeTitle: "", thumbnail: "", scenes: [{ ...EP.scenes[1]!, say: `Bối (vui vẻ): "Cat là con mèo!"` }] } as Written;
  assert.ok(checkEpisode(bad).some((p) => p.includes("between asterisks")));
});

import { judge, BAD } from "../src/audio/englishcheck.ts";
test("the English check: wrong words stopped, names and noises not judged", { skip: !existsSync("vendor/kokoro/venv/bin/python") }, async () => {
  const right = [["Bye bye, Hùng!", "Bye-bye, Hoong."], ["Hùng got a face bath!", "Whom got a face bath?"], ["Boing! A ball!", "Bawing a ball."], ["Meow! Good job!", "Meow, good job."]];
  const wrong = [["Cat!", "CAD"], ["I am a cat!", "I am a cad."], ["Look, a dog!", "Look, a duck!"], ["Ball!", "Bye."], ["Bye bye, Hùng!", "Hi hi, Hoong."]];
  const r = await judge([...right, ...wrong].map(([meant, heard]) => ({ meant: meant!, heard: heard! })), ["cat", "dog", "ball"]);
  right.forEach((c, i) => assert.ok(r[i]! <= BAD, `right: ${c.join(" → ")} (${r[i]})`));
  wrong.forEach((c, i) => assert.ok(r[right.length + i]! > BAD, `wrong: ${c.join(" → ")} (${r[right.length + i]})`));
});
