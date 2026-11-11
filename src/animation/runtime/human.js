/*
 * People, assembled from parts: a body type, an outfit, hair, headwear, a beard, a cape and
 * a prop. The rig is root (hips) → legs and torso → head and arms; WA.motions makes poses.
 *
 *   look = {
 *     body: "child" | "man" | "strong" | "woman" | "elder",
 *     skin, outfit: { type, color, trim, skirt, sash }:
 *       tunic · robe · armor · dress · loincloth · enemy (any era)
 *       dongson   Văn Lang: a short pull-over top with a Đông Sơn pattern band; women add a long
 *                 skirt (váy), men a loincloth (khố) — see library/eras.json
 *       plume     a Hùng king's ceremonial dress: bronze-studded top, skirt fringed with feathers
 *     bracelets, earrings (bronze), tattoo (Đông Sơn patterns on bare arms and chest),
 *     pants, hair: { style: "traidao"|"bun"|"long"|"short"|"turban"|"bald", color },
 *     headwear: "nonla"|"helmet"|"feather"|"enemy_helmet"|"crown"|"space_helmet"|undefined,
 *     beard: color, cape: color, prop: { type, hand: "front"|"back" },
 *     face: { shape, eyes, nose, brows, wrinkles, mustache, iris, eyeScale } (see face.js)
 *   }
 */
(function () {
  const { el, g, tr, f2, shade, INK, OUT, clamp } = WA.core;

  const BODIES = {
    child: { thigh: 46, shin: 44, legW: 24, upper: 40, fore: 36, armW: 19, torsoH: 96, torsoW: 76, headR: 54, round: true },
    man: { thigh: 64, shin: 60, legW: 29, upper: 55, fore: 51, armW: 24, torsoH: 126, torsoW: 92, headR: 42 },
    strong: { thigh: 68, shin: 64, legW: 33, upper: 60, fore: 56, armW: 28, torsoH: 136, torsoW: 108, headR: 41 },
    woman: { thigh: 60, shin: 56, legW: 25, upper: 50, fore: 47, armW: 20, torsoH: 116, torsoW: 80, headR: 40 },
    elder: { thigh: 60, shin: 56, legW: 26, upper: 52, fore: 48, armW: 21, torsoH: 118, torsoW: 86, headR: 41, stoop: 10 },
  };

  function build(S, parent, look, seed = 1) {
    const B = { ...BODIES[look.body || "man"] };
    // Build: slim, average, heavy (a belly, thicker limbs) — so a crowd is not all one shape.
    const shapeOf = look.build || (look.body === "man" ? ["average", "average", "slim", "heavy"][seed % 4] : "average");
    const build = { slim: [0.86, 0.9, 0], heavy: [1.28, 1.15, 0.22] }[shapeOf] || [1, 1, 0];
    B.torsoW *= build[0]; B.legW *= build[1]; B.armW *= build[1]; B.belly = build[2];
    const skin = look.skin || (look.body === "child" ? "#f3c590" : "#e8b27c");
    const outfit = look.outfit || { type: "tunic", color: "#8a5a2a" };
    // look.view "front": the presenters talk to the viewer (everyone else stays three-quarter).
    const P = { root: g(parent), B, look, S, seed, sway: [], sleeves: [], front: look.view === "front" };
    // Parts that swing after the body (hair, beard, feathers, plumes): a group turned about the
    // point where the part is attached. `up` parts stand up from it (feathers), the rest hang.
    P.swayG = (parent, px, py, gain = 1, up = false) => { const gg = g(parent); P.sway.push({ g: gg, px, py, gain, up }); return gg; };
    const far = (hex) => shade(hex, -0.25);
    // Clothes made of parts (every era after Văn Lang): garments.js decides colours and lengths.
    const G = outfit.type === "parts" ? WA.garments.resolve(outfit, look, B, skin) : null;
    const legHex = G ? look.legs || G.legHex : outfit.type === "armor" ? "#55606f" : outfit.type === "enemy" ? "#3a2a2a" : look.legs || skin;
    const bareLegs = outfit.type === "loincloth" || outfit.type === "dongson" || outfit.type === "plume";
    const pantsHex = look.pants || (G ? G.pantsHex : outfit.type === "armor" ? "#3a4350" : bareLegs ? skin : "#5c3b22");
    // look.shoes: shod feet (modern people, boots); else bare or era footwear as before.
    const feetHex = look.shoes ? look.shoes : G ? G.feetHex : outfit.type === "armor" || outfit.type === "enemy" ? "#2b3139" : shade(skin, -0.1);
    const sleeveHex = G ? G.sleeveHex : outfit.type === "armor" ? "#5d6a79" : outfit.type === "loincloth" || outfit.type === "dongson" || outfit.type === "plume" ? skin : outfit.type === "enemy" ? "#4a2626" : outfit.color;
    // The colour of the body at the shoulders (where the near arm starts).
    const torsoHex = G ? (outfit.top?.cut === "yem" ? skin : outfit.top?.color || "#6a4a2a")
      : outfit.type === "loincloth" || (outfit.type === "dongson" && look.bareChest && look.body !== "woman") ? skin
      : outfit.type === "armor" ? null : outfit.type === "enemy" ? "#4a2626" : outfit.type === "dongson" || outfit.type === "plume" ? outfit.color || "#8a5a2a" : outfit.color;

    if (look.cape) P.cape = el("path", { fill: look.cape === true ? "url(#cape)" : look.cape, ...OUT }, P.root);
    const leg = (front) => {
      const hip = g(P.root);
      if (P.front) front = true; // seen from the front, both legs are as near
      WA.human.limb(S, hip, B.thigh, B.legW, front ? pantsHex : far(pantsHex));
      const knee = g(hip);
      WA.human.limb(S, knee, B.shin, B.legW * 0.9, front ? legHex : far(legHex), 0.7, 0.09, 0.3);
      const w = B.legW;
      // From the front the foot is a rounded toe cap under the shin, turned a little outwards.
      if (P.front) el("path", { d: `M ${f2(-w * 0.62)} ${f2(B.shin - 2)} Q ${f2(-w * 0.78)} ${f2(B.shin + w * 0.62)} ${f2(w * 0.05)} ${f2(B.shin + w * 0.62)} Q ${f2(w * 0.86)} ${f2(B.shin + w * 0.62)} ${f2(w * 0.68)} ${f2(B.shin - 2)} Z`, fill: feetHex, ...OUT, "data-limb": 1 }, knee);
      else el("path", { d: `M ${f2(-w * 0.45)} ${B.shin + 2} Q ${f2(-w * 0.5)} ${f2(B.shin + w * 0.55)} ${f2(w * 0.1)} ${f2(B.shin + w * 0.55)} L ${f2(w * 1.1)} ${f2(B.shin + w * 0.5)} Q ${f2(w * 1.15)} ${f2(B.shin + w * 0.1)} ${f2(w * 0.4)} ${B.shin - 2} Z`, fill: front ? feetHex : far(feetHex), ...OUT, "data-limb": 1 }, knee);
      // The outline underneath, the colour on top: no ring at the knee or the ankle.
      const o = outlineUnder(hip);
      return { hip, knee, o: { hip: o, knee: o.querySelector(":scope > g") } };
    };
    // The far arm hangs on the far side of the body: behind the legs, the skirt and the coat, not
    // only behind the chest. It has its own group, turned with the torso (apply).
    P.torsoBack = g(P.root);
    P.legB = leg(false);
    P.legF = leg(true);
    // Long clothes hang over both legs from the hips.
    const female = look.body === "woman";
    const skirtLen = G ? (G.skirt ? G.skirt.len : 0) : outfit.type === "robe" ? B.thigh + B.shin * 0.55 : outfit.type === "dress" ? B.thigh + B.shin * 0.85
      : outfit.type === "dongson" && female ? B.thigh + B.shin * 0.8 : outfit.type === "plume" ? B.thigh + B.shin * 0.7 : 0;
    const skirtHex = G ? (G.skirt ? G.skirt.color : skin) : outfit.type === "dress" || outfit.type === "dongson" ? outfit.skirt || "#2e2420" : outfit.type === "plume" ? outfit.skirt || "#8a5a2a" : outfit.color;
    if (skirtLen) {
      P.skirt = el("path", { fill: S.mat(skirtHex, true), ...OUT }, P.root);
      P.skirtFolds = el("path", { stroke: shade(skirtHex, -0.35), "stroke-width": 2.5, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, P.root);
    }
    // Đông Sơn skirts end in a patterned hem; the king's in a fringe of feathers.
    if (skirtLen && (outfit.type === "dongson" || outfit.type === "plume")) P.hem = el("path", { fill: "none", stroke: outfit.type === "plume" ? "#f2e6c8" : outfit.trim || "#c9902a", "stroke-width": outfit.type === "plume" ? 9 : 6, "stroke-dasharray": outfit.type === "plume" ? "4 7" : "10 6", "stroke-linecap": "round" }, P.root);
    P.skirtLen = skirtLen;
    // A short top (a woman's Đông Sơn áo) ends above the hips: the skirt's waist rises under it.
    P.skirtTop = outfit.type === "dongson" && female ? -B.torsoH * 0.18 - 8 : -6;
    // A long top hangs over the legs (and the skirt) as a coat tail, drawn like a skirt.
    if (G && G.coat) {
      P.coat = el("path", { fill: S.mat(G.coat.color, true), ...OUT }, P.root);
      P.coatFolds = el("path", { stroke: shade(G.coat.color, -0.35), "stroke-width": 2.5, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, P.root);
      if (G.coat.trim) P.coatHem = el("path", { fill: "none", stroke: G.coat.trim, "stroke-width": 6, "stroke-linecap": "round" }, P.root);
      P.coatLen = G.coat.len;
    }

    P.torso = g(P.root);
    // From the front the neck and the long hair are behind the shoulders (the collar comes over
    // the neck): a group moved with the head (apply).
    if (P.front) P.hairBack = g(P.torso);
    const arm = (front) => {
      // From the front both arms hang on the sides in front of the body; the far one is the near
      // one mirrored (the same angles open it to the other side).
      const near = front || P.front;
      const sh = g(P.front ? (front ? P.torso : g(P.torso, { transform: "scale(-1,1)" })) : front ? P.torso : P.torsoBack);
      front = near;
      WA.human.limb(S, sh, B.upper, B.armW, front ? sleeveHex : far(sleeveHex));
      const elbow = g(sh);
      const foreHex = G ? G.foreHex : outfit.type === "armor" || outfit.type === "enemy" ? skin : outfit.type === "robe" || outfit.type === "dress" ? outfit.color : skin;
      WA.human.limb(S, elbow, B.fore, B.armW * 0.92, front ? foreHex : far(foreHex), 0.66, 0.08, 0.28);
      if (G && G.wide) {
        const sg = g(elbow);
        WA.garments.sleeve(S, sg, B, outfit.top.color || "#6a4a2a", front);
        P.sleeves.push({ path: sg.firstChild, front });
      }
      if (look.tattoo && (outfit.type === "loincloth" || outfit.type === "dongson")) {
        for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(-B.armW * 0.4)} ${f2(B.fore * (0.25 + i * 0.18))} l ${f2(B.armW * 0.4)} -6 l ${f2(B.armW * 0.4)} 6`, stroke: "#3a3a5a", "stroke-width": 2.5, fill: "none", opacity: 0.55 }, elbow);
      }
      if (look.bracelets) for (let i = 0; i < 2; i++) el("rect", { x: f2(-B.armW * 0.5), y: f2(B.fore - 10 - i * 9), width: f2(B.armW), height: 6, rx: 3, fill: "url(#gold)", stroke: INK, "stroke-width": 1.5 }, elbow);
      const hand = g(elbow, { transform: `translate(0,${B.fore + 4})` });
      // A cartoon hand: the palm, the fingers together in one rounded lobe with two finger lines,
      // the thumb apart on the side facing forward.
      // look.gloves: gloved hands (astronauts, winter), else skin.
      const handHex = look.gloves || skin, hw = B.armW * 0.6, hc = front ? handHex : far(handHex), hl = shade(handHex, -0.32);
      el("path", { d: `M ${f2(hw * 0.45)} ${f2(-hw * 0.15)} Q ${f2(hw * 1.15)} ${f2(hw * 0.1)} ${f2(hw * 1.0)} ${f2(hw * 0.62)} Q ${f2(hw * 0.75)} ${f2(hw * 0.78)} ${f2(hw * 0.5)} ${f2(hw * 0.5)} Z`, fill: hc, ...OUT, "stroke-width": 3 }, hand);
      el("path", { d: `M ${f2(-hw * 0.72)} ${f2(-hw * 0.25)} Q ${f2(-hw * 0.85)} ${f2(hw * 0.9)} ${f2(-hw * 0.35)} ${f2(hw * 1.55)} Q ${f2(hw * 0.05)} ${f2(hw * 1.95)} ${f2(hw * 0.45)} ${f2(hw * 1.5)} Q ${f2(hw * 0.78)} ${f2(hw * 0.95)} ${f2(hw * 0.68)} ${f2(-hw * 0.25)} Q 0 ${f2(-hw * 0.5)} ${f2(-hw * 0.72)} ${f2(-hw * 0.25)} Z`, fill: hc, ...OUT }, hand);
      for (const xk of [-0.22, 0.18]) el("path", { d: `M ${f2(hw * xk)} ${f2(hw * 0.95)} q ${f2(hw * 0.03)} ${f2(hw * 0.32)} ${f2(hw * 0.02)} ${f2(hw * 0.55)}`, stroke: hl, "stroke-width": 2, fill: "none", "stroke-linecap": "round" }, hand);
      const o = outlineUnder(sh);
      // The near arm in the same cloth (or skin) as the body: the round top of the upper arm
      // has no line across the chest, so the arm grows out of the shoulder instead of lying on
      // it like a tube. Its outline starts at the shoulder joint.
      if (front && sleeveHex === torsoHex) {
        const up = o.querySelector(":scope > path");
        up.setAttribute("d", up.getAttribute("d").replace(/^M (\S+) 0 A \S+ \S+ 0 0 1 (\S+) 0/, "M $1 0 L $2 0"));
      }
      return { sh, elbow, hand, o: { sh: o, elbow: o.querySelector(":scope > g") } };
    };
    if (!P.front) P.armB = arm(false);
    drawTorso(S, P.torso, B, outfit, skin, look);
    P.head = g(P.torso);
    P.headInner = g(P.head);
    drawHead(S, P, P.headInner, B, look, skin, seed);
    if (P.front) P.armB = arm(false);
    P.armF = arm(true);
    // Props: the one in `prop` shows; `props` are extra ones a scene can switch to.
    P.props = {};
    for (const pr of [look.prop, ...(look.props || [])].filter(Boolean)) {
      const hand = pr.hand === "back" ? P.armB.hand : P.armF.hand;
      P.props[pr.type] = WA.human.prop(S, hand, pr.type);
    }
    P.activeProp = look.prop?.type ?? null;
    P.root.insertBefore(P.legF.o.hip, P.skirt || P.coat || P.torso);
    P.root.insertBefore(P.legF.hip, P.skirt || P.coat || P.torso);
    P.legLen = B.thigh + B.shin + B.legW * 0.5;
    P.height = P.legLen + B.torsoH + B.headR * (B.round ? 2 : 2.35);
    return P;
  }

  /**
   * A limb drawn as one piece: a copy of it underneath in solid ink (strokes twice as wide),
   * and the limb's own segments without strokes on top, so the overlapping round ends at the
   * knee, the elbow or the ankle show no line across, while the silhouette keeps its outline.
   * The copy is moved with the limb (apply). Detail lines (tattoos, finger lines) stay on top.
   */
  function outlineUnder(grp) {
    const o = grp.cloneNode(true);
    o.setAttribute("data-outline-of", "limb");
    for (const n of o.querySelectorAll("*")) {
      if (n.tagName === "g") continue;
      const f = n.getAttribute("fill");
      if (!f || f === "none") { n.setAttribute("display", "none"); continue; }
      n.setAttribute("fill", INK);
      n.setAttribute("stroke", INK);
      n.setAttribute("data-outline", 1);
      n.setAttribute("stroke-width", f2((parseFloat(n.getAttribute("stroke-width")) || 4.5) * 2));
    }
    grp.parentNode.insertBefore(o, grp);
    for (const n of grp.querySelectorAll("[data-limb]")) n.setAttribute("stroke", "none");
    return o;
  }

  /**
   * A limb from its joint, pointing down: round at both ends, tapering from w to w × taper, the
   * sides swelling a little where the muscle is (bulge, at `at` of the length), so an arm or a
   * leg is not a plain tube.
   */
  function limb(S, parent, L, w, hex, taper = 0.8, bulge = 0.07, at = 0.35) {
    const a = w / 2, b = (w * taper) / 2, m = a + (b - a) * at + w * bulge;
    return el("path", { d: `M ${f2(-a)} 0 A ${f2(a)} ${f2(a)} 0 0 1 ${f2(a)} 0 Q ${f2(m * 1.02)} ${f2(L * at)} ${f2(b)} ${f2(L)} A ${f2(b)} ${f2(b)} 0 0 1 ${f2(-b)} ${f2(L)} Q ${f2(-m * 1.02)} ${f2(L * at)} ${f2(-a)} 0 Z`, fill: S.mat(hex), ...OUT, "data-limb": 1 }, parent);
  }

  /** A band of Đông Sơn bronze-drum pattern: concentric circles between zigzags. */
  function dongsonBand(parent, x0, x1, y, h, color) {
    el("rect", { x: f2(x0), y: f2(y), width: f2(x1 - x0), height: f2(h), fill: shade(color, -0.15), stroke: INK, "stroke-width": 2 }, parent);
    let zig = `M ${f2(x0)} ${f2(y + h * 0.25)}`;
    for (let x = x0; x < x1; x += h * 0.5) zig += ` L ${f2(x + h * 0.25)} ${f2(y + h * 0.05)} L ${f2(x + h * 0.5)} ${f2(y + h * 0.25)}`;
    el("path", { d: zig, stroke: "#f1d08a", "stroke-width": 2, fill: "none" }, parent);
    for (let x = x0 + h * 0.5; x < x1 - h * 0.3; x += h * 0.9) {
      el("circle", { cx: f2(x), cy: f2(y + h * 0.62), r: f2(h * 0.26), fill: "none", stroke: "#f1d08a", "stroke-width": 2 }, parent);
      el("circle", { cx: f2(x), cy: f2(y + h * 0.62), r: f2(h * 0.1), fill: "#f1d08a" }, parent);
    }
  }

  function drawTorso(S, t, B, outfit, skin, look = {}) {
    const T = B.torsoH, w = B.torsoW, belly = (B.belly || 0) * w;
    // Back, shoulders, chest and (for a heavy build) a belly curving out at the front.
    const body = `M ${f2(-w / 2)} 8 C ${f2(-w * 0.56)} ${f2(-T * 0.4)} ${f2(-w * 0.52)} ${f2(-T * 0.8)} ${f2(-w * 0.44)} ${f2(-T + 6)} Q 0 ${f2(-T - 14)} ${f2(w * 0.46)} ${f2(-T + 6)} C ${f2(w * 0.56 + belly * 0.3)} ${f2(-T * 0.7)} ${f2(w * 0.5 + belly)} ${f2(-T * 0.3)} ${f2(w / 2 + 4)} 8 Q 2 20 ${f2(-w / 2)} 8 Z`;
    // Cloth folds: two soft creases down the chest and a few pulled at the waist (drawn over
    // the garment, after it).
    const folds = (color, hem = 0) => {
      const c = shade(color, -0.32);
      el("path", { d: `M ${f2(-w * 0.3)} ${f2(-T * 0.66)} q ${f2(w * 0.1)} ${f2(T * 0.14)} ${f2(w * 0.04)} ${f2(T * 0.32)} M ${f2(w * 0.2)} ${f2(-T * 0.48)} q ${f2(w * 0.08)} ${f2(T * 0.1)} ${f2(w * 0.02)} ${f2(T * 0.24)}`, stroke: c, "stroke-width": 2.5, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, t);
      el("path", { d: `M ${f2(-w * 0.36)} ${f2(hem - T * 0.12)} q ${f2(w * 0.06)} ${f2(T * 0.05)} ${f2(w * 0.1)} ${f2(T * 0.09)} M ${f2(w * 0.3)} ${f2(hem - T * 0.13)} q ${f2(-w * 0.05)} ${f2(T * 0.05)} ${f2(-w * 0.08)} ${f2(T * 0.1)}`, stroke: c, "stroke-width": 2, fill: "none", opacity: 0.5, "stroke-linecap": "round" }, t);
    };
    switch (outfit.type) {
      case "parts":
        WA.garments.torso(S, t, B, outfit, skin, look);
        break;
      case "dongson": {
        const female = look.body === "woman", color = outfit.color || "#8a5a2a";
        if (!female && look.bareChest) {
          el("path", { d: body, fill: S.mat(skin), ...OUT }, t);
          if (look.tattoo) for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(-w * 0.3)} ${f2(-T * (0.7 - i * 0.12))} q ${f2(w * 0.3)} 10 ${f2(w * 0.6)} 0`, stroke: "#3a3a5a", "stroke-width": 2.5, fill: "none", opacity: 0.5 }, t);
        } else {
          // A short top pulled over the head (áo chui đầu), ending at the waist.
          // Rounded shoulders, the sides drawn in a little at the waist, the hem flaring and curved.
          const hem = female ? -T * 0.18 : -2;
          el("path", { d: `M ${f2(-w * 0.53)} ${f2(hem)} C ${f2(-w * 0.47)} ${f2(-T * 0.4)} ${f2(-w * 0.55)} ${f2(-T * 0.8)} ${f2(-w * 0.44)} ${f2(-T + 6)} Q 0 ${f2(-T - 14)} ${f2(w * 0.48)} ${f2(-T + 6)} C ${f2(w * 0.58 + belly * 0.3)} ${f2(-T * 0.78)} ${f2(w * 0.48 + belly)} ${f2(-T * 0.4)} ${f2(w * 0.56 + 4)} ${f2(hem)} Q 2 ${f2(hem + 12)} ${f2(-w * 0.53)} ${f2(hem)} Z`, fill: S.mat(color), ...OUT }, t);
          folds(color, hem);
          el("path", { d: `M ${f2(-w * 0.18)} ${f2(-T - 1)} Q 4 ${f2(-T * 0.72)} ${f2(w * 0.26)} ${f2(-T - 1)}`, stroke: shade(color, -0.35), "stroke-width": 5, fill: "none" }, t); // round neck
          dongsonBand(t, -w / 2 + 2, w / 2 + 2, female ? -T * 0.34 : -T * 0.2, 16, outfit.trim || "#c9902a");
        }
        if (!female) {
          // Khố: a cloth wrapped round the hips, its end hanging in front.
          // (the front flap hangs in soft curves, a fold down it)
          const kc = outfit.skirt || "#6a4a2a";
          el("path", { d: `M ${f2(-w / 2)} -12 L ${f2(w / 2 + 4)} -12 Q ${f2(w / 2 + 5)} 2 ${f2(w / 2 + 1)} 13 Q ${f2(w * 0.36)} 30 ${f2(w * 0.24)} 46 Q ${f2(w * 0.12)} 40 ${f2(w * 0.02)} 26 Q ${f2(-w * 0.06)} 14 ${f2(-w * 0.12)} 12 Q ${f2(-w * 0.32)} 14 ${f2(-w / 2)} 10 Z`, fill: S.mat(kc, true), ...OUT }, t);
          el("path", { d: `M ${f2(w * 0.14)} 14 Q ${f2(w * 0.17)} 28 ${f2(w * 0.22)} 40`, stroke: shade(kc, -0.35), "stroke-width": 2, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, t);
          dongsonBand(t, -w / 2, w / 2 + 4, -12, 12, outfit.trim || "#c9902a");
        }
        break;
      }
      case "plume": {
        // The king: a top studded with bronze plates; the feathered skirt hangs from the hips.
        const color = outfit.color || "#8a3a22";
        el("path", { d: body, fill: S.mat(color), ...OUT }, t);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) el("circle", { cx: f2(-w * 0.32 + c * w * 0.22 + (r % 2) * w * 0.11), cy: f2(-T * 0.82 + r * T * 0.16), r: 5, fill: "url(#gold)", stroke: INK, "stroke-width": 1.5 }, t);
        dongsonBand(t, -w / 2 + 2, w / 2 + 2, -T * 0.08, 18, outfit.trim || "#c9902a");
        el("path", { d: `M ${f2(-w * 0.2)} ${f2(-T - 1)} Q 4 ${f2(-T * 0.7)} ${f2(w * 0.28)} ${f2(-T - 1)}`, stroke: "url(#gold)", "stroke-width": 9, fill: "none" }, t); // bronze collar
        break;
      }
      case "armor":
        el("path", { d: body, fill: "url(#iron)", ...OUT }, t);
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) el("path", { d: `M ${f2(-w * 0.43 + c * w * 0.185 + (r % 2) * w * 0.09)} ${f2(-T * 0.84 + r * T * 0.18)} q ${f2(w * 0.09)} 12 ${f2(w * 0.185)} 0`, stroke: "#b5c0cf", "stroke-width": 3, fill: "none", opacity: 0.85 }, t);
        el("rect", { x: f2(-w / 2), y: -16, width: f2(w + 4), height: 22, rx: 7, fill: S.mat("#8a5a2a", true), ...OUT }, t);
        el("circle", { cx: 2, cy: -5, r: 12, fill: "url(#gold)", ...OUT }, t);
        el("path", { d: `M ${f2(-w * 0.54)} ${f2(-T + 6)} Q ${f2(-w * 0.43)} ${f2(-T - 26)} -4 ${f2(-T - 12)} L -8 ${f2(-T + 24)} Q ${f2(-w * 0.37)} ${f2(-T + 28)} ${f2(-w * 0.54)} ${f2(-T + 6)} Z`, fill: S.mat("#7a8798", true), ...OUT }, t);
        break;
      case "enemy":
        el("path", { d: body, fill: S.mat("#4a2626", true), ...OUT }, t);
        for (let r = 0; r < 4; r++) el("path", { d: `M ${f2(-w * 0.45)} ${f2(-T * 0.8 + r * T * 0.2)} L ${f2(w * 0.47)} ${f2(-T * 0.8 + r * T * 0.2)}`, stroke: "#c9a04a", "stroke-width": 4 }, t);
        el("rect", { x: f2(-w / 2), y: -14, width: f2(w + 4), height: 18, rx: 6, fill: "#2a1a14", ...OUT }, t);
        break;
      case "loincloth":
        el("path", { d: body, fill: S.mat(skin), ...OUT }, t);
        el("path", { d: `M ${f2(-w / 2)} -14 L ${f2(w / 2 + 4)} -14 L ${f2(w / 2 + 2)} 10 L ${f2(w * 0.2)} 40 L ${f2(-w * 0.1)} 10 L ${f2(-w / 2)} 8 Z`, fill: S.mat(outfit.color || "#8a5a2a", true), ...OUT }, t);
        el("path", { d: `M ${f2(-w * 0.2)} ${f2(-T * 0.55)} q ${f2(w * 0.3)} 10 ${f2(w * 0.55)} 0`, stroke: shade(skin, -0.25), "stroke-width": 3, fill: "none" }, t);
        break;
      default: {
        // tunic (áo cánh), robe (áo thụng) and dress (áo tứ thân) tops
        el("path", { d: body, fill: S.mat(outfit.color || "#8a5a2a"), ...OUT }, t);
        folds(outfit.color || "#8a5a2a", 8);
        el("path", { d: `M 3 ${f2(-T + 2)} L 8 2`, stroke: shade(outfit.color || "#8a5a2a", -0.3), "stroke-width": 3 }, t);
        if (outfit.type === "tunic") for (let i = 0; i < 4; i++) el("circle", { cx: 8, cy: f2(-T * 0.83 + i * T * 0.22), r: 3, fill: "#f1d08a", stroke: INK, "stroke-width": 1.5 }, t);
        if (outfit.trim) el("path", { d: `M ${f2(-w * 0.2)} ${f2(-T - 2)} Q 4 ${f2(-T * 0.6)} ${f2(w * 0.3)} ${f2(-T - 2)}`, stroke: outfit.trim, "stroke-width": 7, fill: "none" }, t);
        el("path", { d: `M ${f2(-w / 2)} 0 Q 2 12 ${f2(w / 2 + 4)} 0`, stroke: outfit.sash || shade(outfit.color || "#8a5a2a", -0.4), "stroke-width": 8, fill: "none" }, t);
      }
    }
  }

  /** Default face parts by body, varied per character by its seed (crowds aren't clones). */
  function faceFor(look, seed) {
    if (look.face) return look.face;
    const r = WA.core.rand(seed + 17), pick = (a) => a[Math.floor(r() * a.length)];
    switch (look.body) {
      case "child": return { shape: "round", eyes: "round", nose: "button", brows: "thin" };
      case "woman": return { shape: "oval", eyes: "almond", nose: pick(["button", "long"]), brows: "thin" };
      case "elder": return { shape: "oval", eyes: "droopy", nose: pick(["long", "round"]), brows: "bushy", wrinkles: true };
      case "strong": return { shape: "square", eyes: "almond", nose: "long", brows: "thick" };
      default: return { shape: pick(["oval", "square", "jowl"]), eyes: pick(["almond", "narrow", "round"]), nose: pick(["round", "long", "button"]), brows: pick(["thick", "bushy"]), mustache: pick(["none", "none", "thin"]) };
    }
  }

  function drawHead(S, P, h, B, look, skin, seed) {
    const R = B.headR, round = !!B.round, hair = look.hair || { style: round ? "traidao" : "short" };
    const hairHex = hair.color || "#2a1a12";
    // Head centre relative to the neck joint.
    const front = P.front;
    const cx = front ? 0 : round ? 4 : 8, cy = round ? -R : -R * 1.3, xc = front ? cx : cx + R * 0.28;
    // A short, sturdy neck (a thin one made adults look like lollipops).
    if (!round) {
      const nd = front ? `M ${f2(cx - R * 0.44)} 6 L ${f2(cx - R * 0.36)} ${f2(-R * 0.62)} L ${f2(cx + R * 0.36)} ${f2(-R * 0.62)} L ${f2(cx + R * 0.44)} 6 Z`
        : `M ${f2(cx - R * 0.42)} 6 L ${f2(cx - R * 0.36)} ${f2(-R * 0.62)} L ${f2(cx + R * 0.4)} ${f2(-R * 0.62)} L ${f2(cx + R * 0.5)} 6 Z`;
      el("path", { d: nd, fill: S.mat(shade(skin, -0.1)), ...OUT }, front ? P.hairBack : h);
      // The jaw's shadow on the neck: a hard-edged band following the chin (not in flat prints).
      if (!S.flat) {
        const id = S.id("nk");
        S.addDefs(`<clipPath id="${id}"><path d="${nd}"/></clipPath>`);
        el("ellipse", { cx: f2(cx + (front ? 0 : R * 0.12)), cy: f2(cy + R * 1.08), rx: f2(R * 0.85), ry: f2(R * 0.42), fill: shade(skin, -0.32), opacity: 0.6, "clip-path": `url(#${id})` }, front ? P.hairBack : h);
      }
    }
    if (front) return drawHeadFront(S, P, h, B, look, skin, seed, cx, cy, R, hair, hairHex);
    if (hair.style === "long") el("path", { d: `M ${f2(cx - R * 0.9)} ${f2(cy - R * 0.3)} Q ${f2(cx - R * 1.4)} ${f2(cy + R * 1.4)} ${f2(cx - R * 0.6)} ${f2(cy + R * 2.6)} L ${f2(cx - R * 0.1)} ${f2(cy + R * 1.6)} Q ${f2(cx - R * 0.2)} ${f2(cy + R * 0.6)} ${f2(cx)} ${f2(cy)} Z`, fill: hairHex, ...OUT }, P.swayG(h, cx - R * 0.55, cy - R * 0.2, 0.8));
    // A hat that closes over the head hides the bun (it is gathered inside).
    const hatOverBun = ["mu_canh_chuon", "binh_thien", "crown", "helmet", "enemy_helmet", "khan_xep", "khan_mo_qua", "khan_van", "non_chop"].includes(look.headwear);
    if (hair.style === "bun" && !hatOverBun) el("circle", { cx: f2(cx - R * 0.95), cy: f2(cy - R * 0.55), r: f2(R * 0.36), fill: hairHex, ...OUT }, P.swayG(h, cx - R * 0.7, cy - R * 0.5, 0.25));
    // The face (three-quarter view): head, ear, eyes, brows, nose, mouth, marks.
    P.face = WA.face.build(S, h, { cx, cy, R, skin, face: faceFor(look, seed), child: round, female: look.body === "woman", hairColor: hair.style === "turban" ? look.beard || "#2a1a12" : hairHex, browColor: hair.style === "bald" ? shade(skin, -0.5) : undefined, browTop: hair.style === "traidao" || hair.style === "bald" ? undefined : cy - R * 0.44 }, seed);
    // Hair over the scalp.
    if (hair.style === "traidao") {
      el("path", { d: `M ${f2(cx - R * 0.8)} ${f2(cy - R * 0.4)} Q ${f2(cx - R * 0.45)} ${f2(cy - R * 1.08)} ${f2(cx + R * 0.33)} ${f2(cy - R * 1.04)} Q ${f2(cx - R * 0.15)} ${f2(cy - R * 0.85)} ${f2(cx - R * 0.37)} ${f2(cy - R * 0.52)} Z`, fill: shade(skin, -0.1), opacity: 0.6 }, h);
      P.tuft = g(g(h, { transform: `translate(${f2(cx + R * 0.22)},${f2(cy - R * 0.93)})` }));
      el("path", { d: `M ${f2(-R * 0.26)} 2 Q ${f2(-R * 0.11)} ${f2(-R * 0.63)} ${f2(R * 0.48)} ${f2(-R * 0.56)} Q ${f2(R * 0.19)} ${f2(-R * 0.41)} ${f2(R * 0.22)} ${f2(-R * 0.15)} Q ${f2(R * 0.04)} ${f2(-R * 0.07)} ${f2(-R * 0.26)} 2 Z`, fill: hairHex, ...OUT }, P.tuft);
    } else if (hair.style !== "bald") {
      // A hairline that follows the turned head: higher over the far temple.
      // The fringe falls in a few locks along the hairline (not one straight edge, which read as
      // a wig); strands and a soft shine on the crown give the hair its volume.
      const lo = hair.style === "long" ? 0.08 : 0;
      const fringe = el("path", { d: `M ${f2(cx - R * 0.97)} ${f2(cy + R * 0.12)} Q ${f2(cx - R * 1.06)} ${f2(cy - R * 1.12)} ${f2(cx + R * 0.15)} ${f2(cy - R * 1.08)} Q ${f2(cx + R * 0.86)} ${f2(cy - R * 1.0)} ${f2(cx + R * 0.9)} ${f2(cy - R * 0.55)}`
        + ` Q ${f2(cx + R * 0.74)} ${f2(cy - R * (0.42 - lo))} ${f2(cx + R * 0.5)} ${f2(cy - R * 0.7)}`
        + ` Q ${f2(cx + R * 0.32)} ${f2(cy - R * (0.5 - lo))} ${f2(cx + R * 0.08)} ${f2(cy - R * 0.72)}`
        + ` Q ${f2(cx - R * 0.08)} ${f2(cy - R * (0.46 - lo))} ${f2(cx - R * 0.32)} ${f2(cy - R * 0.5)}`
        + ` Q ${f2(cx - R * 0.6)} ${f2(cy - R * 0.25)} ${f2(cx - R * 0.66)} ${f2(cy + R * 0.18)} Z`, fill: S.mat(hairHex, true), ...OUT }, h);
      // Cel shadow of the fringe on the forehead: the same locks, a little lower, cut to the head.
      if (!S.flat) h.insertBefore(el("path", { d: fringe.getAttribute("d"), transform: `translate(0 ${f2(R * 0.09)})`, fill: shade(skin, -0.3), opacity: 0.45, "clip-path": `url(#${P.face.clip})` }, h), fringe);
      const strand = WA.core.mixColor(hairHex, parseInt(hairHex.slice(1), 16) > 0x888888 ? "#7a7068" : "#ffffff", 0.28);
      for (const [x0, y0, x1, y1, qx, qy] of [[-0.75, -0.55, 0.1, -1.0, -0.5, -1.0], [-0.55, -0.35, 0.45, -0.9, -0.2, -0.95], [-0.2, -0.6, 0.7, -0.75, 0.25, -0.9]]) {
        el("path", { d: `M ${f2(cx + R * x0)} ${f2(cy + R * y0)} Q ${f2(cx + R * qx)} ${f2(cy + R * qy)} ${f2(cx + R * x1)} ${f2(cy + R * y1)}`, stroke: strand, "stroke-width": 2, fill: "none", opacity: 0.55, "stroke-linecap": "round" }, h);
      }
      el("path", { d: `M ${f2(cx - R * 0.55)} ${f2(cy - R * 0.85)} Q ${f2(cx - R * 0.1)} ${f2(cy - R * 1.12)} ${f2(cx + R * 0.45)} ${f2(cy - R * 0.98)}`, stroke: "#ffffff", "stroke-width": 5, fill: "none", opacity: 0.18, "stroke-linecap": "round" }, h);
    }
    if (hair.style === "turban") el("path", { d: `M ${f2(cx - R * 1.0)} ${f2(cy - R * 0.25)} Q ${f2(cx)} ${f2(cy - R * 1.5)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.45)} L ${f2(cx + R * 0.9)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 0.95)} ${f2(cx - R * 0.95)} ${f2(cy + R * 0.05)} Z`, fill: S.mat(hair.color || "#3a2a20", true), ...OUT }, h);
    // Brows stay over the hairline.
    for (const b of P.face.brows) h.appendChild(b);
    if (look.earrings) el("circle", { cx: f2(cx - R * 0.9), cy: f2(cy + R * 0.45), r: f2(R * 0.11), fill: "none", stroke: "url(#gold)", "stroke-width": 4 }, h);
    if (look.beard) {
      // A beard along the jaw, ending in three locks, a few strands in it; its top leaves the
      // mouth free, and it lies under the mouth so an open mouth always shows.
      const bd = P.swayG(h, xc - R * 0.1, cy + R * 0.5, 0.3);
      // Back edge: from the sideburn in front of the ear, round the jaw (a little outside it, so
      // the jaw line is covered); top edge: from the sideburn down the cheek to the mouth.
      el("path", { d: `M ${f2(cx - R * 0.64)} ${f2(cy + R * 0.12)} L ${f2(cx - R * 0.95)} ${f2(cy + R * 0.34)} Q ${f2(cx - R * 0.84)} ${f2(cy + R * 1.04)} ${f2(xc - R * 0.36)} ${f2(cy + R * 1.34)}`
        + ` Q ${f2(xc - R * 0.24)} ${f2(cy + R * 1.2)} ${f2(xc - R * 0.14)} ${f2(cy + R * 1.26)} Q ${f2(xc - R * 0.06)} ${f2(cy + R * 1.5)} ${f2(xc + R * 0.02)} ${f2(cy + R * 1.56)}`
        + ` Q ${f2(xc + R * 0.08)} ${f2(cy + R * 1.38)} ${f2(xc + R * 0.16)} ${f2(cy + R * 1.3)} Q ${f2(xc + R * 0.24)} ${f2(cy + R * 1.36)} ${f2(xc + R * 0.3)} ${f2(cy + R * 1.32)}`
        + ` Q ${f2(xc + R * 0.5)} ${f2(cy + R * 0.95)} ${f2(xc + R * 0.46)} ${f2(cy + R * 0.42)}`
        + ` Q ${f2(xc + R * 0.4)} ${f2(cy + R * 0.66)} ${f2(xc + R * 0.24)} ${f2(cy + R * 0.74)} Q ${f2(xc)} ${f2(cy + R * 0.84)} ${f2(xc - R * 0.28)} ${f2(cy + R * 0.72)} Q ${f2(xc - R * 0.42)} ${f2(cy + R * 0.64)} ${f2(xc - R * 0.5)} ${f2(cy + R * 0.48)}`
        + ` Q ${f2(cx - R * 0.42)} ${f2(cy + R * 0.34)} ${f2(cx - R * 0.64)} ${f2(cy + R * 0.12)} Z`, fill: S.mat(look.beard, true), ...OUT }, bd);
      const bs = WA.core.mixColor(look.beard, parseInt(look.beard.slice(1), 16) > 0x888888 ? "#8a8278" : "#ffffff", 0.3);
      for (const [x0, y0, x1, y1] of [[-0.82, 0.5, -0.66, 0.92], [-0.4, 0.86, -0.28, 1.18], [-0.04, 0.95, 0.0, 1.38], [0.24, 0.86, 0.2, 1.18]]) {
        el("path", { d: `M ${f2(xc + R * x0)} ${f2(cy + R * y0)} Q ${f2(xc + R * (x0 + x1) / 2 - R * 0.03)} ${f2(cy + R * (y0 + y1) / 2)} ${f2(xc + R * x1)} ${f2(cy + R * y1)}`, stroke: bs, "stroke-width": 2, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, bd);
      }
      h.insertBefore(bd, P.face.mouth);
    }
    drawHeadwear(S, h, look.headwear, cx, cy, R, P);
  }

  /**
   * The head from the front (presenters): a symmetric face, the hair parted over the forehead in
   * locks, long hair falling behind the shoulders, a bun on top. Headwear and beards are only
   * drawn three-quarter (the presenters have neither, except the space helmet).
   */
  function drawHeadFront(S, P, h, B, look, skin, seed, cx, cy, R, hair, hairHex) {
    const round = !!B.round;
    const face = faceFor(look, seed), shape = WA.face.SHAPES[face.shape || (round ? "round" : "oval")] || WA.face.SHAPES.oval;
    const rx = R * shape.rx, ry = R * shape.ry;
    if (hair.style === "long" && P.hairBack) {
      // Behind the head and the shoulders: a curtain from the crown down past the shoulders,
      // swaying a little.
      const hb = P.swayG(P.hairBack, cx, cy - ry * 0.5, 0.35), bot = cy + R * 2.0, wx = rx * 1.22;
      el("path", { d: `M ${f2(cx - rx * 1.04)} ${f2(cy - ry * 0.2)} Q ${f2(cx - rx * 1.06)} ${f2(cy - ry * 1.14)} ${f2(cx)} ${f2(cy - ry * 1.12)} Q ${f2(cx + rx * 1.06)} ${f2(cy - ry * 1.14)} ${f2(cx + rx * 1.04)} ${f2(cy - ry * 0.2)}`
        + ` Q ${f2(cx + wx)} ${f2(cy + R * 1.1)} ${f2(cx + wx * 0.95)} ${f2(bot)} Q ${f2(cx + wx * 0.6)} ${f2(bot + R * 0.16)} ${f2(cx + wx * 0.3)} ${f2(bot - R * 0.06)}`
        + ` L ${f2(cx - wx * 0.3)} ${f2(bot - R * 0.06)} Q ${f2(cx - wx * 0.6)} ${f2(bot + R * 0.16)} ${f2(cx - wx * 0.95)} ${f2(bot)} Q ${f2(cx - wx)} ${f2(cy + R * 1.1)} ${f2(cx - rx * 1.04)} ${f2(cy - ry * 0.2)} Z`, fill: S.mat(shade(hairHex, -0.05), true), ...OUT }, hb);
      P.hairBack.insertBefore(hb, P.hairBack.firstChild); // (behind the neck too)
    }
    const hatOverBun = ["space_helmet"].includes(look.headwear) ? false : !!look.headwear;
    if (hair.style === "bun" && !hatOverBun) el("circle", { cx: f2(cx), cy: f2(cy - ry * 1.12), r: f2(R * 0.34), fill: S.mat(hairHex, true), ...OUT }, P.swayG(h, cx, cy - ry * 0.95, 0.2));
    P.face = WA.face.build(S, h, { cx, cy, R, skin, face, child: round, female: look.body === "woman", front: true, hairColor: hairHex, browColor: hair.style === "bald" ? shade(skin, -0.5) : undefined, browTop: hair.style === "bald" ? undefined : cy - R * 0.44 }, seed);
    if (hair.style !== "bald") {
      // The cap of hair over the crown, down the temples to the ears; the fringe in five locks.
      const ox = rx * 1.05, top = cy - ry * 1.1, side = cy + R * (hair.style === "long" ? 0.42 : 0.05);
      const lo = hair.style === "long" ? 0.06 : 0;
      const locks = [[0.8, -0.42], [0.56, -0.66], [0.3, -0.5 + lo], [0.06, -0.7], [-0.2, -0.5 + lo], [-0.44, -0.68], [-0.66, -0.46 + lo], [-0.8, -0.42]];
      let d = `M ${f2(cx - ox)} ${f2(side)} Q ${f2(cx - ox * 1.04)} ${f2(top - ry * 0.02)} ${f2(cx)} ${f2(top)} Q ${f2(cx + ox * 1.04)} ${f2(top - ry * 0.02)} ${f2(cx + ox)} ${f2(side)}`;
      d += ` Q ${f2(cx + rx * 0.96)} ${f2(side + R * 0.1)} ${f2(cx + rx * 0.84)} ${f2(side - R * 0.04)} Q ${f2(cx + rx * 0.8)} ${f2(cy - R * 0.2)} ${f2(cx + rx * locks[0][0])} ${f2(cy + R * locks[0][1])}`;
      for (let i = 1; i < locks.length; i++) {
        const [x0, y0] = locks[i - 1], [x1, y1] = locks[i], hi = Math.min(y0, y1) - 0.02;
        d += ` Q ${f2(cx + rx * (x0 + x1) / 2)} ${f2(cy + R * (y1 < y0 ? hi + 0.24 : hi))} ${f2(cx + rx * x1)} ${f2(cy + R * y1)}`;
      }
      d += ` Q ${f2(cx - rx * 0.8)} ${f2(cy - R * 0.2)} ${f2(cx - rx * 0.84)} ${f2(side - R * 0.04)} Q ${f2(cx - rx * 0.96)} ${f2(side + R * 0.1)} ${f2(cx - ox)} ${f2(side)} Z`;
      const fringe = el("path", { d, fill: S.mat(hairHex, true), ...OUT }, h);
      if (!S.flat) h.insertBefore(el("path", { d, transform: `translate(0 ${f2(R * 0.09)})`, fill: shade(skin, -0.3), opacity: 0.45, "clip-path": `url(#${P.face.clip})` }, h), fringe);
      const strand = WA.core.mixColor(hairHex, parseInt(hairHex.slice(1), 16) > 0x888888 ? "#7a7068" : "#ffffff", 0.28);
      for (const sd of [-1, 1]) {
        el("path", { d: `M ${f2(cx + sd * rx * 0.1)} ${f2(top + ry * 0.08)} Q ${f2(cx + sd * rx * 0.6)} ${f2(top + ry * 0.12)} ${f2(cx + sd * rx * 0.78)} ${f2(cy - R * 0.5)}`, stroke: strand, "stroke-width": 2, fill: "none", opacity: 0.55, "stroke-linecap": "round" }, h);
      }
      el("path", { d: `M ${f2(cx - rx * 0.5)} ${f2(top + ry * 0.16)} Q ${f2(cx)} ${f2(top - ry * 0.02)} ${f2(cx + rx * 0.5)} ${f2(top + ry * 0.16)}`, stroke: "#ffffff", "stroke-width": 5, fill: "none", opacity: 0.18, "stroke-linecap": "round" }, h);
    }
    for (const b of P.face.brows) h.appendChild(b);
    if (look.headwear === "space_helmet") drawHeadwear(S, h, "space_helmet_front", cx, cy, R, P);
  }

  function drawHeadwear(S, h, type, cx, cy, R, P) {
    const up = (px, py, gain = 1) => (P ? P.swayG(h, px, py, gain, true) : h);
    if (WA.garments && WA.garments.headwear(S, h, type, cx, cy, R)) return;
    switch (type) {
      case "nonla":
        el("path", { d: `M ${f2(cx - R * 1.9)} ${f2(cy - R * 0.35)} L ${f2(cx + R * 0.1)} ${f2(cy - R * 1.75)} L ${f2(cx + R * 2.0)} ${f2(cy - R * 0.35)} Q ${f2(cx)} ${f2(cy - R * 0.15)} ${f2(cx - R * 1.9)} ${f2(cy - R * 0.35)} Z`, fill: S.mat("#e9cf8f", true), ...OUT }, h);
        for (let i = 1; i < 4; i++) el("path", { d: `M ${f2(cx - R * 1.9 * (1 - i * 0.22))} ${f2(cy - R * (0.35 + i * 0.33))} L ${f2(cx + R * 2.0 * (1 - i * 0.22))} ${f2(cy - R * (0.35 + i * 0.33))}`, stroke: "#b8995a", "stroke-width": 2.5 }, h);
        break;
      case "space_helmet":
      case "space_helmet_front": {
        // A round glass bubble over the whole head (astronauts), its rim on the shoulders.
        const hx = type === "space_helmet_front" ? cx : cx + R * 0.12, hy = cy + R * 0.12, r = R * 1.5;
        el("circle", { cx: f2(hx), cy: f2(hy), r: f2(r), fill: "#d8eeff", "fill-opacity": 0.22, stroke: "#8fa9bf", "stroke-width": 5 }, h);
        el("path", { d: `M ${f2(hx - r * 0.62)} ${f2(hy - r * 0.55)} A ${f2(r * 0.85)} ${f2(r * 0.85)} 0 0 1 ${f2(hx + r * 0.1)} ${f2(hy - r * 0.86)}`, stroke: "#ffffff", "stroke-width": 7, fill: "none", opacity: 0.75, "stroke-linecap": "round" }, h);
        el("ellipse", { cx: f2(hx - (type === "space_helmet_front" ? 0 : R * 0.05)), cy: f2(hy + r * 0.86), rx: f2(R * 0.62), ry: f2(R * 0.16), fill: "#c7d2dc", stroke: INK, "stroke-width": 3 }, h);
        break;
      }
      case "helmet":
        el("path", { d: `M ${f2(cx - R * 1.1)} ${f2(cy - R * 0.1)} Q ${f2(cx - R * 1.2)} ${f2(cy - R * 1.45)} ${f2(cx + R * 0.05)} ${f2(cy - R * 1.5)} Q ${f2(cx + R * 1.15)} ${f2(cy - R * 1.45)} ${f2(cx + R * 1.1)} ${f2(cy - R * 0.3)} L ${f2(cx + R * 0.65)} ${f2(cy - R * 0.55)} Q ${f2(cx)} ${f2(cy - R * 0.85)} ${f2(cx - R * 0.6)} ${f2(cy - R * 0.6)} L ${f2(cx - R * 0.75)} ${f2(cy + R * 0.38)} Q ${f2(cx - R * 1.05)} ${f2(cy + R * 0.35)} ${f2(cx - R * 1.1)} ${f2(cy - R * 0.1)} Z`, fill: "url(#iron)", ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.05)} ${f2(cy - R * 1.48)} Q ${f2(cx - R * 0.65)} ${f2(cy - R * 2.85)} ${f2(cx - R * 2.3)} ${f2(cy - R * 2.8)} Q ${f2(cx - R * 1.3)} ${f2(cy - R * 2.2)} ${f2(cx - R * 1.15)} ${f2(cy - R * 1.5)} Z`, fill: "url(#cape)", ...OUT }, up(cx - R * 0.05, cy - R * 1.48, 1.1));
        el("circle", { cx: f2(cx), cy: f2(cy - R * 1.45), r: f2(R * 0.22), fill: "url(#gold)", ...OUT }, h);
        break;
      case "enemy_helmet":
        el("path", { d: `M ${f2(cx - R * 1.1)} ${f2(cy)} Q ${f2(cx - R * 1.0)} ${f2(cy - R * 1.3)} ${f2(cx + R * 0.1)} ${f2(cy - R * 2.0)} Q ${f2(cx + R * 1.0)} ${f2(cy - R * 1.3)} ${f2(cx + R * 1.05)} ${f2(cy - R * 0.35)} Q ${f2(cx)} ${f2(cy - R * 0.75)} ${f2(cx - R * 0.65)} ${f2(cy - R * 0.4)} L ${f2(cx - R * 0.8)} ${f2(cy + R * 0.5)} Z`, fill: S.mat("#3a2a2a", true), ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.6)} ${f2(cy - R * 1.2)} L ${f2(cx + R * 0.6)} ${f2(cy - R * 1.2)}`, stroke: "#c9a04a", "stroke-width": 5 }, h);
        break;
      case "feather": {
        // Feather headdress of the Hùng kings, as on the Đông Sơn bronze drums.
        el("path", { d: `M ${f2(cx - R * 1.0)} ${f2(cy - R * 0.45)} Q ${f2(cx)} ${f2(cy - R * 0.95)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.5)} L ${f2(cx + R * 0.9)} ${f2(cy - R * 0.25)} Q ${f2(cx)} ${f2(cy - R * 0.7)} ${f2(cx - R * 0.98)} ${f2(cy - R * 0.2)} Z`, fill: "url(#gold)", ...OUT }, h);
        const fg = up(cx, cy - R * 0.75, 0.7);
        for (let i = 0; i < 7; i++) {
          const a = -70 + i * 22, bx = cx - R * 0.7 + i * R * 0.25, by = cy - R * 0.75;
          el("path", { d: `M ${f2(bx)} ${f2(by)} q ${f2(-R * 0.25)} ${f2(-R * 0.9)} ${f2(R * 0.05)} ${f2(-R * 1.9)} q ${f2(R * 0.28)} ${f2(R * 0.9)} ${f2(-R * 0.05)} ${f2(R * 1.9)} Z`, fill: i % 2 ? "#f2e6c8" : "#c0392b", ...OUT, "stroke-width": 3, transform: `rotate(${f2(a * 0.4)} ${f2(bx)} ${f2(by)})` }, fg);
        }
        break;
      }
      case "feather_band": {
        // A headband with a few upright feathers: the Lạc lords and warriors of the bronze drums.
        el("path", { d: `M ${f2(cx - R * 0.98)} ${f2(cy - R * 0.32)} Q ${f2(cx)} ${f2(cy - R * 0.78)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.4)} L ${f2(cx + R * 0.92)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 0.58)} ${f2(cx - R * 0.96)} ${f2(cy - R * 0.1)} Z`, fill: S.mat("#8a5a2a", true), ...OUT }, h);
        const fb = up(cx - R * 0.25, cy - R * 0.62, 0.9);
        for (let i = 0; i < 3; i++) {
          const bx = cx - R * 0.55 + i * R * 0.3, by = cy - R * 0.62 - i * 2;
          el("path", { d: `M ${f2(bx)} ${f2(by)} q ${f2(-R * 0.2)} ${f2(-R * 0.7)} ${f2(-R * 0.05)} ${f2(-R * 1.5)} q ${f2(R * 0.26)} ${f2(R * 0.7)} ${f2(R * 0.05)} ${f2(R * 1.5)} Z`, fill: i === 1 ? "#c0392b" : "#f2e6c8", ...OUT, "stroke-width": 3, transform: `rotate(${f2(-18 + i * 6)} ${f2(bx)} ${f2(by)})` }, fb);
        }
        break;
      }
      case "crown": {
        // A king's (or queen's) cap where the records do not say which: a gold cap with a red
        // band and a jewel over the forehead, its back raised higher, as on East Asian court
        // hats; never the pointed European crown.
        const gold = "url(#gold)";
        el("path", { d: `M ${f2(cx - R * 0.98)} ${f2(cy - R * 0.5)} Q ${f2(cx - R * 1.05)} ${f2(cy - R * 1.9)} ${f2(cx - R * 0.2)} ${f2(cy - R * 1.92)} Q ${f2(cx + R * 0.3)} ${f2(cy - R * 1.9)} ${f2(cx + R * 0.32)} ${f2(cy - R * 1.2)} Z`, fill: S.mat("#8b1a1a", true), ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.8)} ${f2(cy - R * 1.2)} Q ${f2(cx - R * 0.7)} ${f2(cy - R * 1.75)} ${f2(cx - R * 0.2)} ${f2(cy - R * 1.76)}`, stroke: "#f1d08a", "stroke-width": 3, fill: "none", opacity: 0.8 }, h);
        el("path", { d: `M ${f2(cx - R * 1.02)} ${f2(cy - R * 0.2)} Q ${f2(cx - R * 1.08)} ${f2(cy - R * 1.35)} ${f2(cx + R * 0.02)} ${f2(cy - R * 1.38)} Q ${f2(cx + R * 1.02)} ${f2(cy - R * 1.3)} ${f2(cx + R * 0.97)} ${f2(cy - R * 0.4)} Q ${f2(cx)} ${f2(cy - R * 0.78)} ${f2(cx - R * 1.02)} ${f2(cy - R * 0.2)} Z`, fill: gold, ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 1.02)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 0.78)} ${f2(cx + R * 0.97)} ${f2(cy - R * 0.4)} L ${f2(cx + R * 0.99)} ${f2(cy - R * 0.62)} Q ${f2(cx)} ${f2(cy - R * 1.0)} ${f2(cx - R * 1.04)} ${f2(cy - R * 0.44)} Z`, fill: S.mat("#a8241e", true), ...OUT, "stroke-width": 2.5 }, h);
        for (let i = 0; i < 5; i++) el("circle", { cx: f2(cx - R * 0.7 + i * R * 0.38), cy: f2(cy - R * (0.47 + 0.24 * Math.sin((i / 4) * Math.PI) + i * 0.02)), r: f2(R * 0.045), fill: "#f1d08a" }, h);
        el("path", { d: `M ${f2(cx + R * 0.2)} ${f2(cy - R * 1.28)} Q ${f2(cx + R * 0.3)} ${f2(cy - R * 0.95)} ${f2(cx + R * 0.32)} ${f2(cy - R * 0.85)}`, stroke: "#9a7420", "stroke-width": 2.5, fill: "none", opacity: 0.7 }, h);
        el("circle", { cx: f2(cx + R * 0.42), cy: f2(cy - R * 1.02), r: f2(R * 0.13), fill: "#c0392b", ...OUT, "stroke-width": 2.5 }, h);
        el("circle", { cx: f2(cx + R * 0.38), cy: f2(cy - R * 1.06), r: f2(R * 0.04), fill: "#ffffff", opacity: 0.7 }, h);
        break;
      }
    }
  }

  /** Props are drawn along +y from the fist (continuing the forearm), unless they hang. */
  function prop(S, hand, type) {
    const p = g(hand);
    switch (type) {
      case "iron_whip": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -10, y: -9, width: 236, height: 18, rx: 9, fill: S.mat("#3d444e", true), ...OUT }, w);
        for (let i = 1; i < 7; i++) el("rect", { x: i * 33, y: -11, width: 9, height: 22, rx: 3, fill: "#6a7380", ...OUT }, w);
        el("circle", { cx: 236, cy: 0, r: 13, fill: S.mat("#5a626e"), ...OUT }, w);
        break;
      }
      case "bamboo": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -40, y: -10, width: 360, height: 20, rx: 10, fill: S.mat("#7fa04a", true), ...OUT }, w);
        for (let i = 0; i < 5; i++) el("rect", { x: -20 + i * 70, y: -12, width: 8, height: 24, rx: 3, fill: "#5d7a32" }, w);
        for (let i = 0; i < 9; i++) el("path", { d: `M ${300 + (i % 3) * 14} 0 q 30 ${-20 + i * 5} 70 ${-30 + i * 8} q -40 4 -70 ${30 - i * 8}`, fill: i % 2 ? "#4f7a3a" : "#3f6a32", ...OUT, "stroke-width": 2 }, w);
        break;
      }
      case "spear": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -120, y: -6, width: 330, height: 12, rx: 6, fill: S.mat("#8a5a2a", true), ...OUT }, w);
        el("path", { d: "M 206 -12 L 270 0 L 206 12 Z", fill: "url(#gold)", ...OUT }, w);
        break;
      }
      case "sword": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -10, y: -7, width: 34, height: 14, rx: 4, fill: "#5a3a22", ...OUT }, w);
        el("rect", { x: 22, y: -14, width: 10, height: 28, rx: 3, fill: "url(#gold)", ...OUT }, w);
        el("path", { d: "M 32 -8 L 150 -4 L 170 0 L 150 4 L 32 8 Z", fill: S.mat("#c9a04a", true), ...OUT }, w);
        break;
      }
      case "scroll":
        el("rect", { x: -40, y: -10, width: 80, height: 20, rx: 9, fill: S.mat("#f1dfb0", true), ...OUT }, p);
        el("rect", { x: -48, y: -13, width: 10, height: 26, rx: 4, fill: "#8a5a2a", ...OUT }, p);
        el("rect", { x: 38, y: -13, width: 10, height: 26, rx: 4, fill: "#8a5a2a", ...OUT }, p);
        break;
      case "stick": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -20, y: -6, width: 190, height: 12, rx: 6, fill: S.mat("#7a5a3a", true), ...OUT }, w);
        break;
      }
      case "bowl":
        el("path", { d: "M -30 -4 Q 0 34 30 -4 Z", fill: S.mat("#e9e2d0", true), ...OUT, transform: "translate(0,-8)" }, p);
        el("ellipse", { cx: 0, cy: -12, rx: 30, ry: 8, fill: "#fbf8ef", ...OUT, "stroke-width": 3 }, p);
        el("ellipse", { cx: 0, cy: -16, rx: 24, ry: 8, fill: "#ffffff", stroke: "#e2dccb", "stroke-width": 2 }, p);
        break;
      case "broken_whip": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -10, y: -9, width: 110, height: 18, rx: 9, fill: S.mat("#3d444e", true), ...OUT }, w);
        el("path", { d: "M 98 -9 L 112 -4 L 104 2 L 114 9 L 98 9 Z", fill: "#59616d", ...OUT }, w);
        break;
      }
      case "horn": { // tù và: a buffalo horn blown to call the people
        const w = g(p, { transform: "rotate(-60)" });
        el("path", { d: "M -6 -8 C 30 -14 70 -10 96 -40 L 108 -30 C 84 6 36 14 -6 10 Z", fill: S.mat("#d9c7a0", true), ...OUT }, w);
        el("path", { d: "M 20 -12 L 24 10 M 50 -14 L 54 6", stroke: "#8a6a3a", "stroke-width": 3 }, w);
        break;
      }
      case "bronze_axe": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -20, y: -6, width: 170, height: 12, rx: 6, fill: S.mat("#6b4a2a", true), ...OUT }, w);
        el("path", { d: "M 130 -8 Q 150 -46 176 -40 Q 170 0 176 40 Q 150 46 130 8 Z", fill: "url(#gold)", ...OUT }, w);
        break;
      }
      case "shield": // a round bronze shield with a star in the middle, as on the drums
        el("ellipse", { cx: 0, cy: 0, rx: 44, ry: 56, fill: "url(#gold)", ...OUT }, p);
        el("ellipse", { cx: 0, cy: 0, rx: 30, ry: 40, fill: "none", stroke: "#8a5a1a", "stroke-width": 3 }, p);
        for (let i = 0; i < 8; i++) el("line", { x1: 0, y1: 0, x2: f2(18 * Math.cos((i * Math.PI) / 4)), y2: f2(24 * Math.sin((i * Math.PI) / 4)), stroke: "#8a5a1a", "stroke-width": 3 }, p);
        break;
      case "basket":
        el("path", { d: "M -46 6 Q -50 60 0 66 Q 50 60 46 6 Z", fill: S.mat("#c99a5a", true), ...OUT }, p);
        el("ellipse", { cx: 0, cy: 8, rx: 46, ry: 12, fill: "#f6f0e0", ...OUT }, p);
        el("path", { d: "M -40 30 Q 0 40 40 30 M -38 48 Q 0 58 38 48", stroke: "#8a6a3a", "stroke-width": 3, fill: "none" }, p);
        break;
      case "flag": {
        const w = g(p, { transform: "rotate(90)" });
        el("rect", { x: -60, y: -6, width: 360, height: 12, rx: 6, fill: S.mat("#6b4a2a", true), ...OUT }, w);
        P_flag(w);
        break;
      }
    }
    return p;
    function P_flag(w) {
      el("path", { d: "M 300 0 L 300 -110 Q 230 -90 180 -110 L 180 0 Z", fill: "#c0392b", ...OUT, transform: "rotate(90 300 0) translate(0,0)" }, w);
    }
  }

  /**
   * Apply a pose. p: world x, y (feet; or the seat when p.seated), scale, facing (1 | -1),
   * opacity, lean, headTilt, rot, sx/sy squash, breath, legF/legB/armF/armB [upper, lower],
   * face (expression), talk, tuft, capeWave, hideBackLeg, armsBehindHead, dy (sink, local).
   */
  function apply(P, p, t) {
    const B = P.B, T = B.torsoH, s = p.scale ?? 1, facing = p.facing ?? 1;
    // The rig's origin is the hips: lift it by the leg length so the feet stand at p.y.
    const hipY = p.seated ? p.y : p.y - (P.legLen - (p.dy || 0)) * s * (p.sy || 1);
    tr(P.root, p.x, hipY, (p.rot || 0) * facing, s * facing * (p.sx || 1), s * (p.sy || 1));
    P.root.setAttribute("opacity", f2(clamp(p.opacity ?? 1)));
    tr(P.torso, 0, 0, (p.lean || 0) + (B.stoop || 0), 1, 1 + (p.breath || 0));
    tr(P.torsoBack, 0, 0, (p.lean || 0) + (B.stoop || 0), 1, 1 + (p.breath || 0));
    // Follow-through: f = how the body is moving (from the player: forward speed vf in rig units
    // per second, lean speed dl and forearm turn speeds wF/wB in degrees per second).
    const f = p.follow || { vf: 0, dl: 0, wF: 0, wB: 0 };
    // The head nods a little with the voice and lags when the body pitches.
    const nod = (p.talk || 0) * 3.2 * Math.sin(t * 6.3 + P.seed) - Math.max(-6, Math.min(6, f.dl * 0.06));
    if (P.front) return applyFront(P, p, t, f, nod);
    tr(P.head, 4, -T, (p.headTilt || 0) + nod);
    for (const k of ["legF", "legB"]) {
      const a = p[k] || [0, 0];
      tr(P[k].hip, k === "legF" ? 7 : -7, 0, -a[0]);
      tr(P[k].knee, 0, B.thigh, -a[1]);
      tr(P[k].o.hip, k === "legF" ? 7 : -7, 0, -a[0]);
      tr(P[k].o.knee, 0, B.thigh, -a[1]);
    }
    for (const k of ["armF", "armB"]) {
      const a = p[k] || [0, 0];
      tr(P[k].sh, k === "armF" ? 10 : -6, -T + 14, -a[0]);
      tr(P[k].elbow, 0, B.upper, -a[1]);
      tr(P[k].o.sh, k === "armF" ? 10 : -6, -T + 14, -a[0]);
      tr(P[k].o.elbow, 0, B.upper, -a[1]);
    }
    P.legB.hip.setAttribute("opacity", p.hideBackLeg ? 0 : 1);
    P.legB.o.hip.setAttribute("opacity", p.hideBackLeg ? 0 : 1);
    // A hand raised above the shoulder passes behind the (turned) head, never across the face.
    const behind = p.armsBehindHead || (p.armF?.[0] ?? 0) - (p.lean || 0) > 115;
    if (behind) { if (P.armF.sh.nextSibling !== P.head) { P.torso.insertBefore(P.armF.o.sh, P.head); P.torso.insertBefore(P.armF.sh, P.head); } }
    else if (P.armF.sh.nextSibling === P.head) { P.torso.appendChild(P.armF.o.sh); P.torso.appendChild(P.armF.sh); }
    applyRest(P, p, t, f);
  }

  /**
   * The joints of a rig seen from the front. The poses are written for the side view (angles
   * forward-positive); from the front an arm lifted forward opens out to the side instead, and a
   * bent elbow folds the forearm in front of the body while the arm is low (talking, worrying)
   * or up over it once the arm is raised (waving, cheering). Legs only part a little.
   */
  function applyFront(P, p, t, f, nod) {
    const B = P.B, T = B.torsoH;
    tr(P.head, 2, -T, (p.headTilt || 0) * 0.5 + nod * 0.6);
    if (P.hairBack) tr(P.hairBack, 2, -T, (p.headTilt || 0) * 0.5 + nod * 0.6);
    const hx = B.torsoW * 0.2 + 2;
    for (const k of ["legF", "legB"]) {
      const a = p[k] || [0, 0], sd = k === "legF" ? 1 : -1, x = 2 + sd * hx;
      // (the far leg mirrored: both open outwards)
      const r = sd * (2 + Math.abs(a[0]) * 0.12), kn = -sd * Math.abs(a[1]) * 0.08;
      for (const [hp, kn2] of [[P[k].hip, P[k].knee], [P[k].o.hip, P[k].o.knee]]) {
        hp.setAttribute("transform", `translate(${f2(x)},0) rotate(${f2(r)})`);
        tr(kn2, 0, B.thigh, kn);
      }
    }
    const sx = B.torsoW / 2 - B.armW * 0.42;
    // A raised arm stays out to the side: a child's big head is wider than its shoulders, an arm
    // straight up would cross the face.
    const maxUp = B.round ? 146 : 166;
    for (const k of ["armF", "armB"]) {
      const a = p[k] || [0, 0], up = 6 + Math.max(0, Math.min(maxUp - 6, a[0]));
      // -1 (forearm folds in front of the body) … +1 (forearm goes on up), by how high the arm is
      const bend = Math.max(-1, Math.min(1, (a[0] - 70) / 20));
      const lo = Math.min(a[1] * (bend < 0 ? bend * 2 : bend), maxUp + 8 - up);
      // Raised high, the arm passes behind the head (beside it, never over the face).
      const grp = k === "armF" ? P.armF.sh : P.armB.sh.parentNode, og = k === "armF" ? P.armF.o.sh : null;
      const behind = up > 110;
      if (behind && grp.nextSibling !== P.head && (!og || og.nextSibling !== P.head)) { if (og) P.torso.insertBefore(og, P.head); P.torso.insertBefore(grp, P.head); }
      else if (!behind && P.head.compareDocumentPosition(grp) & 2) { if (og) P.torso.appendChild(og); P.torso.appendChild(grp); }
      // The far arm sits in a mirrored group: the shoulder's x is measured from the body's centre
      // (2) on its own side.
      const x = k === "armF" ? 2 + sx : sx - 2;
      tr(P[k].sh, x, -T + 14, -up);
      tr(P[k].elbow, 0, B.upper, -lo);
      tr(P[k].o.sh, x, -T + 14, -up);
      tr(P[k].o.elbow, 0, B.upper, -lo);
    }
    applyRest(P, p, t, f);
  }

  /** Face, props, hair sway, sleeves, skirt, coat, cape: the same from any side. */
  function applyRest(P, p, t, f) {
    const B = P.B, T = B.torsoH;
    WA.face.apply(P.face, p.face || "neutral", t, p.talk || 0, p.viseme);
    // The head's shadow side is away from the light: the back of the head, or the face when the
    // light is behind (the player sets lightFlip).
    if (P.face.form) P.face.form.setAttribute("cx", f2(P.face.formX[P.lightFlip ? 1 : 0]));
    const shown = p.prop !== undefined ? p.prop : P.activeProp;
    for (const k in P.props) P.props[k].setAttribute("opacity", k === shown ? 1 : 0);
    if (P.tuft) tr(P.tuft, 0, 0, p.tuft || 0);
    // Hair, beard, feathers trail behind the movement and settle with a slow sway.
    const drag = Math.max(-14, Math.min(14, f.vf * 0.028)), pitch = Math.max(-10, Math.min(10, f.dl * 0.1));
    for (const w of P.sway) {
      const a = ((w.up ? -drag : drag) - pitch + 1.8 * Math.sin(t * 1.7 + w.px * 0.07 + P.seed)) * w.gain;
      w.g.setAttribute("transform", `rotate(${f2(a)} ${f2(w.px)} ${f2(w.py)})`);
    }
    // Wide sleeves: the cloth stays sewn along the forearm, the open bag of it hangs towards the
    // ground (part of the way, so it never folds over the arm) and lags when the arm swings.
    for (const sl of P.sleeves) {
      const a = p[sl.front ? "armF" : "armB"] || [0, 0], lag = Math.max(-25, Math.min(25, (sl.front ? f.wF : f.wB) * 0.05));
      const R = (Math.max(-50, Math.min(50, ((p.lean || 0) + (B.stoop || 0) - a[0] - a[1]) * 0.4 + lag)) * Math.PI) / 180;
      const L = B.fore, w = B.armW, dx = Math.sin(R), dy = Math.cos(R);
      // The bag: one smooth curve from the inner top to the wrist, pulled out towards its lowest
      // point (no corner), then back up the forearm.
      const bx = -w * 0.55, by = L * 0.15, wx = w * 0.6, wy = L * 0.9;
      const cx2 = -w * 1.3 + dx * L * 0.45, cy2 = L * 0.5 + dy * L * 0.48;
      sl.path.setAttribute("d", `M ${f2(bx)} ${f2(by)} C ${f2(bx + (cx2 - bx) * 1.25)} ${f2(by + (cy2 - by) * 1.25)} ${f2(wx + (cx2 - wx) * 1.25)} ${f2(wy + (cy2 - wy) * 1.25)} ${f2(wx)} ${f2(wy)} L ${f2(w * 0.5)} ${f2(by)} Z`);
    }
    if (P.skirt) {
      const L = P.skirtLen, w = B.torsoW, a = ((p.legF?.[0] || 0) - (p.legB?.[0] || 0)) * 0.6, sw = Math.sin(t * 3) * 3 - Math.max(-9, Math.min(9, f.vf * 0.02));
      const sb = -w * 0.62 - Math.abs(a) * 0.3 + sw, sf = w * 0.6 + a + sw;
      const st = P.skirtTop;
      P.skirt.setAttribute("d", `M ${f2(-w / 2 + 2)} ${f2(st)} L ${f2(w / 2 + 2)} ${f2(st)} C ${f2(w / 2 + 5)} ${f2(L * 0.3)} ${f2(sf - 4)} ${f2(L * 0.6)} ${f2(sf)} ${f2(L)} Q 0 ${f2(L + 14)} ${f2(sb)} ${f2(L)} C ${f2(sb + 4)} ${f2(L * 0.6)} ${f2(-w * 0.52)} ${f2(L * 0.3)} ${f2(-w / 2 + 2)} ${f2(st)} Z`);
      P.skirtFolds?.setAttribute("d", `M ${f2(-w * 0.15)} 4 Q ${f2(-w * 0.2 + sw * 0.5)} ${f2(L * 0.5)} ${f2(-w * 0.28 + sw)} ${f2(L - 6)} M ${f2(w * 0.2)} 4 Q ${f2(w * 0.26 + a * 0.4 + sw * 0.5)} ${f2(L * 0.5)} ${f2(w * 0.32 + a * 0.6 + sw)} ${f2(L - 6)}`);
      if (P.hem) P.hem.setAttribute("d", `M ${f2(-w * 0.62 - Math.abs(a) * 0.3 + sw)} ${f2(L - 8)} Q 0 ${f2(L + 6)} ${f2(w * 0.6 + a + sw)} ${f2(L - 8)}`);
    }
    if (P.coat) {
      // The coat tail hangs from the waist (as wide as the body there, belly included), its sides
      // curving out to a flared, rounded hem; the front edge swings with the legs.
      const L = P.coatLen, w = B.torsoW, bf = (B.belly || 0) * w * 0.55, a = ((p.legF?.[0] || 0) - (p.legB?.[0] || 0)) * 0.55, sw = Math.sin(t * 3 + 1) * 2.5 - Math.max(-9, Math.min(9, f.vf * 0.02));
      const xb = -w * 0.62 - Math.abs(a) * 0.3 + sw, xf = w * 0.6 + bf * 0.6 + a + sw;
      P.coat.setAttribute("d", `M ${f2(-w / 2)} -14 L ${f2(w / 2 + 3 + bf)} -14 C ${f2(w / 2 + 6 + bf)} ${f2(L * 0.3)} ${f2(xf - 4)} ${f2(L * 0.6)} ${f2(xf)} ${f2(L)}`
        + ` Q ${f2((xf * 2) / 3)} ${f2(L + 9)} ${f2(xf / 3 + xb / 6)} ${f2(L + 7)} Q ${f2(xb / 2)} ${f2(L + 12)} ${f2(xb)} ${f2(L)} C ${f2(xb + 4)} ${f2(L * 0.6)} ${f2(-w * 0.53)} ${f2(L * 0.3)} ${f2(-w / 2)} -14 Z`);
      P.coatFolds?.setAttribute("d", `M ${f2(-w * 0.12)} 6 Q ${f2(-w * 0.18 + sw * 0.5)} ${f2(L * 0.55)} ${f2(-w * 0.3 + sw)} ${f2(L - 2)}`
        + ` M ${f2(w * 0.18 + bf * 0.3)} 6 Q ${f2(w * 0.24 + bf * 0.3 + a * 0.4)} ${f2(L * 0.55)} ${f2(w * 0.3 + bf * 0.4 + a * 0.6 + sw)} ${f2(L)}`
        + ` M ${f2(w * 0.02)} ${f2(L * 0.45)} Q ${f2(w * 0.04 + sw * 0.3)} ${f2(L * 0.75)} ${f2(w * 0.02 + sw * 0.5)} ${f2(L + 4)}`);
      P.coatHem?.setAttribute("d", `M ${f2(xb + 1)} ${f2(L - 4)} Q ${f2(xb / 2)} ${f2(L + 8)} ${f2(xf / 3 + xb / 6)} ${f2(L + 3)} Q ${f2((xf * 2) / 3)} ${f2(L + 5)} ${f2(xf - 1)} ${f2(L - 4)}`);
    }
    if (P.cape) {
      const w = Math.min(1.4, (p.capeWave || 0) + Math.abs(f.vf) * 0.0025), fl = Math.sin(t * 13) * w, fl2 = Math.sin(t * 9 + 1) * w;
      P.cape.setAttribute("d", `M -14 ${-T + 12} C ${f2(-70 - w * 30)} ${f2(-T * 0.5 + fl * 10)} ${f2(-120 - w * 60)} ${f2(-30 + w * 10 + fl2 * 12)} ${f2(-170 - w * 110)} ${f2(40 - w * 25 + fl * 22)} Q ${f2(-120 - w * 80)} ${f2(70 - w * 10 + fl2 * 14)} ${f2(-60 - w * 50)} ${f2(58 - w * 4)} C -36 10 -30 ${f2(-T * 0.5)} 14 ${-T + 22} Z`);
    }
  }

  const PROP_LEN = { iron_whip: 250, broken_whip: 120, bamboo: 380, spear: 270, sword: 170, flag: 300, stick: 170, bronze_axe: 180, horn: 90 };

  /**
   * World points of a posed person (for camera framing and effects), and a bounding box
   * [left, top, right, bottom] that includes the raised arm, the prop and the cape.
   */
  function points(P, p) {
    const s = p.scale ?? 1, f = p.facing ?? 1, B = P.B, T = B.torsoH;
    const hipY = p.seated ? p.y : p.y - (P.legLen - (p.dy || 0)) * s;
    const tall = P.look.headwear === "helmet" || P.look.headwear === "feather" ? 1.3 : (WA.garments && WA.garments.TALL[P.look.headwear]) || 0;
    const top = hipY - (T + B.headR * (B.round ? 2 : 2.35)) * s - B.headR * tall * s;
    // The front arm (and what it holds) by forward kinematics: angles are forward-positive.
    const lean = ((p.lean || 0) + (B.stoop || 0)) * (Math.PI / 180);
    const dir = (deg) => [Math.sin(deg), Math.cos(deg)];
    const sh = [10 * Math.cos(lean) + (T - 14) * Math.sin(lean), -(T - 14) * Math.cos(lean) + 10 * Math.sin(lean)];
    // A limb hanging from a torso leaning forward swings back: its angle is (joint - lean).
    const a1 = ((p.armF?.[0] || 0) * Math.PI) / 180 - lean, a2 = a1 + ((p.armF?.[1] || 0) * Math.PI) / 180;
    const reach = B.fore + 10 + (PROP_LEN[p.prop !== undefined ? p.prop : P.activeProp] || 0);
    const elbow = [sh[0] + B.upper * dir(a1)[0], sh[1] + B.upper * dir(a1)[1]];
    const tip = [elbow[0] + reach * dir(a2)[0], elbow[1] + reach * dir(a2)[1]];
    const front = Math.max(B.torsoW * 0.6, tip[0] + 10), back = P.look.cape ? 200 : B.torsoW * 0.6;
    const xs = [p.x + front * s * f, p.x - back * s * f];
    let box = [Math.min(...xs), Math.min(top, hipY + tip[1] * s), Math.max(...xs), p.seated ? hipY + B.thigh * s : p.y];
    // Lying down (or fallen): the body is along the ground, not up from it.
    if (Math.abs(p.rot || 0) > 45) { const len = P.height * s * 0.85; box = [p.x - len * 0.6, p.y - P.height * s * 0.45, p.x + len * 0.6, p.y]; }
    // The head follows the lean of the torso (a bow brings it forward and down).
    const neck = (T + B.headR * (B.round ? 1 : 1.3)) * s, lean2 = lean + ((p.rot || 0) * Math.PI) / 180;
    const head = [p.x + (8 * s + Math.sin(lean2) * neck) * f, hipY - Math.cos(lean2) * neck];
    return { feet: [p.x, p.y], hips: [p.x, hipY], head, headR: B.headR * s, hand: [p.x + tip[0] * s * f, hipY + tip[1] * s], top, height: P.height * s, box };
  }

  WA.human = { build, apply, points, limb, prop, dongsonBand, BODIES };
})();
