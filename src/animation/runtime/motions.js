/*
 * The motion library. A motion is a function of τ (seconds since it started) and a context
 * { B: body sizes, dur, params, stride (rider: the horse's stride phase) } that returns a pose
 * (see WA.human.apply / WA.horse.apply). The player crossfades from one motion to the next.
 * Cycles use eased key tables (WA.core.cycle) so steps and strides have weight.
 */
(function () {
  const { cycle, bump, seg, smooth, EASE, lerp, clamp } = WA.core;
  const TAU = Math.PI * 2;
  const sin = Math.sin, cos = Math.cos;

  // Leg keys for one step (u = 0: this foot strikes the ground in front).
  const WALK_THIGH = [[0, 24], [0.5, -22], [1, 24]];
  const WALK_KNEE = [[0, -4], [0.18, -2], [0.5, -10], [0.68, -58], [0.86, -16], [1, -4]];
  const RUN_THIGH = [[0, 42], [0.42, -38], [0.6, -20], [0.85, 50], [1, 42]];
  const RUN_KNEE = [[0, -10], [0.3, -14], [0.55, -105], [0.8, -60], [1, -10]];

  const human = {
    idle: (τ, c) => ({
      breath: 0.015 * sin(τ * 4), lean: 1.5 * sin(τ * 1.3), headTilt: 0,
      legF: [4, -2], legB: [-4, -2], armF: [8 + 3 * sin(τ * 1.7), 14], armB: [-6, 10], tuft: 4 * sin(τ * 3), face: c.face || "neutral",
    }),
    still: (τ, c) => ({ breath: 0.012 * sin(τ * 4), legF: [3, -2], legB: [-3, -2], armF: [6, 12], armB: [-4, 10], face: c.face || "neutral" }),
    walk: (τ, c) => {
      const u = (τ * (c.params.speed || 1)) / 0.9, ph = TAU * u;
      return {
        lean: 4, headTilt: 1, dy: 2 + 2 * cos(2 * ph),
        legF: [cycle(WALK_THIGH, u), cycle(WALK_KNEE, u)], legB: [cycle(WALK_THIGH, u + 0.5), cycle(WALK_KNEE, u + 0.5)],
        armF: [4 - 20 * cos(ph), 18 + 6 * sin(ph)], armB: [-4 + 20 * cos(ph), 18 - 6 * sin(ph)], tuft: 8 * sin(2 * ph), face: c.face || "neutral",
      };
    },
    run: (τ, c) => {
      const u = (τ * (c.params.speed || 1)) / 0.55, ph = TAU * u;
      return {
        lean: 14, headTilt: -4, dy: 6 + 6 * cos(2 * ph),
        legF: [cycle(RUN_THIGH, u), cycle(RUN_KNEE, u)], legB: [cycle(RUN_THIGH, u + 0.5), cycle(RUN_KNEE, u + 0.5)],
        armF: [10 - 40 * cos(ph), 80], armB: [-10 + 40 * cos(ph), 80], tuft: 14 * sin(2 * ph), face: c.face || "determined",
      };
    },
    /** Vươn vai: a small crouch for momentum, then arms up behind the head with a yawn. */
    stretch: (τ, c) => {
      const crouch = bump(τ, 0, 0.45), st = smooth(seg(τ, 0.35, 0.9)), yawn = bump(τ, 0.4, 1.15);
      return {
        sy: 1 - crouch * 0.05 + st * 0.03, lean: lerp(crouch * 8, -9, st), headTilt: lerp(crouch * 6 - 2, -16, st),
        legF: [lerp(4 + crouch * 16, 6, st), lerp(-2 - crouch * 30, 0, st)], legB: [lerp(-4 + crouch * 10, -6, st), lerp(-2 - crouch * 30, 0, st)],
        armF: [lerp(10 - crouch * 20, 198, st), lerp(16, -14, st)], armB: [lerp(-8 - crouch * 14, 188, st), lerp(12, -12, st)],
        armsBehindHead: st > 0.35, tuft: 10 * sin(τ * 7) * (0.3 + crouch + st * 0.5),
        face: yawn > 0.3 ? "yawn" : c.face || "happy",
      };
    },
    heroic: (τ, c) => ({
      breath: 0.012 * sin(τ * 3.5), legF: [16, -6], legB: [-18, -4], armF: [116 + 4 * sin(τ * 2), 24], armB: [-22, 66], headTilt: -4,
      face: c.face || "determined",
    }),
    raise: (τ, c) => ({ legF: [10, -4], legB: [-12, -4], armF: [lerp(40, 165, EASE.backOut(τ / 0.5)), 8], armB: [-20, 60], headTilt: -10, face: c.face || "shout" }),
    point: (τ, c) => ({ ...human.idle(τ, c), armF: [lerp(10, 86, EASE.out(τ / 0.4)), 4], headTilt: -2, face: c.face || "determined" }),
    talk: (τ, c) => ({ ...human.idle(τ, c), armF: [30 + 18 * sin(τ * 2.6), 50 + 20 * sin(τ * 3.1)], talk: 1, face: c.face || "neutral" }),
    wave: (τ, c) => ({ ...human.idle(τ, c), armF: [150, 40 + 30 * sin(τ * 10)], face: c.face || "happy" }),
    cheer: (τ, c) => ({ ...human.idle(τ, c), dy: -6 * Math.abs(sin(τ * 6)), armF: [150 + 20 * sin(τ * 8), 30], armB: [140 - 20 * sin(τ * 8), 30], talk: 0.6, face: c.face || "laugh" }),
    bow: (τ, c) => { const k = EASE.inOut(τ / 0.6); return { legF: [4, -2], legB: [-4, -2], lean: 38 * k, headTilt: 18 * k, armF: [30 * k, 50 * k], armB: [20 * k, 50 * k], face: c.face || "neutral" }; },
    kneel: (τ, c) => { const k = EASE.out(τ / 0.5); return { dy: c.B.thigh * 0.95 * k, legF: [90 * k, -92 * k], legB: [-12 * k, -100 * k], lean: 6, armF: [30, 60], armB: [20, 60], face: c.face || "worried" }; },
    sit: (τ, c) => { const k = EASE.out(τ / 0.5); return { dy: (c.B.thigh + c.B.shin * 0.85) * k, legF: [88 * k, -70 * k], legB: [80 * k, -80 * k], lean: 4, armF: [30, 50], armB: [20, 50], face: c.face || "neutral" }; },
    crouch: (τ, c) => ({ dy: 18, legF: [36, -70], legB: [20, -64], armF: [60, 40], armB: [-40, 60], lean: 16, headTilt: -10, face: c.face || "determined" }),
    leap: (τ, c) => ({ legF: [86, -118], legB: [64, -108], armF: [160, 12], armB: [120, 30], lean: 12, headTilt: -8, capeWave: 1, face: c.face || "shout" }),
    ride: (τ, c) => {
      const u = c.stride ?? τ / 0.44;
      return {
        seated: true, hideBackLeg: true, legF: [60, -82], legB: [44, -74], armF: [100 + 12 * sin(TAU * u), 16], armB: [72, 54],
        lean: 16 + 3 * sin(TAU * u), headTilt: -10, capeWave: 1.1, talk: c.params.shout ? 0.3 : 0, face: c.face || (c.params.shout ? "shout" : "determined"),
      };
    },
    /** Strike with the prop, again and again (a bamboo, a whip, a spear). */
    swing: (τ, c) => {
      const u = τ / (c.params.period || 0.7), k = cycle([[0, 0], [0.55, 1], [0.7, -0.15], [1, 0]], u);
      return { legF: [20, -8], legB: [-20, -4], lean: -6 + 22 * (1 - k), armF: [lerp(70, 190, k), lerp(10, 30, k)], armB: [-30, 60], headTilt: -6, capeWave: 0.6, face: c.face || "shout" };
    },
    ride_swing: (τ, c) => {
      const u = τ / (c.params.period || 0.6), k = cycle([[0, 0], [0.55, 1], [0.7, -0.15], [1, 0]], u), r = human.ride(τ, c);
      return { ...r, armF: [lerp(60, 200, k), lerp(10, 30, k)], lean: r.lean + 10 * (1 - k), face: "shout", talk: 0.3 };
    },
    fall: (τ, c) => { const k = EASE.out(τ / 0.55); return { rot: -84 * k, dy: (c.B.thigh + c.B.shin) * 0.8 * k, legF: [30 * k, -20], legB: [10, -10], armF: [140 - 40 * k, 20], armB: [160 - 60 * k, 20], face: "surprised" }; },
    /** Lying on the back, as the baby Gióng who would not speak. */
    lie: (τ, c) => ({ rot: -90, dy: c.B.thigh + c.B.shin * 0.7, legF: [70 + 14 * sin(τ * 3), -30 - 20 * sin(τ * 3)], legB: [60 - 10 * sin(τ * 3), -40], armF: [130 + 15 * sin(τ * 2.3), 30], armB: [110 - 10 * sin(τ * 2.3), 30], headTilt: -6, face: c.face || "neutral" }),
    fly: (τ, c) => ({ lean: -4, legF: [-6, -12], legB: [-14, -18], armF: [172 + 4 * sin(τ * 3), 0], armB: [164, 4], headTilt: -14, capeWave: 1.3, dy: 0, face: c.face || "proud" }),
    eat: (τ, c) => { const k = Math.max(0, sin(τ * 4)); return { ...human.idle(τ, c), armF: [60 + 50 * k, 100 + 30 * k], talk: 0.4, face: c.face || "happy" }; },
    give: (τ, c) => ({ ...human.idle(τ, c), lean: 10, armF: [lerp(10, 72, EASE.out(τ / 0.5)), 18], armB: [lerp(0, 60, EASE.out(τ / 0.5)), 30], face: c.face || "happy" }),
    worry: (τ, c) => ({ ...human.idle(τ, c), armF: [40, 76], armB: [36, 80], headTilt: 6, face: c.face || "worried" }),
    land: (τ, c) => ({ ...human.ride(τ, c), sy: 1 - 0.06 * bump(τ, 0, 0.25) }),
    /** From lying on the back to sitting up (the silent child who suddenly speaks). */
    sit_up: (τ, c) => {
      const k = EASE.inOut(τ / 0.7), lie = human.lie(τ, c), sit = human.sit(1, c);
      return { ...WA.core.blend(lie, { ...sit, rot: 0 }, k), talk: c.params.talk ?? (k > 0.8 ? 1 : 0), face: c.face || "determined" };
    },
    /** Walking and calling out, a hand at the mouth (the king's messenger). */
    call: (τ, c) => ({ ...human.walk(τ, c), armF: [118, 128], talk: 1, headTilt: -8, face: c.face || "shout" }),
    /** Marching with a spear upright. */
    march: (τ, c) => ({ ...human.walk(τ, { ...c, params: { speed: 1.1, ...c.params } }), armF: [52, -40], lean: 2, face: c.face || "angry" }),
    /** Charging with a weapon levelled. */
    charge: (τ, c) => ({ ...human.run(τ, c), armF: [80, -10], face: c.face || "shout", talk: 0.5 }),
    /** Holding something up with both hands (the iron armour, a basket of rice). */
    carry: (τ, c) => ({ ...human.walk(τ, c), armF: [150, 30], armB: [150, 30], lean: -2, face: c.face || "happy" }),
    /** Taking off the armour: hands across the chest, then thrown open. */
    undress: (τ, c) => { const k = cycle([[0, 0], [0.5, 1], [1, 0]], seg(τ, 0, c.dur || 1.2)); return { ...human.still(τ, c), armF: [lerp(10, 40, k), lerp(14, 120, k)], armB: [lerp(-6, 30, k), lerp(10, 120, k)], lean: 6 * k, face: c.face || "proud" }; },
    hold_bowl: (τ, c) => ({ ...human.idle(τ, c), armF: [40, 60], face: c.face || "happy" }),
  };

  // Gallop: per leg, angle keys over one stride (u). Four beats, a moment of flight.
  const FRONT_U = [[0, 34], [0.32, -30], [0.45, -44], [0.68, 6], [0.86, 48], [1, 34]];
  const FRONT_L = [[0, 0], [0.32, -6], [0.5, -112], [0.7, -70], [0.86, 8], [1, 0]];
  const HIND_U = [[0, 28], [0.38, -38], [0.55, -24], [0.82, 34], [1, 28]];
  const HIND_L = [[0, -10], [0.38, 14], [0.55, 78], [0.8, 30], [1, -10]];
  const PHASE = [0.45, 0, 0.56, 0.1]; // far front, far hind, near front, near hind
  const FRONT = [true, false, true, false];
  const STRIDE = 0.44;

  const horse = {
    /** Galloping through the air, legs tucked, rising (the flight to the sky). */
    fly: (τ, c) => { const g = horse.gallop(τ, { ...c, stride: τ / 0.6, params: { amount: 0.7 } }); return { ...g, pitch: -10 + 3 * Math.sin(τ * 2), bob: 0 }; },
    stand: (τ) => ({ bob: 0, pitch: 0, legs: [[2, 0], [-2, 0], [-2, 0], [2, 0]], neck: 2 * sin(τ * 1.1), head: 3 * sin(τ * 1.7), tail: 0, maneFlow: 0 }),
    gallop: (τ, c) => {
      const u = c.stride ?? τ / STRIDE, a = clamp(c.params.amount ?? 1);
      return {
        bob: a * (10 * cos(TAU * (u - 0.7)) - 6), pitch: a * 4 * sin(TAU * (u - 0.2)),
        legs: PHASE.map((ph, i) => [a * cycle(FRONT[i] ? FRONT_U : HIND_U, u + ph), a * cycle(FRONT[i] ? FRONT_L : HIND_L, u + ph)]),
        neck: a * 5 * sin(TAU * (u + 0.1)), head: a * 6 * sin(TAU * (u + 0.25)), tail: -10 * a, maneFlow: a,
      };
    },
    walk: (τ, c) => {
      const u = c.stride ?? τ / 0.8;
      const leg = (ph, front) => { const v = TAU * (u + ph); return [16 * sin(v), (front ? -50 : 40) * Math.max(0, sin(v + 1.2))]; };
      return { bob: -4 * Math.abs(sin(TAU * u * 2)), pitch: 1.5 * sin(TAU * u), legs: [leg(0.5, true), leg(0, false), leg(0, true), leg(0.5, false)], neck: 4 * sin(TAU * u), head: 4 * sin(TAU * u + 1), tail: -4, maneFlow: 0.3 };
    },
    /** Rears up on the hind legs and comes down (for a snort of fire, a battle cry). */
    rear: (τ, c) => {
      const r = bump(τ, 0, c.dur || 0.75);
      return { bob: -30 * r, pitch: -16 * r, legs: [[70 * r, -100 * r], [-14 * r, 10 * r], [76 * r, -106 * r], [-12 * r, 8 * r]], neck: 10 * r, head: -14 * r, tail: 10 * r, maneFlow: 0.4 };
    },
  };

  WA.motions = { human, horse, STRIDE };
})();
