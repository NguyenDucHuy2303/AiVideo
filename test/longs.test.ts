import { test } from "node:test";
import assert from "node:assert/strict";
import { longQuestion, needsLong } from "../src/studio/longs.ts";
import type { Job } from "../src/studio/jobs.ts";

test("a Short's fact becomes its long video's question, always grammatical", () => {
  assert.equal(longQuestion("Did you know octopuses have three hearts and blue blood?", "fact"), "Why is it that octopuses have three hearts and blue blood?");
  assert.equal(longQuestion("Did you know Venus spins backwards?", "fact"), "Why is it that Venus spins backwards?");
  assert.equal(longQuestion("Bạn có biết ở sao Kim, một ngày còn dài hơn cả một năm?", "fact-vi"), "Vì sao ở sao Kim, một ngày còn dài hơn cả một năm?");
  assert.equal(longQuestion("Bạn có biết Trái Đất quay rất nhanh?", "fact-vi"), "Vì sao Trái Đất quay rất nhanh?");
});

test("every approved Short needs its long version, once", () => {
  const job = (o: Partial<Job>): Job => ({ slug: "s", topic: "t", kind: "fact", status: "done", notes: [], history: [], ...o });
  assert.equal(needsLong(job({}), []), true);
  assert.equal(needsLong(job({ status: "review" }), []), false); // (not chosen yet)
  assert.equal(needsLong(job({ kind: "qa" }), []), false);
  const long = job({ slug: "l", kind: "qa" });
  assert.equal(needsLong(job({ longJob: "l" }), [long]), false);
  assert.equal(needsLong(job({ longJob: "gone" }), [long]), true); // (its long one was deleted)
});
