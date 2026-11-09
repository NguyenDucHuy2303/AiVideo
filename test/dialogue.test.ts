import assert from "node:assert/strict";
import { test } from "node:test";
import { voiceFilters } from "../src/tts/engines.ts";
import { splitSpeakers } from "../src/tts/narrate.ts";

test("narrator text and character lines are told apart", () => {
  assert.deepEqual(splitSpeakers('Gióng bỗng cất tiếng. Gióng: "Mẹ ơi, mẹ mời sứ giả vào đây!" Mẹ: “Con nói được rồi!”'), [
    { text: "Gióng bỗng cất tiếng." },
    { who: "Gióng", text: "Mẹ ơi, mẹ mời sứ giả vào đây!" },
    { who: "Mẹ", text: "Con nói được rồi!" },
  ]);
  assert.deepEqual(splitSpeakers("Không có lời thoại nào."), [{ text: "Không có lời thoại nào." }]);
  assert.deepEqual(splitSpeakers('Sứ giả: "Ai có tài cứu nước?"'), [{ who: "Sứ giả", text: "Ai có tài cứu nước?" }]);
  assert.deepEqual(splitSpeakers('Mẹ (mừng rỡ): "Con nói được rồi!"'), [{ who: "Mẹ", mood: "joy", text: "Con nói được rồi!" }], "how it is said becomes the face");
});

test("a child's voice: pitch up, tempo kept", () => {
  assert.deepEqual(voiceFilters(1, 4), ["asetrate=48000*1.25992", "aresample=48000", "atempo=0.79370"]);
  assert.deepEqual(voiceFilters(1.2), ["atempo=1.20000"]);
  assert.deepEqual(voiceFilters(1), []);
});
