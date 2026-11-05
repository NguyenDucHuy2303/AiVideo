import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { extractJson, isTitleCase, numbersSpoken, sentenceCase, tidyStoryboard, generateStoryboard, lintStoryboard, ScriptError } from "../src/script/generate.ts";
import { llmSchema, type ScriptRequest } from "../src/script/prompt.ts";
import { ollama, type ChatRequest, type LlmProvider } from "../src/script/providers.ts";
import { Storyboard } from "../src/storyboard/schema.ts";

const req: ScriptRequest = { topic: "Giấc ngủ", durationSec: 15, scenes: 3 };

const scene = (narration: string, extra: object = {}) => ({
  narration,
  onScreen: { kicker: "", title: "Tiêu đề ngắn", body: "" },
  visual: { query: "night bed", description: "", mood: "calm" },
  camera: "ken_burns",
  transition: "fade",
  ...extra,
});
const good = {
  title: "Vì sao cần ngủ đủ giấc?",
  scenes: [
    scene("Bạn có biết khi thiếu ngủ, cơ thể bạn sẽ ra sao không? Hãy cùng tìm hiểu nhé."),
    scene("Trong lúc ngủ, não bộ sắp xếp lại ký ức và loại bỏ chất thải của cả ngày dài."),
    scene("Tối nay, hãy tắt điện thoại sớm hơn ba mươi phút và đi ngủ đúng giờ nhé bạn."),
  ],
};

/** Provider that replays canned replies and records what it was asked. */
function fake(replies: string[]): LlmProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return {
    id: "fake",
    model: "fake",
    calls,
    async check() {},
    async release() {},
    async chat(r) {
      calls.push(structuredClone({ ...r, onProgress: undefined }));
      const reply = replies.shift();
      if (reply === undefined) throw new Error("no more replies");
      return reply;
    },
  };
}

test("extractJson tolerates code fences and chatter", () => {
  assert.deepEqual(extractJson('Here it is:\n```json\n{"a": 1}\n```\nEnjoy!'), { a: 1 });
  assert.throws(() => extractJson("no json here"));
});

test("valid first reply: accepted, empty strings dropped", async () => {
  const p = fake([`\`\`\`json\n${JSON.stringify(good)}\n\`\`\``]);
  const r = await generateStoryboard(req, p);
  assert.equal(r.attempts, 1);
  assert.deepEqual(r.storyboard.scenes[0]!.onScreen, { title: "Tiêu đề ngắn" });
  assert.equal(r.storyboard.scenes[0]!.visual.description, undefined);
  assert.ok(Storyboard.safeParse(r.storyboard).success);
});

test("broken replies are sent back with concrete problems until valid", async () => {
  const english = { ...good, scenes: [scene("When you lack sleep, your body suffers a lot."), ...good.scenes.slice(1)] };
  const p = fake(["{ not json", JSON.stringify(english), JSON.stringify(good)]);
  const r = await generateStoryboard(req, p);
  assert.equal(r.attempts, 3);
  assert.equal(p.calls.length, 3);
  const repair1 = p.calls[1]!.messages.at(-1)!.content;
  const repair2 = p.calls[2]!.messages.at(-1)!.content;
  assert.match(repair1, /not valid JSON/);
  assert.match(repair2, /scenes\[0\]\.narration must be in Vietnamese/);
  assert.equal(p.calls[1]!.temperature, 0.3);
});

test("gives up after maxAttempts with the transcript attached", async () => {
  const p = fake(["{}", "{}", "{}"]);
  await assert.rejects(generateStoryboard(req, p), (err: unknown) => {
    assert.ok(err instanceof ScriptError);
    assert.equal(err.transcript.filter((m) => m.role === "assistant").length, 3);
    return true;
  });
});

test("lint: scene count and length are checked against the request", () => {
  const sb = Storyboard.parse({ ...good, scenes: [good.scenes[0]] });
  const { errors, length } = lintStoryboard(sb, { ...req, scenes: 6 });
  assert.ok(errors.some((e) => /1 scenes; write 6/.test(e)));
  assert.ok(length.some((w) => /lengthen it to about/.test(w)));
});

test("LLM schema constrains hints to known presets", () => {
  const schema = JSON.stringify(llmSchema(req));
  assert.match(schema, /"minItems":2,"maxItems":4/);
  assert.match(schema, /"ken_burns"/);
  assert.match(schema, /"slide_left"/);
  const camera = (JSON.parse(schema) as { properties: { scenes: { items: { properties: { camera: { enum: string[] } } } } } }).properties.scenes.items.properties.camera.enum;
  assert.ok(!camera.includes("none"), "a static camera is never offered");
  assert.match(schema, /"const":"big_number"/);
});

test("graphics: big numbers must be spoken, bad graphics are sent back, none is dropped", async () => {
  assert.equal(numbersSpoken("7–9", "Người lớn cần ngủ 7-9 tiếng."), true);
  assert.equal(numbersSpoken("30%", "Khoảng ba mươi phần trăm người lớn ngủ ít."), true);
  assert.equal(numbersSpoken("1.500", "Có 1.500 người tham gia."), true);
  assert.equal(numbersSpoken("80%", "Nhiều người ngủ ít."), false);

  const withGraphics = {
    ...good,
    scenes: [
      { ...good.scenes[0], graphic: { type: "none" } },
      { ...good.scenes[1], graphic: { type: "big_number", value: "90%", unit: "", label: "" } },
      { ...good.scenes[2], graphic: { type: "icon", icon: "moon", label: "Tắt Điện Thoại Sớm Hơn" } },
    ],
  };
  const fixed = { ...withGraphics, scenes: [withGraphics.scenes[0], { ...withGraphics.scenes[1], graphic: { type: "none" } }, withGraphics.scenes[2]] };
  const provider = fake([JSON.stringify(withGraphics), JSON.stringify(fixed)]);
  const result = await generateStoryboard(req, provider);
  assert.equal(result.attempts, 2);
  assert.match(provider.calls[1]!.messages.at(-1)!.content, /graphic\.value "90%" is not said in the narration/);
  assert.equal(result.storyboard.scenes[0]!.graphic, undefined);
  assert.deepEqual(result.storyboard.scenes[2]!.graphic, { type: "icon", icon: "moon", label: "Tắt điện thoại sớm hơn" });
});

test("ollama provider: checks the model and reads the streamed reply", async () => {
  const server = http.createServer((rq, rs) => {
    if (rq.url === "/api/tags") {
      rs.end(JSON.stringify({ models: [{ name: "gemma3:4b" }] }));
      return;
    }
    let body = "";
    rq.on("data", (d) => (body += d));
    rq.on("end", () => {
      const sent = JSON.parse(body);
      assert.equal(sent.model, "gemma3:4b");
      assert.equal(sent.format.type, "object");
      rs.write(`${JSON.stringify({ message: { content: '{"a":' } })}\n`);
      rs.write(`${JSON.stringify({ message: { content: " 1}" } })}\n${JSON.stringify({ done: true })}\n`);
      rs.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await ollama("gemma3:4b", host).check();
    await assert.rejects(ollama("qwen3:8b", host).check(), /ollama pull qwen3:8b/);
    const reply = await ollama("gemma3:4b", host).chat({ messages: [], schema: { type: "object" }, temperature: 0.5 });
    assert.equal(reply, '{"a": 1}');
  } finally {
    server.close();
  }
  await assert.rejects(ollama("x", "http://127.0.0.1:9").check(), /not running/);
});

test("tidyStoryboard uppercases kickers, drops empty fields and bodies that repeat the narration", () => {
  const { storyboard, notes } = tidyStoryboard({
    title: " Ngủ ",
    scenes: [
      { narration: "Thiếu ngủ ảnh hưởng đến sức khỏe của bạn.", onScreen: { kicker: "Ngủ đủ GIấc", title: "Thiếu ngủ", body: "Sức khỏe của bạn bị ảnh hưởng." }, visual: { query: "" } },
      { narration: "Người lớn cần ngủ đủ.", onScreen: { body: "7–9 tiếng mỗi đêm" }, visual: {} },
    ],
  });
  assert.equal(storyboard.title, "Ngủ");
  assert.deepEqual(storyboard.scenes[0]!.onScreen, { kicker: "NGỦ ĐỦ GIẤC", title: "Thiếu ngủ" });
  assert.deepEqual(storyboard.scenes[0]!.visual, {});
  assert.equal(storyboard.scenes[1]!.onScreen.body, "7–9 tiếng mỗi đêm");
  assert.equal(notes.length, 1);
});

test("isTitleCase spots English-style capitalization", () => {
  assert.equal(isTitleCase("Tại Sao Ta Cần Ngủ Đủ Giấc?"), true);
  assert.equal(isTitleCase("Tại sao ta cần ngủ đủ giấc?"), false);
  assert.equal(isTitleCase("Ngủ Đủ"), true);
  assert.equal(isTitleCase("Ngủ"), false);
  assert.equal(sentenceCase("Hà Nội", new Set(["Nội"])), "Hà Nội", "names the narration capitalizes are kept");
});

test("sentenceCase lowercases Title Case but keeps names and acronyms", () => {
  assert.equal(sentenceCase("Tại Sao Ta Cần Ngủ Đủ Giấc?", new Set()), "Tại sao ta cần ngủ đủ giấc?");
  assert.equal(sentenceCase("Giấc Ngủ Ở Việt Nam Và AI", new Set(["Việt", "Nam"])), "Giấc ngủ ở Việt Nam và AI");
  assert.equal(sentenceCase("7-9 Tiếng Mỗi Đêm", new Set()), "7-9 tiếng mỗi đêm");
  const { storyboard } = tidyStoryboard({
    title: "Ngủ Ngon Ở Hà Nội",
    scenes: [{ narration: "Người dân Hà Nội ngủ muộn.", onScreen: { title: "Thói Quen Ngủ Muộn" }, visual: {} }],
  });
  assert.equal(storyboard.title, "Ngủ ngon ở Hà Nội");
  assert.equal(storyboard.scenes[0]!.onScreen.title, "Thói quen ngủ muộn");
});

test("a storyboard that is only too long is asked to shrink, then accepted with a warning", async () => {
  const long = { ...good, scenes: good.scenes.map((s) => ({ ...s, narration: `${s.narration} ${s.narration} ${s.narration}` })) };
  const provider = fake([JSON.stringify(long), JSON.stringify(long), JSON.stringify(long)]);
  const result = await generateStoryboard(req, provider);
  assert.equal(result.attempts, 3);
  assert.match(provider.calls[1]!.messages.at(-1)!.content, /shorten it to about 19 words/);
  assert.ok(result.warnings.some((w) => /instead of 15s/.test(w)));
});
