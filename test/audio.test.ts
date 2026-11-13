import { test } from "node:test";
import assert from "node:assert/strict";
import { ambienceOf, layers, mergeSections } from "../src/audio/ambience.ts";
import { errorRate, syllables } from "../src/audio/voicecheck.ts";

test("ambience: the place of a scene, by set and time or by the words of a place", () => {
  assert.equal(ambienceOf({ set: { name: "village" }, time: "day" }), "village");
  assert.equal(ambienceOf({ set: { name: "village" }, time: "night" }), "night");
  assert.equal(ambienceOf({ set: { name: "mountain" } }), "mountain");
  assert.equal(ambienceOf({ place: "a bright, cheerful children's TV studio: pastel walls" }), "room");
  assert.equal(ambienceOf({ place: "a sandy beach with gentle waves" }), "sea");
  assert.equal(ambienceOf({ place: "a blue seabed with rocks and corals" }), "underwater");
  assert.equal(ambienceOf({ place: "inside a warm beehive with honeycomb walls" }), "hive");
  assert.equal(ambienceOf({ place: "a sunny flower meadow" }), "field");
  assert.ok(layers("forest", 10).length >= 3);
  assert.equal(layers("none", 10).length, 0);
});

test("ambience: scenes of one place make one stretch", () => {
  assert.deepEqual(mergeSections([{ duration: 5, kind: "village" }, { duration: 4, kind: "village" }, { duration: 3, kind: "night" }]), [
    { start: 0, duration: 9, kind: "village" }, { start: 9, duration: 3, kind: "night" },
  ]);
});

test("voice check: syllables without punctuation, the share heard wrong", () => {
  assert.deepEqual(syllables("“Nàng đừng sợ!” Ta sẽ bảo vệ nàng."), ["nàng", "đừng", "sợ", "ta", "sẽ", "bảo", "vệ", "nàng"]);
  assert.equal(errorRate(syllables("ta sẽ bảo vệ nàng"), syllables("Ta sẽ bảo vệ nàng")), 0);
  assert.equal(errorRate(syllables("ta sẽ bảo vệ nàng"), syllables("ta sẽ bảo về nàng")), 0.2);
  assert.equal(errorRate(syllables("a b c d"), []), 1);
});

import { heardAs, sceneRate, viNumber } from "../src/audio/voicecheck.ts";
test("voice check: northern homophones are not mistakes; numbers read as words", () => {
  assert.equal(heardAs("giương"), heardAs("dương"));
  assert.equal(heardAs("giải"), heardAs("dải"));
  assert.equal(heardAs("rạp"), heardAs("dạp"));
  assert.equal(heardAs("sính"), heardAs("xính"));
  assert.equal(heardAs("trưng"), heardAs("chưng"));
  assert.equal(viNumber(18), "mười tám");
  assert.equal(viNumber(100), "một trăm");
  assert.equal(viNumber(105), "một trăm linh năm");
  assert.equal(viNumber(25), "hai mươi lăm");
  assert.equal(sceneRate("vua Hùng thứ mười tám, sính lễ gồm một trăm ván", "Vua Hùng thứ 18, xính lễ gồm 100 ván"), 0);
  assert.ok(sceneRate("giương nỏ lên", "dương nọ lên") > 0.3, "a tone is a real difference");
});
