import assert from "node:assert/strict";
import { test } from "node:test";
import { fixPlan } from "../src/animation/compile/plan.ts";
import { compileScene, type CastMember, type ScenePlan } from "../src/animation/compile/scene.ts";

const cast: CastMember[] = [
  { id: "giong", name: "Gióng", kind: "human", scale: 1, look: { body: "child" } },
  { id: "hero", name: "tráng sĩ", kind: "human", scale: 2.4, formOf: "giong", look: { body: "strong" } },
  { id: "horse", name: "ngựa sắt", kind: "horse", scale: 2.4, look: { kind: "iron" } },
  { id: "mother", name: "mẹ", kind: "human", scale: 1, look: { body: "woman" } },
  { id: "enemy", name: "giặc Ân", kind: "human", scale: 1, group: true, look: { body: "man" } },
];
const plan = (o: Partial<ScenePlan> = {}): ScenePlan => ({ set: "village", time: "day", mood: "calm", actors: [], fx: [], objects: [], shot: "wide", ...o });
const actor = (id: string, act: ScenePlan["actors"][number]["act"], o = {}) => ({ id, place: "left" as const, enter: "none" as const, act, face: "neutral" as const, then: "none" as const, thenFace: "neutral" as const, ...o });
const forms = new Map([["hero", "giong"]]);

test("the narration wins: lying, then speaking up", () => {
  const { plan: p } = fixPlan(plan({ actors: [actor("giong", "idle")] }), "Gióng nằm ngửa, rồi bỗng cất tiếng nói.", cast, forms, false);
  assert.equal(p.actors[0]!.act, "lie");
  assert.equal(p.actors[0]!.then, "sit_up");
});

test("everyone the sentence names is on screen, groups as a crowd", () => {
  const { plan: p } = fixPlan(plan({ actors: [actor("giong", "idle")] }), "Mẹ Gióng nhìn giặc Ân kéo sang xâm lược.", cast, forms, false);
  assert.deepEqual(p.actors.map((a) => a.id).sort(), ["giong", "mother"]);
  assert.equal(p.crowd?.id, "enemy");
  assert.equal(p.crowd?.act, "march");
});

test("flying up to the sky: horse and rider fly together", () => {
  const { plan: p } = fixPlan(plan({ actors: [actor("hero", "ride"), actor("horse", "still")] }), "Gióng một mình một ngựa bay thẳng lên trời.", cast, forms, false, undefined, new Map([["giong", "hero"]]));
  assert.equal(p.actors.find((a) => a.id === "horse")!.then, "fly");
  assert.equal(p.actors.find((a) => a.id === "hero")!.act, "ride");
});

test("a transformation scene grows the boy into the hero", () => {
  const { plan: p, transform } = fixPlan(plan({ actors: [actor("giong", "stretch")] }), "Cậu bé Gióng vươn vai một cái, bỗng chốc trở thành một tráng sĩ.", cast, forms, true);
  assert.deepEqual(transform, { from: "giong", to: "hero" });
  const s = compileScene(p, { duration: 6, cast, transform }) as { cast: { id: string; opacity?: number }[]; actions: { actor: string; set?: { scale?: number } }[]; fx: { fx: string }[] };
  assert.equal(s.cast.find((c) => c.id === "hero")!.opacity, 0, "the hero appears during the growth");
  assert.ok(s.actions.some((a) => a.actor === "giong" && a.set?.scale && a.set.scale > 2), "the boy grows");
  assert.ok(s.fx.some((f) => f.fx === "transform"));
});

test("compiled scenes: walking in from a side, facing each other, reaction close-ups", () => {
  const s = compileScene(plan({ actors: [actor("mother", "talk", { enter: "from_left" }), actor("giong", "sit", { place: "right" })] }), { duration: 7, cast }) as { cast: { id: string; x: number; facing: number }[]; actions: { actor: string; at: number; do?: string; move?: { to?: number } }[]; shots: unknown[] };
  const mother = s.cast.find((c) => c.id === "mother")!, boy = s.cast.find((c) => c.id === "giong")!;
  assert.ok(mother.x < -1000 && mother.facing === 1, "enters from off-screen left, facing right");
  assert.equal(boy.facing, -1, "on the right, looking left");
  assert.ok(s.actions.some((a) => a.actor === "mother" && a.do === "walk" && a.move?.to === -520));
  // Establishing shot, then close on the one acting, then on the one reacting.
  assert.deepEqual((s.shots as { type: string; on: string[] }[]).map((x) => [x.type, x.on[0]]), [["wide", "mother"], ["close", "mother"], ["close", "giong"]]);
});

test("a rider is put in the saddle and the horse gallops", () => {
  const s = compileScene(plan({ actors: [actor("hero", "ride"), actor("horse", "run", { place: "center" })] }), { duration: 6, cast }) as { actions: { actor: string; do?: string; onto?: string; move?: { speed?: number } }[]; shots: { type: string }[] };
  assert.ok(s.actions.some((a) => a.actor === "hero" && a.onto === "horse"));
  assert.ok(s.actions.some((a) => a.actor === "horse" && a.do === "gallop" && a.move?.speed));
  assert.equal(s.shots[0]!.type, "track");
});
