/*
 * Animals that are not four-legged, for fables: birds (crow, chicken), fish, frog, ant.
 *   cast: { "type": "animal", "look": { "species": "crow" } }   (the player sends these here)
 * The same contract as the other rigs (build, apply, points) and their own motions
 * (WA.critters.motions): stand, walk, gallop (= a quick walk), fly, swim, hop, peck, flap.
 * They talk like the others: `talk` (0–1) opens the beak or the mouth; eyes blink.
 * Origin on the ground under the body, facing right; drawn with the same ink outline and
 * shading as the people and the four-legged animals.
 */
(function () {
  const { el, g, tr, f2, shade, INK, OUT, clamp } = WA.core;
  const sin = Math.sin, TAU = Math.PI * 2;

  // body [w, h]; legH: leg length (birds); colours.
  const SPECIES = {
    crow: { kind: "bird", color: "#2b2b36", belly: "#3a3a48", beak: "#3b3b40", body: [120, 82], legH: 46, tail: "long", sheen: true },
    chicken: { kind: "bird", color: "#f6f1e6", belly: "#ffffff", beak: "#f2b134", body: [134, 104], legH: 40, tail: "fan", comb: "#e0322c" },
    fish: { kind: "fish", color: "#f28c28", belly: "#ffd29a", fin: "#e0641c", body: [150, 84] },
    frog: { kind: "frog", color: "#5fb85a", belly: "#dff2b8", body: [120, 72] },
    ant: { kind: "ant", color: "#3a261e", body: [96, 34] },
  };

  function eye(parent, x, y, r, A) {
    el("circle", { cx: f2(x), cy: f2(y), r: f2(r), fill: "#ffffff", ...OUT, "stroke-width": 2.5 }, parent);
    el("circle", { cx: f2(x + r * 0.25), cy: f2(y), r: f2(r * 0.55), fill: "#1a1410" }, parent);
    el("circle", { cx: f2(x + r * 0.4), cy: f2(y - r * 0.25), r: f2(r * 0.18), fill: "#ffffff" }, parent);
    A.lids.push(el("ellipse", { cx: f2(x), cy: f2(y - r * 0.2), rx: f2(r * 1.05), ry: 0, fill: A.skin, ...OUT, "stroke-width": 2 }, parent));
  }

  function bird(S, A, sp) {
    const [bw, bh] = sp.body, L = sp.legH, coat = sp.color, by = -L - bh / 2;
    A.bodyY = by;
    // Legs (behind the body): thigh hidden, a thin shank and three toes.
    for (const near of [false, true]) {
      const hip = g(A.body), k = near ? 1 : 0.8;
      const legHex = sp.kind === "bird" && sp.beak === "#f2b134" ? "#e8a432" : "#3a3a40";
      el("path", { d: `M 0 0 L 0 ${f2(L)}`, stroke: INK, "stroke-width": 9, "stroke-linecap": "round" }, hip);
      el("path", { d: `M 0 0 L 0 ${f2(L)}`, stroke: near ? legHex : shade(legHex, -0.3), "stroke-width": 5, "stroke-linecap": "round" }, hip);
      el("path", { d: `M -8 ${f2(L)} L 18 ${f2(L)} M 0 ${f2(L)} L 10 ${f2(L - 6)} M 0 ${f2(L)} L -10 ${f2(L - 4)}`, stroke: INK, "stroke-width": 4.5, "stroke-linecap": "round" }, hip);
      A.legs.push({ hip, x: (near ? 8 : -12), y: by + bh * 0.42, k });
    }
    A.tail = g(A.body);
    if (sp.tail === "fan") for (let i = 0; i < 4; i++) el("path", { d: `M 0 0 Q ${-30 - i * 6} ${-30 - i * 14} ${-18 - i * 10} ${-64 - i * 6} Q ${-6 - i * 4} ${-34 - i * 8} 0 0 Z`, fill: S.mat(i % 2 ? shade(coat, -0.08) : coat, true), ...OUT, "stroke-width": 2.5 }, A.tail);
    else el("path", { d: "M 0 -6 L -62 -18 L -58 4 L -64 18 L 0 10 Z", fill: S.mat(shade(coat, -0.05), true), ...OUT }, A.tail);
    el("ellipse", { cx: 0, cy: f2(by), rx: f2(bw / 2), ry: f2(bh / 2), fill: S.mat(coat), ...OUT }, A.body);
    el("ellipse", { cx: f2(bw * 0.12), cy: f2(by + bh * 0.16), rx: f2(bw * 0.3), ry: f2(bh * 0.28), fill: sp.belly, opacity: 0.8 }, A.body);
    if (sp.sheen) el("path", { d: `M ${f2(-bw * 0.3)} ${f2(by - bh * 0.3)} Q 0 ${f2(by - bh * 0.48)} ${f2(bw * 0.25)} ${f2(by - bh * 0.32)}`, stroke: "#7a86b8", "stroke-width": 4, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, A.body);
    // The wing over the body, hinged at the shoulder.
    A.wing = g(A.body);
    A.wingAt = [bw * 0.08, by - bh * 0.18];
    el("path", { d: `M 0 0 C -20 -10 -${f2(bw * 0.55)} 0 -${f2(bw * 0.62)} ${f2(bh * 0.24)} C -${f2(bw * 0.4)} ${f2(bh * 0.34)} -${f2(bw * 0.15)} ${f2(bh * 0.3)} 0 ${f2(bh * 0.18)} Z`, fill: S.mat(shade(coat, -0.12), true), ...OUT }, A.wing);
    for (let i = 1; i < 3; i++) el("path", { d: `M -${f2(bw * (0.2 + i * 0.12))} ${f2(bh * 0.06 + i * 4)} q 8 ${f2(bh * 0.12)} 22 ${f2(bh * 0.16)}`, stroke: shade(coat, -0.4), "stroke-width": 2.5, fill: "none" }, A.wing);
    // Head with the beak (the lower half opens), comb and wattle for the hen.
    A.head = g(A.body);
    const hr = bh * 0.38;
    A.headAt = [bw * 0.4, by - bh * 0.5];
    if (sp.comb) {
      for (let i = 0; i < 3; i++) el("circle", { cx: f2(-hr * 0.35 + i * hr * 0.32), cy: f2(-hr * 0.95 - (i === 1 ? 6 : 0)), r: f2(hr * 0.28), fill: sp.comb, ...OUT, "stroke-width": 2.5 }, A.head);
    }
    el("circle", { r: f2(hr), fill: S.mat(coat), ...OUT }, A.head);
    A.beakLow = el("path", { d: "", fill: shade(sp.beak, -0.15), ...OUT, "stroke-width": 2.5 }, A.head);
    el("path", { d: `M ${f2(hr * 0.7)} ${f2(-hr * 0.22)} L ${f2(hr * 1.75)} ${f2(hr * 0.02)} L ${f2(hr * 0.75)} ${f2(hr * 0.18)} Z`, fill: sp.beak, ...OUT, "stroke-width": 2.5 }, A.head);
    if (sp.comb) el("ellipse", { cx: f2(hr * 0.8), cy: f2(hr * 0.55), rx: f2(hr * 0.16), ry: f2(hr * 0.3), fill: sp.comb, ...OUT, "stroke-width": 2 }, A.head);
    A.skin = coat;
    eye(A.head, hr * 0.3, -hr * 0.2, hr * 0.28, A);
    A.beakR = hr;
    A.height = L + bh + hr;
  }

  function fish(S, A, sp) {
    const [bw, bh] = sp.body, coat = sp.color, by = -bh * 0.9;
    A.bodyY = by;
    A.tail = g(A.body);
    A.tailAt = [-bw * 0.46, by];
    el("path", { d: `M 0 0 L -${f2(bw * 0.38)} -${f2(bh * 0.5)} Q -${f2(bw * 0.3)} 0 -${f2(bw * 0.38)} ${f2(bh * 0.5)} Z`, fill: S.mat(sp.fin, true), ...OUT }, A.tail);
    el("path", { d: `M ${f2(-bw * 0.1)} ${f2(by - bh * 0.42)} Q ${f2(-bw * 0.02)} ${f2(by - bh * 0.85)} ${f2(bw * 0.18)} ${f2(by - bh * 0.4)} Z`, fill: sp.fin, ...OUT, "stroke-width": 2.5 }, A.body);
    el("path", { d: `M ${f2(bw / 2)} ${f2(by)} C ${f2(bw * 0.36)} ${f2(by - bh * 0.62)} ${f2(-bw * 0.32)} ${f2(by - bh * 0.6)} ${f2(-bw * 0.48)} ${f2(by)} C ${f2(-bw * 0.32)} ${f2(by + bh * 0.6)} ${f2(bw * 0.36)} ${f2(by + bh * 0.62)} ${f2(bw / 2)} ${f2(by)} Z`, fill: S.mat(coat), ...OUT }, A.body);
    el("path", { d: `M ${f2(bw * 0.36)} ${f2(by + bh * 0.1)} C ${f2(bw * 0.1)} ${f2(by + bh * 0.4)} ${f2(-bw * 0.3)} ${f2(by + bh * 0.36)} ${f2(-bw * 0.4)} ${f2(by + bh * 0.08)}`, fill: "none", stroke: sp.belly, "stroke-width": 8, opacity: 0.8, "stroke-linecap": "round" }, A.body);
    for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(-bw * 0.1 + i * bw * 0.14)} ${f2(by - bh * 0.32)} q 10 ${f2(bh * 0.3)} 0 ${f2(bh * 0.6)}`, stroke: shade(coat, -0.25), "stroke-width": 2.5, fill: "none", opacity: 0.6 }, A.body);
    el("path", { d: `M ${f2(bw * 0.18)} ${f2(by + bh * 0.08)} q -24 18 -10 34 q 12 -8 22 -22 Z`, fill: sp.fin, ...OUT, "stroke-width": 2.5 }, A.body);
    A.head = g(A.body);
    A.headAt = [0, 0];
    A.skin = coat;
    eye(A.head, bw * 0.3, by - bh * 0.12, bh * 0.14, A);
    A.mouth = el("path", { d: "", fill: "#7a2a1a", ...OUT, "stroke-width": 2 }, A.head);
    A.mouthAt = [bw * 0.47, by + bh * 0.08, bh * 0.2];
    A.height = bh * 1.4;
  }

  function frog(S, A, sp) {
    const [bw, bh] = sp.body, coat = sp.color, by = -bh * 0.6;
    A.bodyY = by;
    // The back leg folded: a round thigh at the side, the long webbed foot flat on the ground.
    A.back = g(A.body);
    A.backAt = [-bw * 0.2, by + bh * 0.22];
    el("path", { d: `M ${f2(-bw * 0.2)} ${f2(-by - bh * 0.22 - 2)} L ${f2(bw * 0.2)} ${f2(-by - bh * 0.22 - 2)} l 12 -4 l -2 8 l -10 0 Z`, fill: S.mat(shade(coat, -0.08), true), ...OUT, "stroke-width": 3 }, A.back);
    el("ellipse", { cx: f2(bw * 0.04), cy: f2(bh * 0.12), rx: f2(bw * 0.26), ry: f2(bh * 0.32), fill: S.mat(shade(coat, -0.04)), ...OUT, transform: "rotate(-18)" }, A.back);
    el("ellipse", { cx: 0, cy: f2(by), rx: f2(bw / 2), ry: f2(bh / 2), fill: S.mat(coat), ...OUT }, A.body);
    el("ellipse", { cx: f2(bw * 0.14), cy: f2(by + bh * 0.2), rx: f2(bw * 0.3), ry: f2(bh * 0.22), fill: sp.belly }, A.body);
    for (const [x, y, r] of [[-0.2, -0.2, 0.07], [0.02, -0.32, 0.05], [-0.32, 0.02, 0.05]]) el("circle", { cx: f2(bw * x), cy: f2(by + bh * y), r: f2(bw * r), fill: shade(coat, -0.2), opacity: 0.7 }, A.body);
    // The front leg: a short round arm down to a little webbed hand.
    A.front = g(A.body);
    const fx = bw * 0.26, fy = by + bh * 0.18;
    el("path", { d: `M ${f2(fx)} ${f2(fy)} Q ${f2(fx + 10)} ${f2(fy + (-fy) * 0.5)} ${f2(fx + 6)} -8`, stroke: INK, "stroke-width": 15, fill: "none", "stroke-linecap": "round" }, A.front);
    el("path", { d: `M ${f2(fx)} ${f2(fy)} Q ${f2(fx + 10)} ${f2(fy + (-fy) * 0.5)} ${f2(fx + 6)} -8`, stroke: coat, "stroke-width": 9, fill: "none", "stroke-linecap": "round" }, A.front);
    for (const dx of [-6, 4, 14]) el("ellipse", { cx: f2(fx + dx + 4), cy: -4, rx: 6, ry: 4, fill: coat, ...OUT, "stroke-width": 2 }, A.front);
    // Big eyes on top, the wide mouth (opens down).
    A.head = g(A.body);
    A.headAt = [0, 0];
    A.skin = coat;
    for (const dx of [0.12, 0.34]) {
      el("circle", { cx: f2(bw * dx), cy: f2(by - bh * 0.48), r: f2(bh * 0.24), fill: S.mat(coat), ...OUT }, A.head);
      eye(A.head, bw * dx, by - bh * 0.5, bh * 0.15, A);
    }
    A.mouth = el("path", { d: "", fill: "#a8323a", ...OUT, "stroke-width": 2.5 }, A.head);
    A.mouthAt = [bw * 0.32, by + bh * 0.02, bw * 0.34];
    A.height = bh * 1.3;
  }

  function ant(S, A, sp) {
    const [bw, bh] = sp.body, coat = sp.color, by = -bh * 0.9;
    A.bodyY = by;
    for (let i = 0; i < 6; i++) {
      const hip = g(A.body), x = -bw * 0.06 + (i % 3) * bw * 0.08, near = i >= 3;
      el("path", { d: `M 0 0 L ${f2(-6 + (i % 3) * 8)} ${f2(bh * 0.5)} L ${f2(-14 + (i % 3) * 14)} ${f2(bh * 0.9)}`, stroke: near ? INK : shade(INK, 0.2), "stroke-width": near ? 4 : 3.5, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, hip);
      A.legs.push({ hip, x, y: by + bh * 0.2, k: near ? 1 : 0.85, phase: i % 2 ? Math.PI : 0 });
    }
    el("ellipse", { cx: f2(-bw * 0.32), cy: f2(by - bh * 0.05), rx: f2(bw * 0.2), ry: f2(bh * 0.5), fill: S.mat(coat), ...OUT }, A.body);
    el("ellipse", { cx: f2(-bw * 0.02), cy: f2(by), rx: f2(bw * 0.12), ry: f2(bh * 0.3), fill: S.mat(coat), ...OUT }, A.body);
    A.head = g(A.body);
    A.headAt = [bw * 0.24, by - bh * 0.18];
    A.skin = coat;
    el("path", { d: `M ${f2(bw * 0.05)} ${f2(-bh * 0.3)} Q ${f2(bw * 0.14)} ${f2(-bh * 1.3)} ${f2(bw * 0.3)} ${f2(-bh * 1.1)} M ${f2(bw * 0.1)} ${f2(-bh * 0.3)} Q ${f2(bw * 0.26)} ${f2(-bh * 1.0)} ${f2(bw * 0.38)} ${f2(-bh * 0.8)}`, stroke: INK, "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, A.head);
    el("circle", { r: f2(bh * 0.42), fill: S.mat(coat), ...OUT }, A.head);
    eye(A.head, bh * 0.14, -bh * 0.08, bh * 0.18, A);
    A.mouth = el("path", { d: "", fill: "#7a2a1a", ...OUT, "stroke-width": 1.5 }, A.head);
    A.mouthAt = [bh * 0.3, bh * 0.2, bh * 0.22];
    A.height = bh * 2;
  }

  function build(S, parent, look = {}) {
    const sp = SPECIES[look.species] || SPECIES.crow;
    const A = { root: g(parent), look, sp: { ...sp, color: look.color || sp.color }, legs: [], lids: [], seed: WA.core.hash(look.species || "c") };
    A.body = g(A.root);
    ({ bird, fish, frog, ant })[sp.kind](S, A, A.sp);
    return A;
  }

  /** p: bob, pitch, lift (off the ground), legs [[angle]…], wing (degrees up), head, tail, talk. */
  function apply(A, p, t) {
    const s = p.scale ?? 1, f = p.facing ?? 1, sp = A.sp;
    tr(A.root, p.x, (p.y ?? 0) - (p.lift || 0) * s, 0, s * f, s * (1 - (p.squash || 0)));
    A.root.setAttribute("opacity", f2(clamp(p.opacity ?? 1)));
    tr(A.body, 0, p.bob || 0, p.pitch || 0);
    A.legs.forEach((l, i) => tr(l.hip, l.x, l.y, p.legs?.[i % (p.legs?.length || 1)] || 0));
    if (A.wing) tr(A.wing, A.wingAt[0], A.wingAt[1], -(p.wing || 0));
    if (A.tail && A.tailAt) tr(A.tail, A.tailAt[0], A.tailAt[1], (p.tail || 0) + (sp.kind === "fish" ? 0 : 0));
    else if (A.tail && sp.kind === "bird") tr(A.tail, -sp.body[0] * 0.44, A.bodyY, (p.tail || 0) + 4 * sin(t * 3 + A.seed));
    if (A.back) tr(A.back, A.backAt[0], A.backAt[1], p.kick || 0);
    tr(A.head, A.headAt[0], A.headAt[1], (p.head || 0) + 2 * sin(t * 1.4 + A.seed));
    const blink = ((t + (A.seed % 7)) % 4.1) < 0.13;
    for (const lid of A.lids) lid.setAttribute("ry", f2(blink ? parseFloat(lid.getAttribute("rx")) * 1.05 : 0));
    const open = clamp(p.talk || 0);
    if (A.beakLow) {
      const hr = A.beakR;
      A.beakLow.setAttribute("d", `M ${f2(hr * 0.72)} ${f2(hr * 0.1)} L ${f2(hr * 1.6)} ${f2(hr * (0.12 + 0.5 * open))} L ${f2(hr * 0.75)} ${f2(hr * (0.3 + 0.2 * open))} Z`);
    }
    if (A.mouth) {
      const [mx, my, mw] = A.mouthAt, h = open * mw * 0.45;
      A.mouth.setAttribute("d", `M ${f2(mx - mw / 2)} ${f2(my)} Q ${f2(mx)} ${f2(my + 3 + h)} ${f2(mx + mw / 2)} ${f2(my - 1)} Q ${f2(mx)} ${f2(my + 2)} ${f2(mx - mw / 2)} ${f2(my)} Z`);
    }
  }

  function points(A, p) {
    const s = p.scale ?? 1, f = p.facing ?? 1, [bw] = A.sp.body, y0 = (p.y ?? 0) - (p.lift || 0) * s;
    const head = [p.x + (A.headAt[0] || bw * 0.3) * s * f, y0 + (A.bodyY - 10) * s];
    return {
      head, headR: 30 * s, mouth: head, mouthAngle: f > 0 ? 0 : Math.PI, feet: [p.x, p.y ?? 0], hooves: [[p.x, p.y ?? 0]],
      top: y0 - A.height * s, height: A.height * s, seat: [p.x, y0 - A.height * 0.6 * s],
      hips: [p.x, y0 - A.height * 0.45 * s], // (the middle of the body, for effects)
      box: [p.x - (bw * 0.6) * s, y0 - A.height * s, p.x + (bw * 0.7) * s, y0],
    };
  }

  // Motions: τ seconds into the action, c: { params }. The player maps run → gallop.
  const motions = {
    stand: (τ) => ({ bob: 1.5 * sin(τ * 2), head: 4 * sin(τ * 1.3), wing: 0, legs: [0, 0] }),
    walk: (τ, c) => {
      const ph = TAU * τ / 0.5 * (c?.params?.speed || 1);
      return { bob: -3 * Math.abs(sin(ph)), legs: [22 * sin(ph), -22 * sin(ph)], head: 6 * sin(ph * 2), pitch: 2 * sin(ph), tail: 4 * sin(ph) };
    },
    gallop: (τ, c) => motions.walk(τ * 1.8, c),
    peck: (τ) => { const k = Math.max(0, sin(TAU * τ / 0.6)); return { head: 40 * k, pitch: 18 * k, legs: [0, 0] }; },
    flap: (τ) => ({ wing: 55 + 45 * sin(TAU * τ / 0.25), bob: -4 * Math.abs(sin(TAU * τ / 0.25)), legs: [0, 0] }),
    fly: (τ) => ({ lift: 150 + 15 * sin(τ * 3), wing: 60 + 55 * sin(TAU * τ / 0.3), legs: [-50, -50], pitch: -6 }),
    swim: (τ) => ({ lift: 60 + 10 * sin(τ * 2.2), tail: 22 * sin(TAU * τ / 0.6), pitch: 4 * sin(τ * 2.2), bob: 0 }),
    hop: (τ) => { const u = (τ % 0.9) / 0.9, air = u < 0.55 ? sin(Math.PI * u / 0.55) : 0; return { lift: 120 * air, kick: -50 * air, pitch: -12 * air, squash: u > 0.55 && u < 0.7 ? 0.08 : 0 }; },
  };
  // The fish swims and the frog hops instead of walking.
  const forKind = (kind, name) => kind === "fish" ? "swim" : kind === "frog" && (name === "walk" || name === "gallop") ? "hop" : name;

  WA.critters = { build, apply, points, SPECIES, motions, forKind };
})();
