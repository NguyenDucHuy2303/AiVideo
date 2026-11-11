import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQA, QA, type QAPlan, type QAScene } from "../src/studio/qa.ts";

const line = (n: number) => Array(n).fill("word").join(" ");
const scene = (beat: QAScene["beat"], kind: QAScene["visual"]["kind"] = "diagram", text = line(40)): QAScene =>
  ({ beat, visual: { kind, what: "x" }, parts: [{ who: QA.host.name, how: "", text }] });
const plan = (scenes: QAScene[]): QAPlan => ({ title: "Q", question: "Q?", answer: "A", scenes, cast: [QA.host, QA.kid], facts: [], shorts: [1, 2, 3, 4], thumbnail: "Q", description: "d", look: "" });
const good = () => [scene("hook", "host"), scene("guess"), ...Array.from({ length: 24 }, () => scene("step")), scene("imagine"), scene("recap"), scene("next", "host")];

test("a well-formed question script passes", () => {
  assert.deepEqual(checkQA(plan(good())), []);
});

test("beats out of order, unknown speakers and unknown ways of speaking are reported", () => {
  const s = good();
  [s[0], s[3]] = [s[3]!, s[0]!];
  s[5] = { ...s[5]!, parts: [{ who: "Bob", how: "", text: line(40) }] };
  s[6] = { ...s[6]!, parts: [{ who: QA.kid.name, how: "grumpily", text: line(40) }] };
  const p = checkQA(plan(s));
  assert.ok(p.some((x) => /out of order/.test(x)));
  assert.ok(p.some((x) => /Scene 6: "Bob"/.test(x)));
  assert.ok(p.some((x) => /Scene 7: the way of speaking "grumpily"/.test(x)));
});

test("too many host-only scenes and a bad Short length are reported", () => {
  const s = good().map((x) => ({ ...x, visual: { kind: "host" as const, what: "x" } }));
  const p = checkQA({ ...plan(s), shorts: [1] });
  assert.ok(p.some((x) => /only the host/.test(x)));
  assert.ok(p.some((x) => /The Short/.test(x)));
});

import { checkFact, isFact, isQA, profileOf } from "../src/studio/qa.ts";

test("a Short: 100–140 words in 5–8 scenes with hook, step and recap", () => {
  const sc = (beat: QAScene["beat"]): QAScene => ({ beat, visual: { kind: "diagram", what: "x" }, parts: [{ who: QA.host.name, how: "", text: line(20) }] });
  const ok = plan([sc("hook"), sc("step"), sc("step"), sc("step"), sc("recap"), sc("recap")]);
  assert.deepEqual(checkFact(ok), []);
  assert.ok(checkFact(plan([sc("hook"), sc("step")])).some((x) => /too short/.test(x)));
});

test("question and fact kinds share the pipeline; the language follows the kind", () => {
  assert.ok(isQA("fact-vi") && isFact("fact-vi") && !isFact("qa"));
  assert.equal(profileOf("fact-vi").lang, "vi");
  assert.equal(profileOf("fact").channel, "Ask Huy");
  assert.equal(profileOf("qa-vi").channel, "Hỏi Huy");
});
