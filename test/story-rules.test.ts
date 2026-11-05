import assert from "node:assert/strict";
import { test } from "node:test";
import type { ParsedStory } from "../src/story/parse.ts";
import { applyStoryRules, cleanBackground, cleanSilhouette, fillBackgrounds, namedInStory, transformationScenes } from "../src/story/rules.ts";
import type { Character, Shot } from "../src/story/shots.ts";

// Scenes and replies from a real run of gemma3:4b on Thánh Gióng.
const parsed: ParsedStory = {
  chapters: ["Ra đời", "Lớn lên", "Đánh giặc", "Về trời"],
  dropped: [],
  scenes: [
    { chapter: 0, narration: "Mười hai tháng sau, bà sinh ra một cậu bé, đặt tên là Gióng." },
    { chapter: 1, narration: "Sự lớn lên phi thường này thể hiện sức mạnh tiềm tàng của dân tộc." },
    { chapter: 2, narration: "Cậu bé Gióng vươn vai một cái, bỗng chốc trở thành một tráng sĩ khổng lồ, oai phong lẫm liệt." },
    { chapter: 2, narration: "Roi sắt gãy, Gióng bèn nhổ những bụi tre bên đường để làm vũ khí, đánh tan tác quân giặc." },
    { chapter: 3, narration: "Gióng một mình một ngựa lên đỉnh núi Sóc Sơn, rồi cả người lẫn ngựa từ từ bay thẳng lên trời." },
  ],
};
const cast: Character[] = [
  { id: "giong_child", name: "Gióng", silhouette: "a small child" },
  { id: "giong_warrior", name: "Tráng sĩ Gióng", silhouette: "a giant warrior on a horse" },
];
const shot = (actor: string, action: Shot["action"]): Shot => ({ background: "x", time: "day", mood: "calm", actor, action, effects: [] });

test("cast: characters the story never names are left out", () => {
  assert.ok(namedInStory({ id: "g", name: "Gióng", silhouette: "" }, parsed));
  assert.ok(!namedInStory({ id: "p", name: "Chim Thần", silhouette: "" }, parsed));
});

test("backgrounds keep the scenery only, in plain short English", () => {
  const names = ["Gióng", "Vua Hùng"];
  assert.equal(
    cleanBackground("A rustic interior of a humble thatched-roof hut. A young boy, Giong, lies on his back, covered in rice powder. The room is sparsely furnished, with a simple wooden stool. The light filters in through a萱", names),
    "A rustic interior of a humble thatched-roof hut. The room is sparsely furnished, with a simple wooden stool",
  );
  assert.equal(cleanBackground("A dynamic scene of Giong charging into battle.", names), undefined);
  assert.equal(cleanBackground("Giong wielding a bamboo spear. The ground trembles.", names), undefined, "too little left to paint");
  assert.equal(cleanBackground("The thatched roofs of Giong village shimmer in the late afternoon sun.", names), "The thatched roofs of Giong village shimmer in the late afternoon sun");
  assert.equal(cleanBackground("Dawn mist over the village of Giong and its bamboo hedges.", names), "Dawn mist over the village of Giong and its bamboo hedges");
  assert.equal(cleanBackground("A bustling scene in the village, circa the reign of King Hung. Bamboo groves provide a natural backdrop.", names), "Bamboo groves provide a natural backdrop");
  const long = cleanBackground("Rice fields stretch to the misty hills under a pale sky. Bamboo groves line the river bank and sway. A wooden bridge crosses the slow brown river near old stilt houses. The far mountains fade into blue haze.", names)!;
  assert.ok(long.split(" ").length <= 32, long);
});

test("silhouettes lose the clause a length limit cut off", () => {
  assert.equal(cleanSilhouette("A small child lying on his back, arms outstretched, wearing a loose tunic made of undy"), "A small child lying on his back, arms outstretched");
  assert.equal(cleanSilhouette("A tall man with a sword."), "A tall man with a sword");
});

test("a background that lost everything borrows one from the same chapter", () => {
  const p: ParsedStory = { ...parsed, scenes: [parsed.scenes[0]!, { chapter: 0, narration: "b" }, { chapter: 1, narration: "c" }] };
  assert.deepEqual(fillBackgrounds(p, ["hut", undefined, undefined], "village"), ["hut", "hut", "hut"]);
  assert.deepEqual(fillBackgrounds(p, [undefined, undefined, undefined], "village"), ["village", "village", "village"]);
});

test("transformations are found in the words", () => {
  assert.deepEqual(transformationScenes(parsed), [2]);
});

test("actions follow the words, and the hero stays transformed", () => {
  const out = applyStoryRules(parsed, cast, [
    shot("giong_child", "rise"),
    shot("giong_child", "fly_up"), // nobody flies here
    shot("giong_child", "grow"),
    shot("giong_child", "charge"), // already a warrior by now
    shot("none", "fly_up"), // the hero flies away: show him
  ], [{ scene: 2, from: "giong_child", to: "giong_warrior" }]);
  assert.deepEqual(out.map((s) => [s.actor, s.action]), [
    ["giong_child", "rise"],
    ["giong_child", "appear"],
    ["giong_warrior", "grow"],
    ["giong_warrior", "charge"],
    ["giong_warrior", "fly_up"],
  ]);
});

test("unknown actors become none; grow needs growth in the words", () => {
  const out = applyStoryRules(parsed, cast, [shot("phoenix", "appear"), shot("none", "appear"), shot("giong_child", "appear"), shot("giong_child", "grow"), shot("none", "appear")], []);
  assert.deepEqual(out.map((s) => [s.actor, s.action]), [
    ["none", "appear"],
    ["none", "appear"],
    ["giong_child", "appear"],
    ["giong_child", "appear"],
    ["giong_child", "fly_up"],
  ]);
});
