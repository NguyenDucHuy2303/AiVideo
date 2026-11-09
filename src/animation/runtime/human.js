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
 *     headwear: "nonla"|"helmet"|"feather"|"enemy_helmet"|"crown"|undefined,
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
    const P = { root: g(parent), B, look, S };
    const far = (hex) => shade(hex, -0.25);
    const legHex = outfit.type === "armor" ? "#55606f" : outfit.type === "enemy" ? "#3a2a2a" : look.legs || skin;
    const bareLegs = outfit.type === "loincloth" || outfit.type === "dongson" || outfit.type === "plume";
    const pantsHex = look.pants || (outfit.type === "armor" ? "#3a4350" : bareLegs ? skin : "#5c3b22");
    const feetHex = outfit.type === "armor" || outfit.type === "enemy" ? "#2b3139" : shade(skin, -0.1);
    const sleeveHex = outfit.type === "armor" ? "#5d6a79" : outfit.type === "loincloth" || outfit.type === "dongson" || outfit.type === "plume" ? skin : outfit.type === "enemy" ? "#4a2626" : outfit.color;

    if (look.cape) P.cape = el("path", { fill: look.cape === true ? "url(#cape)" : look.cape, ...OUT }, P.root);
    const leg = (front) => {
      const hip = g(P.root);
      WA.human.limb(S, hip, B.thigh, B.legW, front ? pantsHex : far(pantsHex));
      const knee = g(hip);
      WA.human.limb(S, knee, B.shin, B.legW * 0.88, front ? legHex : far(legHex));
      const w = B.legW;
      el("path", { d: `M ${f2(-w * 0.45)} ${B.shin + 2} Q ${f2(-w * 0.5)} ${f2(B.shin + w * 0.55)} ${f2(w * 0.1)} ${f2(B.shin + w * 0.55)} L ${f2(w * 1.1)} ${f2(B.shin + w * 0.5)} Q ${f2(w * 1.15)} ${f2(B.shin + w * 0.1)} ${f2(w * 0.4)} ${B.shin - 2} Z`, fill: front ? feetHex : far(feetHex), ...OUT }, knee);
      return { hip, knee };
    };
    P.legB = leg(false);
    P.legF = leg(true);
    // Long clothes hang over both legs from the hips.
    const female = look.body === "woman";
    const skirtLen = outfit.type === "robe" ? B.thigh + B.shin * 0.55 : outfit.type === "dress" ? B.thigh + B.shin * 0.85
      : outfit.type === "dongson" && female ? B.thigh + B.shin * 0.8 : outfit.type === "plume" ? B.thigh + B.shin * 0.7 : 0;
    const skirtHex = outfit.type === "dress" || outfit.type === "dongson" ? outfit.skirt || "#2e2420" : outfit.type === "plume" ? outfit.skirt || "#8a5a2a" : outfit.color;
    if (skirtLen) {
      P.skirt = el("path", { fill: S.mat(skirtHex, true), ...OUT }, P.root);
      P.skirtFolds = el("path", { stroke: shade(skirtHex, -0.35), "stroke-width": 2.5, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, P.root);
    }
    // Đông Sơn skirts end in a patterned hem; the king's in a fringe of feathers.
    if (skirtLen && (outfit.type === "dongson" || outfit.type === "plume")) P.hem = el("path", { fill: "none", stroke: outfit.type === "plume" ? "#f2e6c8" : outfit.trim || "#c9902a", "stroke-width": outfit.type === "plume" ? 9 : 6, "stroke-dasharray": outfit.type === "plume" ? "4 7" : "10 6", "stroke-linecap": "round" }, P.root);
    P.skirtLen = skirtLen;

    P.torso = g(P.root);
    const arm = (front) => {
      const sh = g(P.torso);
      WA.human.limb(S, sh, B.upper, B.armW, front ? sleeveHex : far(sleeveHex));
      const elbow = g(sh);
      WA.human.limb(S, elbow, B.fore, B.armW * 0.88, front ? (outfit.type === "armor" || outfit.type === "enemy" ? skin : outfit.type === "robe" || outfit.type === "dress" ? outfit.color : skin) : far(skin));
      if (look.tattoo && (outfit.type === "loincloth" || outfit.type === "dongson")) {
        for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(-B.armW * 0.4)} ${f2(B.fore * (0.25 + i * 0.18))} l ${f2(B.armW * 0.4)} -6 l ${f2(B.armW * 0.4)} 6`, stroke: "#3a3a5a", "stroke-width": 2.5, fill: "none", opacity: 0.55 }, elbow);
      }
      if (look.bracelets) for (let i = 0; i < 2; i++) el("rect", { x: f2(-B.armW * 0.5), y: f2(B.fore - 10 - i * 9), width: f2(B.armW), height: 6, rx: 3, fill: "url(#gold)", stroke: INK, "stroke-width": 1.5 }, elbow);
      const hand = g(elbow, { transform: `translate(0,${B.fore + 4})` });
      // A cartoon hand: the palm and a thumb on the side facing forward.
      const hw = B.armW * 0.62;
      el("ellipse", { cx: f2(hw * 0.5), cy: f2(-hw * 0.1), rx: f2(hw * 0.42), ry: f2(hw * 0.3), fill: front ? skin : far(skin), ...OUT, "stroke-width": 3, transform: `rotate(-35 ${f2(hw * 0.5)} ${f2(-hw * 0.1)})` }, hand);
      el("ellipse", { cx: 0, cy: f2(hw * 0.15), rx: f2(hw * 0.82), ry: f2(hw * 0.95), fill: front ? skin : far(skin), ...OUT }, hand);
      el("path", { d: `M ${f2(-hw * 0.5)} ${f2(hw * 0.55)} q ${f2(hw * 0.5)} ${f2(hw * 0.3)} ${f2(hw)} 0`, stroke: shade(skin, -0.3), "stroke-width": 2, fill: "none", opacity: 0.7 }, hand); // knuckles
      return { sh, elbow, hand };
    };
    P.armB = arm(false);
    drawTorso(S, P.torso, B, outfit, skin, look);
    P.head = g(P.torso);
    P.headInner = g(P.head);
    drawHead(S, P, P.headInner, B, look, skin, seed);
    P.armF = arm(true);
    // Props: the one in `prop` shows; `props` are extra ones a scene can switch to.
    P.props = {};
    for (const pr of [look.prop, ...(look.props || [])].filter(Boolean)) {
      const hand = pr.hand === "back" ? P.armB.hand : P.armF.hand;
      P.props[pr.type] = WA.human.prop(S, hand, pr.type);
    }
    P.activeProp = look.prop?.type ?? null;
    P.root.insertBefore(P.legF.hip, P.skirt || P.torso);
    P.legLen = B.thigh + B.shin + B.legW * 0.5;
    P.height = P.legLen + B.torsoH + B.headR * (B.round ? 2 : 2.35);
    return P;
  }

  /** A limb from its joint, pointing down: round at both ends, tapering from w to w × taper. */
  function limb(S, parent, L, w, hex, taper = 0.8) {
    const a = w / 2, b = (w * taper) / 2;
    return el("path", { d: `M ${f2(-a)} 0 A ${f2(a)} ${f2(a)} 0 0 1 ${f2(a)} 0 L ${f2(b)} ${f2(L)} A ${f2(b)} ${f2(b)} 0 0 1 ${f2(-b)} ${f2(L)} Z`, fill: S.mat(hex), ...OUT }, parent);
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
    const folds = (color) => {
      el("path", { d: `M ${f2(-w * 0.3)} ${f2(-T * 0.62)} q ${f2(w * 0.1)} ${f2(T * 0.12)} ${f2(w * 0.04)} ${f2(T * 0.3)} M ${f2(w * 0.18)} ${f2(-T * 0.35)} q ${f2(w * 0.08)} ${f2(T * 0.1)} ${f2(w * 0.02)} ${f2(T * 0.25)}`, stroke: shade(color, -0.3), "stroke-width": 2.5, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, t);
    };
    switch (outfit.type) {
      case "dongson": {
        const female = look.body === "woman", color = outfit.color || "#8a5a2a";
        if (!(!female && look.bareChest)) folds(color);
        if (!female && look.bareChest) {
          el("path", { d: body, fill: S.mat(skin), ...OUT }, t);
          if (look.tattoo) for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(-w * 0.3)} ${f2(-T * (0.7 - i * 0.12))} q ${f2(w * 0.3)} 10 ${f2(w * 0.6)} 0`, stroke: "#3a3a5a", "stroke-width": 2.5, fill: "none", opacity: 0.5 }, t);
        } else {
          // A short top pulled over the head (áo chui đầu), ending at the waist.
          el("path", { d: `M ${f2(-w / 2)} ${f2(female ? -T * 0.18 : -2)} L ${f2(-w * 0.46)} ${f2(-T + 6)} Q 0 ${f2(-T - 14)} ${f2(w * 0.48)} ${f2(-T + 6)} L ${f2(w / 2 + 4)} ${f2(female ? -T * 0.18 : -2)} Q 2 ${f2(female ? -T * 0.1 : 8)} ${f2(-w / 2)} ${f2(female ? -T * 0.18 : -2)} Z`, fill: S.mat(color), ...OUT }, t);
          el("path", { d: `M ${f2(-w * 0.18)} ${f2(-T - 1)} Q 4 ${f2(-T * 0.72)} ${f2(w * 0.26)} ${f2(-T - 1)}`, stroke: shade(color, -0.35), "stroke-width": 5, fill: "none" }, t); // round neck
          dongsonBand(t, -w / 2 + 2, w / 2 + 2, female ? -T * 0.34 : -T * 0.2, 16, outfit.trim || "#c9902a");
        }
        if (!female) {
          // Khố: a cloth wrapped round the hips, its end hanging in front.
          el("path", { d: `M ${f2(-w / 2)} -12 L ${f2(w / 2 + 4)} -12 L ${f2(w / 2 + 2)} 12 L ${f2(w * 0.22)} 46 L ${f2(-w * 0.08)} 12 L ${f2(-w / 2)} 10 Z`, fill: S.mat(outfit.skirt || "#6a4a2a", true), ...OUT }, t);
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
        folds(outfit.color || "#8a5a2a");
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
    const cx = round ? 4 : 8, cy = round ? -R : -R * 1.3, xc = cx + R * 0.28;
    // A short, sturdy neck (a thin one made adults look like lollipops).
    if (!round) el("path", { d: `M ${f2(cx - R * 0.42)} 6 L ${f2(cx - R * 0.36)} ${f2(-R * 0.62)} L ${f2(cx + R * 0.4)} ${f2(-R * 0.62)} L ${f2(cx + R * 0.5)} 6 Z`, fill: S.mat(shade(skin, -0.1)), ...OUT }, h);
    if (hair.style === "long") el("path", { d: `M ${f2(cx - R * 0.9)} ${f2(cy - R * 0.3)} Q ${f2(cx - R * 1.4)} ${f2(cy + R * 1.4)} ${f2(cx - R * 0.6)} ${f2(cy + R * 2.6)} L ${f2(cx - R * 0.1)} ${f2(cy + R * 1.6)} Q ${f2(cx - R * 0.2)} ${f2(cy + R * 0.6)} ${f2(cx)} ${f2(cy)} Z`, fill: hairHex, ...OUT }, h);
    if (hair.style === "bun") el("circle", { cx: f2(cx - R * 0.95), cy: f2(cy - R * 0.55), r: f2(R * 0.36), fill: hairHex, ...OUT }, h);
    // The face (three-quarter view): head, ear, eyes, brows, nose, mouth, marks.
    P.face = WA.face.build(S, h, { cx, cy, R, skin, face: faceFor(look, seed), child: round, female: look.body === "woman", hairColor: hairHex, browColor: hair.style === "bald" ? shade(skin, -0.5) : undefined }, seed);
    // Hair over the scalp.
    if (hair.style === "traidao") {
      el("path", { d: `M ${f2(cx - R * 0.8)} ${f2(cy - R * 0.4)} Q ${f2(cx - R * 0.45)} ${f2(cy - R * 1.08)} ${f2(cx + R * 0.33)} ${f2(cy - R * 1.04)} Q ${f2(cx - R * 0.15)} ${f2(cy - R * 0.85)} ${f2(cx - R * 0.37)} ${f2(cy - R * 0.52)} Z`, fill: shade(skin, -0.1), opacity: 0.6 }, h);
      P.tuft = g(g(h, { transform: `translate(${f2(cx + R * 0.22)},${f2(cy - R * 0.93)})` }));
      el("path", { d: `M ${f2(-R * 0.26)} 2 Q ${f2(-R * 0.11)} ${f2(-R * 0.63)} ${f2(R * 0.48)} ${f2(-R * 0.56)} Q ${f2(R * 0.19)} ${f2(-R * 0.41)} ${f2(R * 0.22)} ${f2(-R * 0.15)} Q ${f2(R * 0.04)} ${f2(-R * 0.07)} ${f2(-R * 0.26)} 2 Z`, fill: hairHex, ...OUT }, P.tuft);
    } else if (hair.style !== "bald") {
      // A hairline that follows the turned head: higher over the far temple.
      el("path", { d: `M ${f2(cx - R * 0.97)} ${f2(cy + R * 0.12)} Q ${f2(cx - R * 1.06)} ${f2(cy - R * 1.12)} ${f2(cx + R * 0.15)} ${f2(cy - R * 1.08)} Q ${f2(cx + R * 0.86)} ${f2(cy - R * 1.0)} ${f2(cx + R * 0.9)} ${f2(cy - R * 0.55)} Q ${f2(xc)} ${f2(cy - R * (hair.style === "long" ? 0.62 : 0.78))} ${f2(cx - R * 0.32)} ${f2(cy - R * 0.5)} Q ${f2(cx - R * 0.6)} ${f2(cy - R * 0.25)} ${f2(cx - R * 0.66)} ${f2(cy + R * 0.18)} Z`, fill: hairHex, ...OUT }, h);
    }
    if (hair.style === "turban") el("path", { d: `M ${f2(cx - R * 1.0)} ${f2(cy - R * 0.25)} Q ${f2(cx)} ${f2(cy - R * 1.5)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.45)} L ${f2(cx + R * 0.9)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 0.95)} ${f2(cx - R * 0.95)} ${f2(cy + R * 0.05)} Z`, fill: S.mat(hair.color || "#3a2a20", true), ...OUT }, h);
    // Brows stay over the hairline.
    for (const b of P.face.brows) h.appendChild(b);
    if (look.earrings) el("circle", { cx: f2(cx - R * 0.9), cy: f2(cy + R * 0.45), r: f2(R * 0.11), fill: "none", stroke: "url(#gold)", "stroke-width": 4 }, h);
    if (look.beard) el("path", { d: `M ${f2(xc - R * 0.52)} ${f2(cy + R * 0.42)} Q ${f2(xc - R * 0.6)} ${f2(cy + R * 1.3)} ${f2(xc)} ${f2(cy + R * 1.5)} Q ${f2(xc + R * 0.48)} ${f2(cy + R * 1.25)} ${f2(xc + R * 0.44)} ${f2(cy + R * 0.4)} Q ${f2(xc + R * 0.1)} ${f2(cy + R * 0.92)} ${f2(xc - R * 0.52)} ${f2(cy + R * 0.42)} Z`, fill: look.beard, ...OUT }, h);
    drawHeadwear(S, h, look.headwear, cx, cy, R);
  }

  function drawHeadwear(S, h, type, cx, cy, R) {
    switch (type) {
      case "nonla":
        el("path", { d: `M ${f2(cx - R * 1.9)} ${f2(cy - R * 0.35)} L ${f2(cx + R * 0.1)} ${f2(cy - R * 1.75)} L ${f2(cx + R * 2.0)} ${f2(cy - R * 0.35)} Q ${f2(cx)} ${f2(cy - R * 0.15)} ${f2(cx - R * 1.9)} ${f2(cy - R * 0.35)} Z`, fill: S.mat("#e9cf8f", true), ...OUT }, h);
        for (let i = 1; i < 4; i++) el("path", { d: `M ${f2(cx - R * 1.9 * (1 - i * 0.22))} ${f2(cy - R * (0.35 + i * 0.33))} L ${f2(cx + R * 2.0 * (1 - i * 0.22))} ${f2(cy - R * (0.35 + i * 0.33))}`, stroke: "#b8995a", "stroke-width": 2.5 }, h);
        break;
      case "helmet":
        el("path", { d: `M ${f2(cx - R * 1.1)} ${f2(cy - R * 0.1)} Q ${f2(cx - R * 1.2)} ${f2(cy - R * 1.45)} ${f2(cx + R * 0.05)} ${f2(cy - R * 1.5)} Q ${f2(cx + R * 1.15)} ${f2(cy - R * 1.45)} ${f2(cx + R * 1.1)} ${f2(cy - R * 0.3)} L ${f2(cx + R * 0.65)} ${f2(cy - R * 0.55)} Q ${f2(cx)} ${f2(cy - R * 0.85)} ${f2(cx - R * 0.6)} ${f2(cy - R * 0.6)} L ${f2(cx - R * 0.75)} ${f2(cy + R * 0.38)} Q ${f2(cx - R * 1.05)} ${f2(cy + R * 0.35)} ${f2(cx - R * 1.1)} ${f2(cy - R * 0.1)} Z`, fill: "url(#iron)", ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.05)} ${f2(cy - R * 1.48)} Q ${f2(cx - R * 0.65)} ${f2(cy - R * 2.85)} ${f2(cx - R * 2.3)} ${f2(cy - R * 2.8)} Q ${f2(cx - R * 1.3)} ${f2(cy - R * 2.2)} ${f2(cx - R * 1.15)} ${f2(cy - R * 1.5)} Z`, fill: "url(#cape)", ...OUT }, h);
        el("circle", { cx: f2(cx), cy: f2(cy - R * 1.45), r: f2(R * 0.22), fill: "url(#gold)", ...OUT }, h);
        break;
      case "enemy_helmet":
        el("path", { d: `M ${f2(cx - R * 1.1)} ${f2(cy)} Q ${f2(cx - R * 1.0)} ${f2(cy - R * 1.3)} ${f2(cx + R * 0.1)} ${f2(cy - R * 2.0)} Q ${f2(cx + R * 1.0)} ${f2(cy - R * 1.3)} ${f2(cx + R * 1.05)} ${f2(cy - R * 0.35)} Q ${f2(cx)} ${f2(cy - R * 0.75)} ${f2(cx - R * 0.65)} ${f2(cy - R * 0.4)} L ${f2(cx - R * 0.8)} ${f2(cy + R * 0.5)} Z`, fill: S.mat("#3a2a2a", true), ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.6)} ${f2(cy - R * 1.2)} L ${f2(cx + R * 0.6)} ${f2(cy - R * 1.2)}`, stroke: "#c9a04a", "stroke-width": 5 }, h);
        break;
      case "feather": {
        // Feather headdress of the Hùng kings, as on the Đông Sơn bronze drums.
        el("path", { d: `M ${f2(cx - R * 1.0)} ${f2(cy - R * 0.45)} Q ${f2(cx)} ${f2(cy - R * 0.95)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.5)} L ${f2(cx + R * 0.9)} ${f2(cy - R * 0.25)} Q ${f2(cx)} ${f2(cy - R * 0.7)} ${f2(cx - R * 0.98)} ${f2(cy - R * 0.2)} Z`, fill: "url(#gold)", ...OUT }, h);
        for (let i = 0; i < 7; i++) {
          const a = -70 + i * 22, bx = cx - R * 0.7 + i * R * 0.25, by = cy - R * 0.75;
          el("path", { d: `M ${f2(bx)} ${f2(by)} q ${f2(-R * 0.25)} ${f2(-R * 0.9)} ${f2(R * 0.05)} ${f2(-R * 1.9)} q ${f2(R * 0.28)} ${f2(R * 0.9)} ${f2(-R * 0.05)} ${f2(R * 1.9)} Z`, fill: i % 2 ? "#f2e6c8" : "#c0392b", ...OUT, "stroke-width": 3, transform: `rotate(${f2(a * 0.4)} ${f2(bx)} ${f2(by)})` }, h);
        }
        break;
      }
      case "feather_band": {
        // A headband with a few upright feathers: the Lạc lords and warriors of the bronze drums.
        el("path", { d: `M ${f2(cx - R * 0.98)} ${f2(cy - R * 0.32)} Q ${f2(cx)} ${f2(cy - R * 0.78)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.4)} L ${f2(cx + R * 0.92)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 0.58)} ${f2(cx - R * 0.96)} ${f2(cy - R * 0.1)} Z`, fill: S.mat("#8a5a2a", true), ...OUT }, h);
        for (let i = 0; i < 3; i++) {
          const bx = cx - R * 0.55 + i * R * 0.3, by = cy - R * 0.62 - i * 2;
          el("path", { d: `M ${f2(bx)} ${f2(by)} q ${f2(-R * 0.2)} ${f2(-R * 0.7)} ${f2(-R * 0.05)} ${f2(-R * 1.5)} q ${f2(R * 0.26)} ${f2(R * 0.7)} ${f2(R * 0.05)} ${f2(R * 1.5)} Z`, fill: i === 1 ? "#c0392b" : "#f2e6c8", ...OUT, "stroke-width": 3, transform: `rotate(${f2(-18 + i * 6)} ${f2(bx)} ${f2(by)})` }, h);
        }
        break;
      }
      case "crown":
        el("path", { d: `M ${f2(cx - R * 0.9)} ${f2(cy - R * 0.7)} L ${f2(cx - R * 0.8)} ${f2(cy - R * 1.5)} L ${f2(cx - R * 0.35)} ${f2(cy - R * 1.1)} L ${f2(cx)} ${f2(cy - R * 1.65)} L ${f2(cx + R * 0.35)} ${f2(cy - R * 1.1)} L ${f2(cx + R * 0.8)} ${f2(cy - R * 1.5)} L ${f2(cx + R * 0.9)} ${f2(cy - R * 0.7)} Z`, fill: "url(#gold)", ...OUT }, h);
        break;
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
    tr(P.head, 4, -T, p.headTilt || 0);
    for (const k of ["legF", "legB"]) {
      const a = p[k] || [0, 0];
      tr(P[k].hip, k === "legF" ? 7 : -7, 0, -a[0]);
      tr(P[k].knee, 0, B.thigh, -a[1]);
    }
    for (const k of ["armF", "armB"]) {
      const a = p[k] || [0, 0];
      tr(P[k].sh, k === "armF" ? 10 : -6, -T + 14, -a[0]);
      tr(P[k].elbow, 0, B.upper, -a[1]);
    }
    P.legB.hip.setAttribute("opacity", p.hideBackLeg ? 0 : 1);
    // A hand raised above the shoulder passes behind the (turned) head, never across the face.
    const behind = p.armsBehindHead || (p.armF?.[0] ?? 0) - (p.lean || 0) > 115;
    if (behind) { if (P.armF.sh.nextSibling !== P.head) P.torso.insertBefore(P.armF.sh, P.head); }
    else if (P.armF.sh.nextSibling === P.head) P.torso.insertBefore(P.armF.sh, P.head.nextSibling);
    WA.face.apply(P.face, p.face || "neutral", t, p.talk || 0, p.viseme);
    const shown = p.prop !== undefined ? p.prop : P.activeProp;
    for (const k in P.props) P.props[k].setAttribute("opacity", k === shown ? 1 : 0);
    if (P.tuft) tr(P.tuft, 0, 0, p.tuft || 0);
    if (P.skirt) {
      const L = P.skirtLen, w = B.torsoW, a = ((p.legF?.[0] || 0) - (p.legB?.[0] || 0)) * 0.6, sw = Math.sin(t * 3) * 3;
      P.skirt.setAttribute("d", `M ${f2(-w / 2 + 2)} -6 L ${f2(w / 2 + 2)} -6 L ${f2(w * 0.6 + a + sw)} ${f2(L)} Q 0 ${f2(L + 14)} ${f2(-w * 0.62 - Math.abs(a) * 0.3 + sw)} ${f2(L)} Z`);
      P.skirtFolds?.setAttribute("d", `M ${f2(-w * 0.15)} 4 Q ${f2(-w * 0.2 + sw * 0.5)} ${f2(L * 0.5)} ${f2(-w * 0.28 + sw)} ${f2(L - 6)} M ${f2(w * 0.2)} 4 Q ${f2(w * 0.26 + a * 0.4 + sw * 0.5)} ${f2(L * 0.5)} ${f2(w * 0.32 + a * 0.6 + sw)} ${f2(L - 6)}`);
      if (P.hem) P.hem.setAttribute("d", `M ${f2(-w * 0.62 - Math.abs(a) * 0.3 + sw)} ${f2(L - 8)} Q 0 ${f2(L + 6)} ${f2(w * 0.6 + a + sw)} ${f2(L - 8)}`);
    }
    if (P.cape) {
      const w = p.capeWave || 0, fl = Math.sin(t * 13) * w, fl2 = Math.sin(t * 9 + 1) * w;
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
    const top = hipY - (T + B.headR * (B.round ? 2 : 2.35)) * s - (P.look.headwear === "helmet" || P.look.headwear === "feather" ? B.headR * 1.3 * s : 0);
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

  WA.human = { build, apply, points, limb, prop, BODIES };
})();
