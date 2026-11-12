/*
 * Acting: what makes a character look alive on top of the motion it plays (WA.motions). A
 * pure function of time like everything else, so frames stay independent.
 *
 *   gestures have beats   a point, a raised arm, an offered hand rise, hold a moment (never
 *                          quite frozen: the hand drifts a little) and come back to rest
 *   standing is not still  every few seconds a small thing: the weight shifts, the head tilts
 *                          or nods, a hand settles; slow sways underneath
 *   speaking               the head dips on the stressed syllables (from the voice's loudness),
 *                          the free hand moves with the phrases
 *   listening              the head turns a little to the speaker and nods as a line ends
 *
 * Walking, running, riding, lying, flying and the like are left as they are. A scene can keep
 * a gesture up with "hold": true on its action (or a number of seconds).
 */
(function () {
  const { lerp, clamp, EASE, seg } = WA.core;
  const sin = Math.sin;

  /** Seconds a gesture is held before the arms come back to rest. */
  const GESTURE = { point: 1.5, give: 1.8, raise: 1.9, heroic: 2.2, wave: 2.4 };
  /** Still poses of the whole body, kept but breathing (sitting, kneeling, a bow). */
  const QUIET = new Set(["sit", "kneel", "bow", "crouch"]);
  /** Motions that bring the front hand to the face. */
  const HAND_TO_FACE = new Set(["call", "eat"]);
  /** Motions a person does standing (the rest of the acting applies to them). */
  const STANDING = new Set(["idle", "still", "talk", "point", "give", "raise", "heroic", "wave", "worry", "hold_bowl"]);
  /** Motions that leave the front hand free for talking gestures. */
  const FREE_HAND = new Set(["idle", "still", "talk", "worry"]);

  /** A small deterministic random generator (mulberry32). */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 0 → 1 → 0 over [a, a + d], smooth. */
  const bump = (t, a, d) => { const k = seg(t, a, a + d); return k <= 0 || k >= 1 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * k); };

  /**
   * The little things one person does over a scene: times and kinds fixed by the seed.
   * kinds: nod, tilt (left/right), shift (weight), settle (a hand moves and comes back).
   */
  function plan(seed, seconds) {
    const r = rng(seed ^ 0x5bd1e995), out = [];
    for (let t = 0.6 + r() * 1.6; t < seconds + 4; t += 2.4 + r() * 2.8) {
      const u = r();
      out.push({ at: t, kind: u < 0.3 ? "nod" : u < 0.55 ? "tilt" : u < 0.8 ? "shift" : "settle", sign: r() < 0.5 ? -1 : 1, size: 0.7 + r() * 0.6, dur: 0.9 + r() * 0.9 });
    }
    return out;
  }

  /** Talking gestures within a line: a beat every 1.4–2.6 s (the first soon after it starts). */
  function beats(seed, from, to) {
    const r = rng(seed ^ Math.round(from * 1000)), out = [];
    for (let t = from + 0.15 + r() * 0.35; t < to - 0.5; t += 1.4 + r() * 1.2) out.push({ at: t, dur: 0.8 + r() * 0.5, size: 0.6 + r() * 0.5, both: r() < 0.25 });
    return out;
  }

  /**
   * Add the acting to a pose. ctx: { t (scene time), clip (clip time: speech is timed in it),
   * cur (the action playing), seed, events (plan), rest (the idle pose at t), holding (a prop in
   * hand), speech: { k (seconds into the line), env, beats } when speaking, listen: the line
   * being listened to }.
   */
  function apply(pose, ctx) {
    const name = ctx.cur.do || "idle";
    // 0. Props: a hand that goes to the mouth (calling out, eating) while it holds something
    // would put the thing across the face. The horn (tù và) is raised forward, and lowered to
    // speak; anything else is held low in front.
    if (ctx.holding && HAND_TO_FACE.has(name) && !pose.seated) {
      pose = { ...pose };
      if (ctx.prop === "horn" && !ctx.speech) pose.armF = [100 + 3 * sin(ctx.t * 1.9 + ctx.seed), 22];
      else pose.armF = [26 + 3 * sin(ctx.t * 1.3 + ctx.seed), 42];
    }
    // Sitting, kneeling, bowing: only the head and a little sway (the arms are part of the pose).
    if (QUIET.has(name) && !pose.seated && Math.abs(pose.rot || 0) <= 30) {
      const q = { ...pose };
      q.headTilt = (q.headTilt || 0) + 2 * sin(ctx.t * 0.35 + ctx.seed * 3);
      q.lean = (q.lean || 0) + 1.2 * sin(ctx.t * 0.4 + ctx.seed);
      for (const e of ctx.events) {
        if (ctx.t < e.at || ctx.t > e.at + e.dur || e.kind === "settle") continue;
        const b = bump(ctx.t, e.at, e.dur) * e.size;
        q.headTilt += e.kind === "nod" ? 6 * b : e.kind === "tilt" ? 5 * e.sign * b : 0;
        if (e.kind === "shift") q.lean += 2 * e.sign * b;
      }
      if (ctx.speech) { const env = ctx.speech.env || [], i = Math.floor(ctx.speech.k * 30); q.headTilt += 4 * clamp(((env[i] || 0) - (env[Math.max(0, i - 8)] || 0)) * 3); }
      return q;
    }
    if (!STANDING.has(name) || pose.seated || Math.abs(pose.rot || 0) > 30) return pose;
    const out = { ...pose }, t = ctx.t, s = ctx.seed;
    const add = (k, v) => { out[k] = (out[k] || 0) + v; };
    const arm = (k, a, b) => { const q = out[k] || [0, 0]; out[k] = [q[0] + a, q[1] + b]; };
    // 1. Gestures: held a moment (with a drift), then back to rest.
    let free = FREE_HAND.has(name) && !ctx.holding;
    const hold = ctx.cur.hold === true ? Infinity : typeof ctx.cur.hold === "number" ? ctx.cur.hold : GESTURE[name];
    if (hold !== undefined) {
      const g = t - ctx.cur.at, down = EASE.inOut(seg(g, hold, hold + 0.7));
      if (down > 0) {
        for (const k of ["armF", "armB"]) {
          const a = out[k] || [0, 0], b = ctx.rest[k] || [0, 0];
          out[k] = [lerp(a[0], b[0], down), lerp(a[1], b[1], down)];
        }
        out.headTilt = lerp(out.headTilt || 0, ctx.rest.headTilt || 0, down);
        if (down >= 1 && !ctx.holding) free = true;
      }
      // (still up: the hand is never quite frozen)
      const up = 1 - down;
      arm("armF", up * 2.5 * sin(t * 2.1 + s), up * 4 * sin(t * 1.7 + s * 2));
    }
    // 2. Standing is not still: slow sways and the small events of the plan.
    add("lean", 1.6 * sin(t * 0.43 + s));
    add("headTilt", 1.8 * sin(t * 0.31 + s * 3));
    for (const e of ctx.events) {
      if (t < e.at || t > e.at + e.dur) continue;
      const b = bump(t, e.at, e.dur) * e.size;
      if (e.kind === "nod") add("headTilt", 6 * b);
      else if (e.kind === "tilt") add("headTilt", 5 * e.sign * b);
      else if (e.kind === "shift") add("lean", 3.5 * e.sign * b);
      else if (e.kind === "settle" && free) arm("armB", 10 * b, 12 * b);
    }
    // 3. Speaking: the head dips on the stressed syllables; the free hand moves with the phrases.
    // ("talk" without a voice line: beats over the action itself.)
    const talkBeats = !ctx.speech && name === "talk" ? beats(s, ctx.cur.at, ctx.cur.at + (ctx.cur.dur ?? 60)) : null;
    if (talkBeats && free) for (const b of talkBeats) { const k = bump(t, b.at, b.dur) * b.size; if (k) { arm("armF", 26 * k, 48 * k); if (b.both) arm("armB", 18 * k, 40 * k); } }
    if (ctx.speech) {
      const env = ctx.speech.env || [], i = Math.floor(ctx.speech.k * 30);
      let mean = 0, n = 0;
      for (let j = Math.max(0, i - 12); j <= i; j++) { mean += env[j] || 0; n++; }
      const stress = clamp(((env[i] || 0) - mean / Math.max(1, n)) * 3);
      add("headTilt", 5 * stress);
      if (free) {
        for (const b of ctx.speech.beats) {
          const k = bump(ctx.clip, b.at, b.dur) * b.size;
          if (!k) continue;
          arm("armF", 26 * k, 48 * k);
          if (b.both) arm("armB", 18 * k, 40 * k);
        }
      }
    }
    // 4. Listening: turned a little to the speaker, a nod as their line ends.
    if (ctx.listen) {
      const L = ctx.listen;
      add("headTilt", 2);
      if (L.to - L.from > 1.2 && (s ^ Math.round(L.from * 10)) % 3 !== 0) add("headTilt", 5 * bump(ctx.clip, L.to - 0.25, 0.7));
    }
    return out;
  }

  WA.acting = { apply, plan, beats, GESTURE, STANDING };
})();
