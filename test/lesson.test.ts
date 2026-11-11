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
  cast: [P.host, P.kid, TEACHER], words: Array.from({ length: 8 }, (_, i) => ({ en: `w${i}`, vi: `t${i}` })),
  scenes: [
    scene("hook", [say("Huy", filler)]),
    ...Array.from({ length: 24 }, () => scene("word", [say("Huy", filler), say("Emma", "Cat. Cat."), say("Mai", "Cat!")])),
    scene("practice", [say("Emma", "What is this?"), say("Mai", filler)]),
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
