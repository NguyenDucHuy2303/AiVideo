import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FFMPEG } from "../src/config.ts";
import { getLayout } from "../src/layouts/index.ts";
import { queryVariants, rankCandidates, type Candidate } from "../src/library/online.ts";
import { acceptable, cleanTags, focusFrom, tagImage } from "../src/library/tag.ts";
import { resolveFit } from "../src/renderer/ffmpeg/scene.ts";
import type { ChatRequest, LlmProvider } from "../src/script/providers.ts";
import { run } from "../src/utils/process.ts";

test("cleanTags normalizes and drops generic words", () => {
  assert.deepEqual(cleanTags(["Night_Sky", "night sky", "photography", " Stars ", "x"]), ["night sky", "stars"]);
});

test("focusFrom maps the coarse subject position to a crop point", () => {
  assert.deepEqual(focusFrom({ horizontal: "left", vertical: "bottom" }), { x: 0.3, y: 0.7 });
  assert.deepEqual(focusFrom({ horizontal: "center", vertical: "middle" }), { x: 0.5, y: 0.5 });
});

test("tagImage sends a downscaled image and retries an unusable reply", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wata-tag-"));
  try {
    const img = path.join(dir, "big.png");
    await run(FFMPEG, ["-v", "error", "-f", "lavfi", "-i", "color=c=navy:s=2000x1200", "-frames:v", "1", img], { timeoutMs: 20_000 });
    const calls: ChatRequest[] = [];
    const replies = ["not json", JSON.stringify({ description: "A plain navy square.", tags: ["Navy", "blue", "plain", "photo", "color"], subject: { horizontal: "center", vertical: "middle" } })];
    const provider: LlmProvider = {
      id: "fake",
      model: "fake",
      async check() {},
      async release() {},
      async chat(r) {
        calls.push(r);
        return replies.shift()!;
      },
    };
    const tags = await tagImage(img, provider, path.join(dir, "work"));
    assert.deepEqual(tags.tags, ["navy", "blue", "plain", "color"]);
    assert.equal(calls.length, 2);
    const sent = Buffer.from(calls[0]!.messages[0]!.images![0]!, "base64");
    assert.equal(sent.subarray(0, 2).toString("hex"), "ffd8", "the preview is a JPEG");
    assert.ok(sent.length < (await fs.stat(img)).size * 2);
    assert.deepEqual(await fs.readdir(path.join(dir, "work")), [], "the preview is removed");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const cand = (id: string, extra: Partial<Candidate> = {}): Candidate => ({
  source: "openverse", id, downloadUrl: `https://x/${id}.jpg`, pageUrl: `https://x/${id}`, width: 2000, height: 1300,
  description: "", tags: [], license: "CC BY 2.0", ...extra,
});

test("rankCandidates prefers relevant, sharp, well-oriented photos and skips used ones", () => {
  const ranked = rankCandidates("person sleeping bed", [
    cand("bedding", { description: "Hannah Montana bedding" }),
    cand("small", { description: "person sleeping in bed", width: 500, height: 400 }),
    cand("good", { description: "a person sleeping", tags: ["bed"] }),
    cand("used", { description: "person sleeping bed" }),
    cand("unrelated", { description: "soldier video game" }),
  ], { orientation: "landscape", exclude: new Set(["openverse:used"].map((s) => s.replace("openverse:", ""))) });
  assert.deepEqual(ranked.map((c) => c.id), ["good"], "bedding shares no word; small is under 600px; unrelated dropped; used excluded");
});

test("pexels results are kept even without matching words (its ranking is reliable)", () => {
  const ranked = rankCandidates("tired man", [cand("p1", { source: "pexels" })], { orientation: "landscape", exclude: new Set() });
  assert.equal(ranked.length, 1);
});

test("queryVariants shortens long queries", () => {
  assert.deepEqual(queryVariants("tired man desk night laptop"), ["tired man desk night laptop", "tired man desk", "tired man"]);
  assert.deepEqual(queryVariants("brain"), ["brain"]);
});

test("resolveFit covers when sharp enough, otherwise shows the whole image", () => {
  const portrait = getLayout("9x16");
  const wide = getLayout("16x9");
  assert.equal(resolveFit("auto", { width: 3000, height: 2000 }, portrait), "cover");
  assert.equal(resolveFit("auto", { width: 1024, height: 683 }, portrait), "contain");
  assert.equal(resolveFit("auto", { width: 1024, height: 683 }, wide), "contain");
  assert.equal(resolveFit("auto", { width: 1600, height: 1067 }, wide), "cover");
  assert.equal(resolveFit("cover", { width: 100, height: 100 }, wide), "cover");
});

test("acceptable keeps fitting photos and illustrations, rejects diagrams and poor fits", () => {
  assert.equal(acceptable({ shows: "", kind: "photo", fit: 9 }), true);
  assert.equal(acceptable({ shows: "", kind: "illustration", fit: 6 }), true);
  assert.equal(acceptable({ shows: "", kind: "diagram", fit: 9 }), false);
  assert.equal(acceptable({ shows: "", kind: "photo", fit: 5 }), false);
});

test("candidates from tag-based sources need a word shared with the query", () => {
  const ranked = rankCandidates("child sleeping", [
    cand("a", { source: "pixabay", tags: ["child", "sleep", "bed"], description: "child, sleep, bed" }),
    cand("b", { source: "pixabay", tags: ["car"], description: "car" }),
  ], { orientation: "landscape", exclude: new Set() });
  assert.deepEqual(ranked.map((c) => c.id), ["a"]);
});
