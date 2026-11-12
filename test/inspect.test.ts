import { test } from "node:test";
import assert from "node:assert/strict";
import { issuesOf, summarise, type ActorSample, type Sample } from "../src/animation/inspect.ts";

const W = 1920, H = 1080;
/** A person standing at x (screen), head radius r, arm angles; 4 samples a second over `secs`. */
function film(secs: number, who: Record<string, (t: number) => Partial<ActorSample>>): Sample[] {
  const out: Sample[] = [];
  for (let t = 0; t <= secs; t += 0.25) {
    const actors: Record<string, ActorSample> = {};
    for (const [id, f] of Object.entries(who)) {
      const p = { x: 900, r: 60, armF: [10, 14] as [number, number], ...f(t) };
      const hx = p.head?.[0] ?? p.x, hy = p.head?.[1] ?? 400;
      actors[id] = { kind: "human", opacity: 1, act: "idle", head: [hx, hy], box: [hx - 100, hy - 80, hx + 100, hy + 600], lean: 2 * Math.sin(t * 3), headTilt: 3 * Math.sin(t * 2), ...p };
    }
    out.push({ t, actors });
  }
  return out;
}

test("inspect: an arm pointing, unmoving for 3 s, is held; one that comes down is not", () => {
  const held = issuesOf("s1", {}, film(6, { a: (t) => ({ act: "point", armF: t < 4 ? [82, 4] : [10, 14] }) }), W, H);
  assert.ok(held.some((i) => i.kind === "held" && i.from === 0 && i.to >= 3.9));
  const beat = issuesOf("s1", {}, film(6, { a: (t) => ({ act: "point", armF: t < 1.5 ? [82, 16 + 3 * Math.sin(t * 2)] : [10, 14] }) }), W, H);
  assert.ok(!beat.some((i) => i.kind === "held"));
  // walking with the arms up (carrying) is not a held gesture
  assert.ok(!issuesOf("s1", {}, film(6, { a: () => ({ act: "carry", armF: [150, 30] }) }), W, H).some((i) => i.kind === "held"));
});

test("inspect: still for 5 s (only the mouth), but not a person who moves", () => {
  const still = issuesOf("s1", {}, film(8, { a: () => ({ lean: 0, headTilt: 0 }) }), W, H);
  assert.ok(still.some((i) => i.kind === "still"));
  assert.ok(!issuesOf("s1", {}, film(8, { a: (t) => ({ headTilt: 6 * Math.sin(t) }) }), W, H).some((i) => i.kind === "still"));
});

test("inspect: a head cut by the frame, two faces on each other, a speaker not shown, a prop over the face", () => {
  const cut = issuesOf("s1", {}, film(2, { a: () => ({ head: [900, -10] as [number, number], r: 80 }) }), W, H);
  assert.ok(cut.some((i) => i.kind === "head-cut"));
  const two = issuesOf("s1", {}, film(2, { a: () => ({ head: [900, 400] as [number, number] }), b: () => ({ head: [940, 410] as [number, number] }) }), W, H);
  assert.ok(two.some((i) => i.kind === "faces-overlap" && i.other === "b"));
  const off = issuesOf("s1", { speech: [{ actor: "b", from: 0.5, to: 2.5 }] }, film(3, { a: () => ({}), b: () => ({ head: [2600, 400] as [number, number] }) }), W, H);
  assert.ok(off.some((i) => i.kind === "speaker-off" && i.actor === "b"));
  const prop = issuesOf("s1", { speech: [{ actor: "a", from: 0, to: 2 }] }, film(2, { a: () => ({ prop: "horn", propBox: [850, 380, 960, 460] as [number, number, number, number] }) }), W, H);
  assert.ok(prop.some((i) => i.kind === "prop-face") && prop.some((i) => i.kind === "talk-covered"));
  const r = summarise("x", 120, [...cut, ...two]);
  assert.equal(r.perMinute, Math.round(((cut.length + two.length) / 2) * 10) / 10);
});
