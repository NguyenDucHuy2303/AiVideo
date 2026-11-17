import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReel, GAP_MS, lastReels } from "../src/studio/facebook.ts";
import { PICK_DEFAULTS } from "../src/studio/pick.ts";
import type { Job } from "../src/studio/jobs.ts";
import { linkOfShort, type PublishSettings } from "../src/studio/publish.ts";

const lines = PICK_DEFAULTS.lines;
const S = { "huy-ke-chuyen": { name: "Huy Kể Chuyện", lang: "vi", long: ["19:30"], shorts: ["07:30"], mode: "manual", facebookPage: "1" } } as PublishSettings;
const NOW = new Date("2026-11-16T10:00:00Z");
const ex = (publishAt: string) => ({ dir: "/x", publishAt, channel: "huy-ke-chuyen", at: "t" });
const film = { videoId: "f", url: "https://youtu.be/f", publishAt: "2026-11-15T12:30:00Z", channel: "huy-ke-chuyen", at: "t", manual: true };
const job = (o: Partial<Job> = {}): Job => ({ slug: "ech", topic: "Ếch", kind: "ngụ ngôn", status: "done", notes: [], history: [], shorts: ["shorts/1.mp4", "shorts/2.mp4"],
  exported: { shorts: [ex("2026-11-16T09:00:00Z"), ex("2026-11-17T09:00:00Z")] }, published: { long: film }, ...o });
const files = ["video.mp4", "shorts/1.mp4"];

test("a Short goes to its channel's Page once its time has come, not before, never twice", () => {
  assert.deepEqual(dueReel(job(), files, S, lines, NOW), { what: "short", index: 0, file: "shorts/1.mp4", channel: "huy-ke-chuyen" });
  assert.equal(dueReel(job({ social: { "facebook:short:0": "t" } }), files, S, lines, NOW), undefined); // (posted; the next is tomorrow)
  assert.equal(dueReel(job(), files, S, lines, new Date("2026-11-16T08:59:00Z")), undefined);
  assert.equal(dueReel(job({ publishHold: true }), files, S, lines, NOW), undefined);
  assert.equal(dueReel(job({ status: "video" }), files, S, lines, NOW), undefined);
  assert.equal(dueReel(job({ fbRetryAt: "2026-11-16T10:20:00Z" }), files, S, lines, NOW), undefined);
  const noPage = { "huy-ke-chuyen": { ...S["huy-ke-chuyen"]!, facebookPage: undefined } } as PublishSettings;
  assert.equal(dueReel(job(), files, noPage, lines, NOW), undefined);
});

test("a Page gets one Reel at a time: late ones wait GAP after the last", () => {
  const posted = job({ slug: "a", facebook: { "facebook:short:0": { videoId: "v", url: "u", at: new Date(NOW.getTime() - GAP_MS / 2).toISOString() } } });
  const last = lastReels([posted], lines);
  assert.equal(dueReel(job(), files, S, lines, NOW, last), undefined);
  assert.ok(dueReel(job(), files, S, lines, new Date(NOW.getTime() + GAP_MS), last));
  // (one found posted by hand does not hold the Page)
  const byHand = job({ slug: "b", facebook: { "facebook:short:0": { videoId: "v", url: "u", at: NOW.toISOString(), byHand: true } } });
  assert.deepEqual(lastReels([byHand], lines), {});
});

test("a Reel waits for its YouTube link, and for that video to be out", () => {
  assert.equal(dueReel(job({ published: {} }), files, S, lines, NOW), undefined); // (no link pasted)
  assert.equal(dueReel(job({ published: { long: { ...film, publishAt: "2026-11-16T12:30:00Z" } } }), files, S, lines, NOW), undefined); // (film scheduled later)
  assert.ok(dueReel(job(), files, S, lines, NOW));
  // A "Did you know?" Short: its own link.
  const fact = (o: Partial<Job>) => job({ kind: "fact-vi", shorts: undefined, published: {}, exported: { shorts: [ex("2026-11-16T09:00:00Z")] }, ...o });
  const ffiles = ["video.mp4"];
  assert.equal(dueReel(fact({}), ffiles, S, lines, NOW), undefined);
  assert.ok(dueReel(fact({ published: { shorts: [{ ...film, url: "https://youtube.com/shorts/s", publishAt: "2026-11-16T09:00:00Z" }] }, exported: {} }), ffiles, S, lines, NOW));
});

test("linkOfShort: the film; a fact Short its long version once out by its time, else itself", () => {
  assert.equal(linkOfShort(job(), 0)?.url, "https://youtu.be/f");
  const mine = { ...film, url: "https://youtube.com/shorts/s", publishAt: "2026-11-16T09:00:00Z" };
  const f = job({ kind: "fact", published: { shorts: [mine] } });
  assert.deepEqual(linkOfShort(f, 0), { url: mine.url, publishAt: mine.publishAt, own: true });
  assert.equal(linkOfShort(f, 0, { ...film, url: "https://youtu.be/L" })?.url, "https://youtu.be/L");
  assert.equal(linkOfShort(f, 0, { ...film, url: "https://youtu.be/L", publishAt: "2026-11-20T12:00:00Z" })?.url, mine.url);
});
