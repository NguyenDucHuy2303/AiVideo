/**
 * Scene plan → scene script. A plan is the short, menu-only description an LLM (or a
 * person) can give reliably: where, when, who stands where doing what, which effects and
 * how it is filmed. This file turns it into exact positions, facings, timings, effects
 * and shots for the cartoon runtime. Pure: the same plan always gives the same script.
 */

export const SETS = ["village", "field", "bamboo", "palace", "mountain", "sky"] as const;
export const TIMES = ["dawn", "day", "dusk", "night"] as const;
export const MOODS = ["calm", "tense", "battle", "majestic"] as const;
export const PLACES = ["left", "center", "right"] as const;
export const ENTRIES = ["none", "from_left", "from_right"] as const;
export const MOTIONS = [
  "idle", "still", "walk", "run", "talk", "call", "point", "wave", "cheer", "bow", "kneel", "sit", "lie", "sit_up",
  "stretch", "heroic", "raise", "worry", "eat", "give", "carry", "march", "charge", "swing", "fall", "fly", "ride", "undress",
] as const;
export const FACES = ["neutral", "happy", "joy", "laugh", "sad", "worried", "angry", "determined", "surprised", "shout", "proud"] as const;
export const EFFECTS = ["transform", "sparkle", "glow", "fire", "smoke", "embers", "flash", "shake", "rays", "pop"] as const;
export const OBJECTS = ["footprint", "mat", "rice", "nong", "bowls", "armor", "banner", "stumps", "stone", "fire_pit"] as const;
export const SHOTS = ["wide", "full", "medium", "track"] as const;

export type Motion = (typeof MOTIONS)[number];
export interface ActorPlan {
  id: string;
  place: (typeof PLACES)[number];
  enter: (typeof ENTRIES)[number];
  act: Motion;
  face: (typeof FACES)[number];
  then: Motion | "none";
  thenFace: (typeof FACES)[number];
}
export interface ScenePlan {
  set: (typeof SETS)[number];
  time: (typeof TIMES)[number];
  mood: (typeof MOODS)[number];
  actors: ActorPlan[];
  /** A group (an army, villagers): copies of one cast member on the right, facing left. */
  crowd?: { id: string; count: number; act: Motion; then: Motion | "none" };
  fx: (typeof EFFECTS)[number][];
  objects: (typeof OBJECTS)[number][];
  shot: (typeof SHOTS)[number];
  /** The lead grows in steps during the scene ("lớn nhanh như thổi"); set by the rules. */
  grow?: boolean;
}

export interface CastMember {
  id: string;
  name: string;
  kind: "human" | "horse";
  /** World scale: 1 for people, about 2.4 for a giant and his horse. */
  scale: number;
  /** The character this one grows out of (a boy → the giant warrior). */
  formOf?: string;
  /** Drawn as a crowd (an army, villagers), never as one character. */
  group?: boolean;
  look: unknown;
}

const SLOT = { left: -520, center: 0, right: 520 } as const;
const MOVING: ReadonlySet<Motion> = new Set(["walk", "run", "call", "march", "charge", "carry"]);

export interface CompileContext {
  duration: number;
  cast: CastMember[];
  /** This scene's character becomes another form (grows into the giant). */
  transform?: { from: string; to: string };
}

/** The scene script for the cartoon runtime (see runtime/player.js). */
export function compileScene(plan: ScenePlan, ctx: CompileContext): Record<string, unknown> {
  const D = ctx.duration, byId = new Map(ctx.cast.map((c) => [c.id, c]));
  const mid = Math.round(D * 0.5 * 100) / 100;
  const cast: Record<string, unknown>[] = [], actions: Record<string, unknown>[] = [], fx: Record<string, unknown>[] = [], shots: Record<string, unknown>[] = [];
  const actors = plan.actors.filter((a) => byId.has(a.id)).slice(0, 4);
  const horse = actors.find((a) => byId.get(a.id)!.kind === "horse");
  const riders = actors.filter((a) => a !== horse && (a.act === "ride" || a.then === "ride") && horse);
  // Who faces whom: people on the left look right, on the right look left.
  const centre = actors.length ? actors.reduce((n, a) => n + SLOT[a.place], 0) / actors.length : 0;
  const ids: string[] = [];

  for (const a of actors) {
    const c = byId.get(a.id)!, riding = riders.includes(a);
    const s = c.scale;
    let x = SLOT[a.place] * Math.max(1, s * 0.8);
    let facing = a.place === "right" || (a.place === "center" && centre > 120) ? -1 : 1;
    if (a.enter === "from_left") facing = 1;
    if (a.enter === "from_right") facing = -1;
    const start = a.enter === "from_left" ? x - 1900 * Math.max(1, s * 0.7) : a.enter === "from_right" ? x + 1900 * Math.max(1, s * 0.7) : x;
    const horseCast = horse ? byId.get(horse.id)! : undefined;
    cast.push({ id: a.id, type: c.kind, look: c.look, x: riding ? undefined : start, scale: riding && horseCast ? horseCast.scale : s, facing, ...(ctx.transform?.to === a.id ? { opacity: 0 } : {}) });
    ids.push(a.id);
    if (riding) {
      actions.push({ actor: a.id, at: -0.1, do: "leap", onto: horse!.id, dur: 0.01, arc: 0 }, { actor: a.id, at: 0, do: "ride", face: a.face });
      if (a.then !== "none" && a.then !== "ride") actions.push({ actor: a.id, at: mid, do: a.then === "swing" ? "ride_swing" : "ride", face: a.thenFace });
      continue;
    }
    let first: Motion = a.act;
    if (a.enter !== "none") {
      const how: Motion = c.kind === "horse" ? (first === "run" || first === "charge" ? "run" : "walk") : MOVING.has(first) ? first : "walk";
      const motion = c.kind === "horse" ? (how === "run" ? "gallop" : "walk") : how;
      actions.push({ actor: a.id, at: 0, do: motion, move: { to: x, ease: "out" }, dur: Math.round(D * 0.45 * 100) / 100, face: a.face });
      if (MOVING.has(first)) first = "still";
      actions.push({ actor: a.id, at: Math.round(D * 0.45 * 100) / 100, do: horseMotion(c, first), face: a.face });
    } else {
      // A galloping horse keeps going (the camera tracks it); people walk a few steps.
      const move = c.kind === "horse" && (first === "run" || first === "charge") ? { move: { speed: facing * (1000 * (s / 2.4) + 300) } } : MOVING.has(first) ? { move: { by: facing * 600 * s, ease: "linear" }, dur: D } : {};
      actions.push({ actor: a.id, at: 0, do: horseMotion(c, first), face: a.face, ...(first === "call" || first === "talk" ? { talk: 1 } : {}), ...move });
    }
    if (a.then !== "none") {
      const then = horseMotion(c, a.then);
      const extra = a.then === "fly" ? { move: { toY: -2400, ease: "in" }, dur: D - mid } : MOVING.has(a.then) ? { move: { by: facing * 700 * s, ease: "in" }, dur: D - mid } : {};
      actions.push({ actor: a.id, at: mid, do: then, face: a.thenFace, ...(a.then === "talk" || a.then === "call" ? { talk: 1 } : {}), ...extra });
      if (a.then === "fall") fx.push({ fx: "impact", on: a.id, at: mid + 0.35, power: 0.3 });
    }
  }
  // A galloping horse keeps going; its rider follows.
  if (horse) {
    const hp = actors.find((a) => a === horse)!;
    if (hp.act === "run" || hp.act === "charge" || (riders.length && hp.enter === "none" && hp.act !== "fly" && hp.act !== "still" && hp.act !== "idle")) {
      for (const a of actions) if (a.actor === horse.id && !a.move) { a.do = "gallop"; a.move = { speed: 1000 * (byId.get(horse.id)!.scale / 2.4) + 300 }; }
    }
  }

  // A crowd on the right (an army, villagers).
  if (plan.crowd && byId.has(plan.crowd.id)) {
    const c = byId.get(plan.crowd.id)!, n = Math.max(2, Math.min(6, plan.crowd.count));
    for (let i = 0; i < n; i++) {
      const id = `${plan.crowd.id}_${i + 1}`, x = 900 + i * 320;
      cast.push({ id, type: "human", look: c.look, x, scale: c.scale * (0.95 + (i % 2) * 0.07), facing: -1 });
      const act = plan.crowd.act, moving = MOVING.has(act);
      actions.push({ actor: id, at: 0, do: act, ...(moving ? { move: { by: -500, ease: "linear" }, dur: D } : {}) });
      if (plan.crowd.then !== "none") {
        const at = Math.round((mid + i * 0.35) * 100) / 100;
        if (at < D - 0.3) {
          actions.push({ actor: id, at, do: plan.crowd.then });
          if (plan.crowd.then === "fall") fx.push({ fx: "impact", on: id, at: at + 0.35, power: 0.3 });
        }
      }
    }
    if (!ids.length) ids.push(`${plan.crowd.id}_1`, `${plan.crowd.id}_${n}`);
  }

  // The transformation: the small form stretches, grows, and the big one takes its place.
  const tf = ctx.transform;
  if (tf && byId.has(tf.from) && byId.has(tf.to)) {
    if (!cast.some((c) => c.id === tf.from)) cast.push({ id: tf.from, type: "human", look: byId.get(tf.from)!.look, x: 0, scale: byId.get(tf.from)!.scale });
    if (!cast.some((c) => c.id === tf.to)) cast.push({ id: tf.to, type: "human", look: byId.get(tf.to)!.look, x: 0, scale: byId.get(tf.to)!.scale, opacity: 0 });
    const from = byId.get(tf.from)!, to = byId.get(tf.to)!, g0 = D * 0.3, x0 = (cast.find((c) => c.id === tf.from)!.x as number) ?? 0;
    (cast.find((c) => c.id === tf.to)! as { x: number }).x = x0;
    const grow = (to.scale / from.scale) * 1.2 * from.scale;
    actions.push({ actor: tf.from, at: Math.max(0, g0 - 1), do: "stretch" }, { actor: tf.from, at: g0, dur: 1.3, set: { scale: grow }, ease: "backOut" },
      { actor: tf.from, at: g0 + 0.1, do: "still", face: "surprised", blend: 0.3 }, { actor: tf.from, at: g0 + 0.55, dur: 0.4, set: { opacity: 0 } },
      { actor: tf.to, at: g0 + 0.55, dur: 0.4, set: { opacity: 1 } }, { actor: tf.to, at: g0 + 0.55, do: "heroic" });
    fx.push({ fx: "transform", on: tf.from, at: g0, dur: 1.3 });
    if (!ids.includes(tf.from)) ids.unshift(tf.from);
  }

  // Growing in steps, each with a little bounce.
  if (plan.grow && ids[0]) {
    const c = cast.find((x) => x.id === ids[0])!, s0 = (c.scale as number) ?? 1;
    [0.2, 0.45, 0.7].forEach((k, i) => actions.push({ actor: ids[0], at: Math.round(D * k * 100) / 100, dur: 0.7, set: { scale: Math.round(s0 * (1 + 0.2 * (i + 1)) * 100) / 100 }, ease: "backOut" }));
    shots.push({ at: 0, type: "full", on: [ids[0]], share: 0.5, sizeLag: 0.6 });
  }

  // Effects on the main character (the first one), timed to the middle of the scene.
  const main = ids[0];
  for (const e of plan.fx) {
    if (e === "transform" && tf) continue;
    if (e === "fire" && horse) fx.push({ fx: "fire", from: horse.id, at: mid, dur: 0.45, up: 0.5 });
    else if (e === "smoke") fx.push({ fx: "smoke", x: 1800, at: -2, dur: D + 2 });
    else if (e === "embers") fx.push({ fx: "embers", x: 600, at: 0, dur: D, width: 2600 });
    else if (e === "rays") fx.push({ fx: "rays", x: 0, at: 0, dur: D, scale: 2.4 });
    else if (e === "flash" || e === "shake") fx.push({ fx: e, at: mid, power: 0.5 });
    else if (main && (e === "sparkle" || e === "glow" || e === "pop" || e === "transform")) fx.push({ fx: e === "transform" ? "glow" : e, on: main, at: e === "pop" ? mid : D * 0.3, dur: D * 0.6 });
  }

  // Objects behind the action.
  const objects = plan.objects.map((o, i) => ({ type: o, x: o === "footprint" || o === "mat" ? 260 : 300 + i * 220, ...(o === "banner" ? { x: 1500 + i * 700, color: "#3a1a1a" } : {}) }));

  // Shots: the whole scene first, then closer on the main character for the second half.
  const tracked = horse && actions.some((a) => a.actor === horse.id && (a.move as { speed?: number })?.speed);
  const onAll = tracked ? [horse!.id, ...riders.map((r) => r.id)] : ids.length ? ids : cast.map((c) => c.id as string).slice(0, 2);
  if (!shots.length) shots.push({ at: 0, type: tracked ? "track" : plan.shot === "track" ? "track" : plan.shot === "medium" ? "full" : plan.shot, on: onAll, push: 0.06 });
  // Like a TV cartoon: establish everyone, then cut close to the one acting and to the one
  // reacting, every two or three seconds.
  const people = ids.filter((id) => byId.get(id)?.kind === "human" || cast.find((c) => c.id === id && c.type === "human"));
  if (!tracked && main && !tf && !plan.grow && D > 4) {
    if (people.length >= 2 && !plan.crowd) {
      shots.push({ at: Math.round(D * 0.36 * 100) / 100, type: "close", on: [people[0]], push: 0.05 });
      shots.push({ at: Math.round(D * 0.68 * 100) / 100, type: "close", on: [people[1]], push: 0.05 });
    } else if (people.length) shots.push({ at: mid, type: plan.crowd ? "full" : "close", on: [people[0]], push: 0.06 });
  }
  if (tf) shots.splice(0, shots.length, { at: 0, type: "full", on: [tf.from], share: 0.45, sizeLag: 0.5 }, { at: D * 0.3 + 1.5, type: "wide", on: [tf.to], push: 0.06 });

  return { duration: D, time: plan.time, mood: plan.mood, set: { name: plan.set, objects }, cast, actions, fx, shots };
}

/** Horse versions of the human motion names. */
function horseMotion(c: CastMember, m: Motion): string {
  if (c.kind !== "horse") return m;
  if (m === "run" || m === "charge") return "gallop";
  if (m === "walk" || m === "march" || m === "carry") return "walk";
  if (m === "fly") return "fly";
  if (m === "raise" || m === "heroic" || m === "shout" as Motion) return "rear";
  return "stand";
}
