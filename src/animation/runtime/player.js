/*
 * Plays a scene script. A scene is plain JSON, so a story can be animated without code:
 *
 * {
 *   "duration": 10, "time": "dusk", "set": { "name": "village", "houseX": -640 },
 *   "cast": [ { "id": "boy", "type": "human", "look": { … }, "x": 0, "facing": 1, "scale": 1 },
 *             { "id": "horse", "type": "horse", "look": { "kind": "iron" }, "x": -3400 } ],
 *   "actions": [
 *     { "actor": "boy", "at": 1.0, "do": "stretch" },
 *     { "actor": "boy", "at": 2.05, "dur": 1.3, "set": { "scale": 3.6 }, "ease": "backOut" },
 *     { "actor": "horse", "at": 3.9, "dur": 1.45, "do": "gallop", "move": { "to": 900, "ease": "out" } },
 *     { "actor": "horse", "at": 6.75, "do": "gallop", "move": { "speed": 2100, "accel": 2600 } },
 *     { "actor": "hero", "at": 6.25, "dur": 0.7, "do": "leap", "onto": "horse", "arc": 420 }
 *   ],
 *   "fx": [ { "fx": "transform", "on": "boy", "at": 2.05 } ],
 *   "shots": [ { "at": 0, "type": "full", "on": "boy", "push": 0.12 } ]
 * }
 *
 * Actions: `do` starts a motion (WA.motions) with optional `face`, `talk`, `lookAt` (an actor
 * id: the eyes turn to them) and params; `move` slides
 * the actor (to / by over dur, or at a speed with acceleration); `set` tweens scale,
 * opacity or facing; `onto` makes a leap end in the saddle, after which the actor rides.
 * Every value at time t is computed from the script alone: frames are independent.
 */
(function () {
  const { EASE, seg, lerp, clamp, blend, f2 } = WA.core;
  const BLEND = 0.25;
  const RIDING = new Set(["ride", "ride_swing", "land"]);

  /**
   * People the script stands on the same spot (two "left" in a plan: the boy and the god both at
   * -520) would be drawn on top of each other: spread them apart where they stand, keeping their
   * order and the middle of the group. Riders, someone appearing out of another (a transformation,
   * invisible at first) and anyone moving at a speed are left alone.
   */
  function spread(scene) {
    const acts = scene.actions || [];
    const stand = [];
    for (const c of scene.cast || []) {
      if (c.type === "horse" || c.x === undefined || (c.opacity ?? 1) < 0.5) continue;
      const mine = acts.filter((a) => a.actor === c.id);
      if (mine.some((a) => a.onto || a.move?.speed !== undefined || a.move?.by !== undefined)) continue;
      const to = mine.find((a) => a.move?.to !== undefined);
      stand.push({ c, to, home: to ? to.move.to : c.x, s: c.scale ?? 1 });
    }
    stand.sort((a, b) => a.home - b.home);
    for (let i = 0; i < stand.length; ) {
      // A cluster: everyone within a body's width of the one before.
      let j = i + 1;
      while (j < stand.length && stand[j].home - stand[j - 1].home < 120 * Math.max(stand[j].s, stand[j - 1].s)) j++;
      if (j - i > 1) {
        const group = stand.slice(i, j), gap = 340 * Math.max(...group.map((g) => g.s));
        const mid = group.reduce((n, g) => n + g.home, 0) / group.length;
        group.forEach((g, k) => {
          const dx = mid + (k - (group.length - 1) / 2) * gap - g.home;
          g.c.x += dx;
          if (g.to) g.to.move = { ...g.to.move, to: g.to.move.to + dx };
        });
      }
      i = j;
    }
  }

  function create(container, scene, W, H) {
    const S = WA.stage.createStage(container, W, H, scene.time || "day");
    S.flat = !!scene.styleLook?.flat;
    // The era decides what may be drawn (Văn Lang: boat-roofed stilt houses…), see library/eras.json.
    S.era = scene.era;
    S.architecture = scene.architecture;
    // Set objects can appear at a time ("from") and go away ("until").
    const objects = WA.scenery.build(S, scene.set?.name || "village", { ...(scene.set || {}), painted: !!scene.backdrop }) || [];
    // A painted backdrop (backdrops.ts): the capture waits until it is loaded.
    const ready = scene.backdrop ? S.setBackdrop(scene.backdrop.src, scene.backdrop.size) : Promise.resolve();
    spread(scene);
    const actors = {};
    const shadowLayer = S.layer("shadows"), actorLayer = S.layer("actors");
    for (const c of scene.cast || []) {
      const seed = WA.core.hash(c.id);
      // Horses and the other animals share the four-legged gaits; people have their own.
      // Birds, fish, frogs and ants (critters.js) are animals too, with a rig of their own.
      const kind = c.type === "horse" ? "horse" : c.type === "animal" ? (WA.critters?.SPECIES[c.look?.species] ? "critter" : "animal") : "human";
      S.matScope = { mats: {}, list: [] };
      const rig = kind === "horse" ? WA.horse.build(S, actorLayer, c.look || {}) : kind === "critter" ? WA.critters.build(S, actorLayer, c.look || {}) : kind === "animal" ? WA.animal.build(S, actorLayer, c.look || {}) : WA.human.build(S, actorLayer, c.look || {}, seed);
      const shadow = WA.core.el("ellipse", { fill: "url(#shadow)", rx: 0, ry: 0 }, shadowLayer);
      const acts = (scene.actions || []).filter((a) => a.actor === c.id).sort((a, b) => a.at - b.at);
      // The little things a person does, planned once for the scene (acting.js).
      const events = kind === "human" && WA.acting ? WA.acting.plan(seed, (scene.duration || 10) * (scene.timeScale ?? 1)) : [];
      actors[c.id] = { c, rig, shadow, acts, seed, events, horse: kind !== "human", kind, R: kind === "critter" ? WA.critters : kind === "animal" ? WA.animal : kind === "horse" ? WA.horse : WA.human, mats: S.matScope.list, flip: false };
      S.matScope = null;
    }
    // Talking gestures within each spoken line (clip time), fixed by the speaker.
    if (WA.acting) for (const sp of scene.speech || []) if (actors[sp.actor]) sp.beats = WA.acting.beats(actors[sp.actor].seed, sp.from, sp.to);
    // Running and galloping kick up dust by themselves.
    const fx = [...(scene.fx || [])];
    for (const a of scene.actions || []) {
      if ((a.do === "gallop" || a.do === "run") && !a.noDust) {
        const next = (scene.actions || []).filter((b) => b.actor === a.actor && b.do && b.at > a.at).sort((x, y) => x.at - y.at)[0];
        const end = next ? next.at : scene.duration;
        fx.push({ fx: "dust", on: a.actor, at: a.at, dur: Math.max(0.2, end - a.at), rate: a.do === "gallop" ? 30 : 12 });
      }
    }
    // The explainer board (question channel): fixed to the screen, above the stage and its
    // vignette (a clean card), under the fade to black.
    const board = scene.board ? WA.board.build(S, scene.board, S.svg.insertBefore(WA.core.g(S.svg), S.black)) : null;
    // The drawing style of the film (library/styles.json), once everything is built.
    WA.style.apply(S, scene.styleLook);
    // The light of the scene (stage.js LIGHT, or the scene's own "light") on the characters and on
    // the houses, trees and things of the set near them (their colours are fixed, unlike the sky
    // and hills, which have a palette per time of day). The light does not change during a scene,
    // so it is multiplied into their colours once here: a filter would cost a third more per frame.
    Object.assign(S.light, scene.light || {});
    {
      const L = S.light, tint = [1, 3, 5].map((k) => parseInt(L.tint.slice(k, k + 2), 16) / 255);
      const m = tint.map((v) => L.bright * (1 - L.amt + L.amt * v));
      const lit = (c) => {
        if (typeof c !== "string" || c[0] !== "#") return c;
        const h = c.length === 4 ? c.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : c;
        if (!/^#[0-9a-f]{6}$/i.test(h)) return c;
        return "#" + [1, 3, 5].map((k, i) => Math.round(Math.min(255, parseInt(h.slice(k, k + 2), 16) * m[i])).toString(16).padStart(2, "0")).join("");
      };
      if (m.some((v) => Math.abs(v - 1) > 0.01)) {
        const grads = new Set();
        for (const layer of [actorLayer, S.layer("village"), S.layer("back")]) {
          for (const n of [layer, ...layer.querySelectorAll("*")]) {
            for (const a of ["fill", "stroke"]) {
              const v = n.getAttribute(a);
              if (!v) continue;
              const u = /^url\(#([^)]+)\)$/.exec(v);
              if (u) grads.add(u[1]); else n.setAttribute(a, lit(v));
            }
          }
        }
        for (const id of grads) {
          const gr = S.defs.querySelector(`[id="${id}"]`);
          if (gr && !gr.dataset.lit) { gr.dataset.lit = "1"; for (const st of gr.querySelectorAll("stop")) st.setAttribute("stop-color", lit(st.getAttribute("stop-color"))); }
        }
      }
    }
    // Line weight: every stroke of the actors scales with a variable set each frame from the
    // camera's zoom, so close-ups do not swell into marker strokes and wide shots stay readable;
    // inner detail lines (folds, brows, creases: strokes with no fill) are finer than outlines.
    for (const n of actorLayer.querySelectorAll("[stroke-width]")) {
      const w = parseFloat(n.getAttribute("stroke-width"));
      if (!Number.isFinite(w)) continue;
      const detail = n.getAttribute("fill") === "none" ? 0.8 : 1;
      n.style.strokeWidth = `calc(${f2(w * detail)}px * var(--lw, 1))`;
    }
    let shots = (scene.shots || [{ at: 0, type: "wide", on: Object.keys(actors).slice(0, 1) }]).slice().sort((a, b) => a.at - b.at);
    // A tall frame (Shorts) with a board: the board fills the top, the presenters stand below it.
    if (scene.board && H > W) shots = shots.map((s) => ({ ...s, dx: 0, share: 0.34, gy: 0.96, region: undefined }));
    shots.forEach((s, i) => (s.end = shots[i + 1]?.at ?? scene.duration));

    /** Position along x at time t: base x, then each move in order. */
    function xAt(A, t) {
      let x = A.c.x ?? 0;
      for (const a of A.acts) {
        if (!a.move || a.at > t) continue;
        const m = a.move, dur = a.dur ?? 1, k = (EASE[m.ease || "inOut"] || EASE.inOut)(seg(t, a.at, a.at + dur));
        if (m.speed !== undefined) {
          const s = t - a.at, acc = m.accel ?? Infinity, ta = Math.min(s, m.speed / acc);
          const dir = Math.sign(m.speed) || 1, v = Math.abs(m.speed), A2 = acc === Infinity ? 0 : 0.5 * acc * ta * ta;
          x += dir * (acc === Infinity ? v * s : A2 + v * Math.max(0, s - ta));
        } else if (m.to !== undefined) x = lerp(x, m.to, k);
        else if (m.by !== undefined) x += m.by * k;
      }
      return x;
    }
    /** Height above the ground at time t (flying up into the sky): moves with toY / byY. */
    function yAt(A, t) {
      let y = A.c.y ?? 0;
      for (const a of A.acts) {
        if (!a.move || a.at > t || (a.move.toY === undefined && a.move.byY === undefined)) continue;
        const k = (EASE[a.move.easeY || a.move.ease || "inOut"] || EASE.inOut)(seg(t, a.at, a.at + (a.dur ?? 1)));
        y = a.move.toY !== undefined ? lerp(y, a.move.toY, k) : y + a.move.byY * k;
      }
      return y;
    }
    /** Tweened properties (scale, opacity), facing and the prop in hand at time t. */
    function propsAt(A, t) {
      const p = { scale: A.c.scale ?? 1, opacity: A.c.opacity ?? 1, facing: A.c.facing ?? 1, prop: undefined };
      for (const a of A.acts) {
        if (!a.set || a.at > t) continue;
        const k = (EASE[a.ease || "smooth"] || EASE.smooth)(seg(t, a.at, a.at + (a.dur ?? 0.0001)));
        if (a.set.scale !== undefined) p.scale = lerp(p.scale, a.set.scale, k);
        if (a.set.opacity !== undefined) p.opacity = lerp(p.opacity, a.set.opacity, k);
        if (a.set.facing !== undefined) p.facing = a.set.facing;
        if (a.set.prop !== undefined) p.prop = a.set.prop;
      }
      return p;
    }
    function motionAt(A, t) {
      let cur = -1, prev = -1;
      A.acts.forEach((a, i) => { if (a.do && a.at <= t) { prev = cur; cur = i; } });
      const def = A.horse ? "stand" : "idle";
      return { cur: cur >= 0 ? A.acts[cur] : { do: def, at: -100 }, prev: prev >= 0 ? A.acts[prev] : cur >= 0 ? { do: def, at: -100 } : null };
    }
    /** The rider's horse and since when (after a leap `onto` it ends). */
    function mountAt(A, t) {
      let m = null;
      for (const a of A.acts) if (a.onto && t >= a.at) m = a;
      return m;
    }
    function strideOf(id, t) {
      const H_ = actors[id];
      const { cur } = motionAt(H_, t);
      return (t - cur.at) / WA.motions.STRIDE;
    }

    const memo = new Map();
    /** The complete pose of an actor at time t (no DOM work; memoised per frame). */
    const BEAST = { run: "gallop", charge: "gallop", leap: "gallop", march: "walk", fly: "fly" };
    function poseAt(id, t) {
      const key = `${id}|${t.toFixed(4)}`;
      if (memo.has(key)) return memo.get(key);
      const A = actors[id];
      const lib = A.kind === "critter" ? WA.critters.motions : A.horse ? WA.motions.horse : WA.motions.human;
      const props = propsAt(A, t);
      const { cur, prev } = motionAt(A, t);
      const mount = A.horse ? null : mountAt(A, t);
      const mountEnd = mount ? mount.at + (mount.dur ?? 0.7) : Infinity;
      const riding = t >= mountEnd;
      const ctx = (a) => ({ B: A.rig.B, dur: a.dur, params: a, face: a.face, stride: riding ? strideOf(mount.onto, t) : undefined });
      // In the saddle, only riding motions apply; anything else means "keep riding".
      const run = (a) => {
        // Four-legged actors understand the people's words: run is a gallop, the rest a stand.
        let name = riding && !RIDING.has(a.do) ? "ride" : A.horse ? BEAST[a.do] || a.do : a.do;
        if (A.kind === "critter") name = WA.critters.forKind(A.rig.sp.kind, name);
        const fn = lib[name] || lib[A.horse ? "stand" : "idle"];
        return fn(t - Math.max(a.at, riding && name === "ride" ? mountEnd : -Infinity), ctx(a));
      };
      let pose = run(cur);
      if (prev && t - cur.at < (cur.blend ?? BLEND)) pose = blend(run(prev), pose, EASE.smooth((t - cur.at) / (cur.blend ?? BLEND)));
      if (cur.face) pose.face = cur.face;
      if (cur.talk !== undefined) pose.talk = cur.talk;
      let x = xAt(A, t), y = yAt(A, t);
      if (mount) {
        const dur = mount.dur ?? 0.7, k = seg(t, mount.at, mount.at + dur);
        const seat = pointsAt(mount.onto, Math.min(t, mount.at + dur));
        // The leap is tracked by the hips, from standing height to the saddle.
        const from = [xAt(A, mount.at), -A.rig.legLen * propsAt(A, mount.at).scale];
        if (!riding) {
          const e = EASE.inOut(k);
          x = lerp(from[0], seat.seat[0], e);
          y = lerp(from[1], seat.seat[1], e) - Math.sin(Math.PI * k) * (mount.arc ?? 300);
          pose.seated = true;
        } else {
          const s = pointsAt(mount.onto, t);
          x = s.seat[0]; y = s.seat[1] + (y - (A.c.y ?? 0)); pose.seated = true;
        }
      }
      let out = { ...pose, x, y, scale: props.scale, opacity: props.opacity, facing: props.facing };
      // Speech (from story.ts): the speaker's mouth follows the loudness of the real voice and
      // the vowels of the words; everyone else turns their eyes to the speaker.
      const clip = t / (scene.timeScale ?? 1);
      const line = (scene.speech || []).find((sp) => clip >= sp.from && clip < sp.to && (sp.actor === id || !A.horse));
      if (line && line.actor === id) {
        const k = (clip - line.from) / (line.to - line.from);
        out.talk = clamp((line.env[Math.floor((clip - line.from) * 30)] ?? 0) * 1.25);
        out.viseme = line.visemes[Math.min(line.visemes.length - 1, Math.floor(k * line.visemes.length))] || "a";
        if (line.face) out.face = line.face; // how the line is said: "Mẹ (mừng rỡ): …"
      }
      const listening = line && line.actor !== id && !A.horse && !cur.lookAt && actors[line.actor] ? line.actor : null;
      // lookAt: the eyes turn to another character (ahead of the face, or back over the shoulder).
      const target = cur.lookAt && actors[cur.lookAt] ? cur.lookAt : listening;
      if (target && !A.horse && target !== id) {
        const tx = xAt(actors[target], t), ahead = (tx - x) * props.facing >= 0;
        const base = typeof out.face === "string" ? WA.face.EXPRESSIONS[out.face] || {} : out.face || {};
        out.face = { ...base, gaze: [ahead ? 0.8 : -0.9, -0.05] };
      }
      if (props.prop !== undefined) out.prop = props.prop;
      if (A.kind === "human" && WA.acting && !riding) {
        const speaking = line && line.actor === id;
        out = WA.acting.apply(out, {
          t, clip, cur, seed: A.seed, events: A.events, rest: lib.idle(t, ctx(cur)), holding: !!(props.prop ?? A.rig.activeProp), prop: props.prop ?? A.rig.activeProp,
          speech: speaking ? { k: clip - line.from, env: line.env, beats: line.beats || [] } : null,
          listen: listening ? line : null,
        });
      }
      memo.set(key, out);
      return out;
    }
    function pointsAt(id, t) {
      const A = actors[id], p = poseAt(id, t);
      const pts = A.R.points(A.rig, p);
      pts.facing = p.facing;
      return pts;
    }
    const speedOf = (id, t) => (pointsAt(id, t + 0.05).feet[0] - pointsAt(id, t - 0.05).feet[0]) / 0.1;
    /** Every person's head at t (the camera keeps a close-up clear of half-heads). */
    const people = Object.keys(actors).filter((id) => actors[id].kind === "human");
    const heads = (t) => people.map((id) => { const p = pointsAt(id, t), o = poseAt(id, t).opacity ?? 1; return { id, head: p.head, r: p.headR, seen: o > 0.5 }; });
    const ctx = { pointsAt, speedOf, heads };

    /**
     * How a person is moving at t, for the parts that follow through (hair, sleeves, skirts):
     * forward speed (rig units/s, + = the way they face), lean and forearm turn speeds (°/s).
     * Measured over the last 0.16 s from the poses (which are pure functions of time), weighted
     * to the older half so the parts lag a little behind the body.
     */
    const FT = 0.08;
    function followOf(id, t, p) {
      const p1 = poseAt(id, Math.max(0, t - FT)), p2 = poseAt(id, Math.max(0, t - 2 * FT));
      const v = (k, a, b) => (0.45 * (k(a) - k(b)) + 0.55 * (k(b) - k(p2))) / FT;
      const fore = (q, arm) => (q.lean || 0) - (q[arm]?.[0] || 0) - (q[arm]?.[1] || 0);
      return {
        vf: (v((q) => q.x, p, p1) * (p.facing || 1)) / (p.scale || 1),
        dl: v((q) => q.lean || 0, p, p1),
        wF: v((q) => fore(q, "armF"), p, p1),
        wB: v((q) => fore(q, "armB"), p, p1),
      };
    }

    /** timeScale < 1 plays the script slower (a scene stretched to longer narration). */
    function renderFrame(time) {
      const t = time * (scene.timeScale ?? 1);
      if (memo.size > 4000) memo.clear();
      const cam = WA.camera.at(shots, t, ctx, S);
      actorLayer.style.setProperty("--lw", clamp(1 / Math.pow(cam.z, 0.6), 0.42, 1.12).toFixed(3));
      for (const id in actors) {
        const A = actors[id], p = poseAt(id, t);
        if (!A.horse) p.follow = followOf(id, t, p);
        // The lit side of every part faces the light, whichever way the character is turned.
        const flip = (p.facing ?? 1) !== S.light.side;
        A.rig.lightFlip = flip;
        if (flip !== A.flip) {
          for (const gr of A.mats) { gr.setAttribute("x1", flip ? 1 : 0); gr.setAttribute("x2", flip ? 0 : 1); }
          A.flip = flip;
        }
        A.R.apply(A.rig, p, t);
        const pts = pointsAt(id, t), air = clamp(-(A.horse ? p.y || 0 : pts.feet[1]) / 900);
        const w = (A.kind === "animal" || A.kind === "critter" ? A.rig.sp.body[0] * 0.6 : A.horse ? 200 : 60) * p.scale * (A.rig.B?.round ? 1 : 1.15);
        const hidden = !A.horse && p.seated;
        // A low sun throws the shadow long, away from the light.
        const cast = S.light.cast * (1 - air);
        A.shadow.setAttribute("cx", f2(pts.feet[0] + (A.horse ? 10 * p.scale * p.facing : 0) - S.light.side * w * cast * 0.55));
        A.shadow.setAttribute("cy", "6");
        A.shadow.setAttribute("rx", f2(w * (1 - 0.5 * air) * (1 + cast * 0.6)));
        A.shadow.setAttribute("ry", f2(w * (A.horse ? 0.12 : 0.16) * (1 - 0.3 * air)));
        A.shadow.setAttribute("opacity", f2(hidden ? 0 : p.opacity * (1 - 0.7 * air)));
      }
      for (const { o, node } of objects) {
        const show = (o.from === undefined ? 1 : WA.core.smooth(seg(t, o.from, o.from + 0.3))) * (o.until === undefined ? 1 : 1 - WA.core.smooth(seg(t, o.until, o.until + 0.3)));
        node.setAttribute("opacity", f2(show));
      }
      if (board) WA.board.render(board, t);
      const shake = WA.fx.render(S, fx, t, ctx);
      S.styleTick(t);
      S.setCamera(cam, t, shake);
      // Fades through black (chapter changes): fadeIn / fadeOut in seconds of the clip.
      const dur = scene.duration, fi = scene.fadeIn || 0, fo = scene.fadeOut || 0;
      const black = Math.max(fi ? 1 - seg(time, 0, fi) : 0, fo ? seg(time, dur - fo, dur) : 0);
      S.black.setAttribute("opacity", f2(black));
      const g = scene.grade;
      if (g) S.grade.setAttribute("opacity", f2(lerp(g.from ?? 0.06, g.to ?? 0.06, seg(t, g.at ?? 0, (g.at ?? 0) + (g.dur ?? 1)))));
    }
    return { S, renderFrame, poseAt, pointsAt, duration: scene.duration, ready, actors, actorLayer };
  }

  WA.player = { create };
})();
