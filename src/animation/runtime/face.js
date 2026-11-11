/*
 * Faces in three-quarter view (the head turned towards the camera, the body in profile), as
 * in hand-drawn TV cartoons: both eyes show, the near one larger; a nose, cheeks, one ear.
 * Every character gets its own face from parts (look.face):
 *   shape  round | oval | square | jowl         nose  button | round | long
 *   eyes   round | almond | narrow | droopy      brows thin | thick | bushy
 *   wrinkles (elders), mustache none | thin | thick | droopy, iris colour
 * Expressions move the parts: brows (lift, tilt), upper lids (lid, lidTilt), lower lids
 * (squint), pupils (size, look), the mouth (shape, open, smile, teeth) and cartoon marks
 * (sweat, tears, blush, vein). Names below; numbers blend between frames.
 */
(function () {
  const { el, g, tr, f2, clamp, lerp, shade, INK, OUT, rand } = WA.core;

  const EXPRESSIONS = {
    neutral: { lid: 0.12, squint: 0, lift: 0, tilt: 0, smile: 0.25, open: 0, mouth: "line" },
    happy: { lid: 0.02, squint: 0.5, lift: 0.5, tilt: -0.3, smile: 1.35, open: 0.55, teeth: true, blush: 0.75, look: [0.35, -0.1] },
    joy: { closed: "happy", lift: 0.6, tilt: -0.3, smile: 1.45, open: 0.65, teeth: true, blush: 0.9 },
    laugh: { closed: "happy", lift: 0.5, tilt: -0.2, smile: 1, open: 0.8, teeth: true, tongue: true, blush: 0.7 },
    sad: { lid: 0.42, lidTilt: -0.9, squint: 0.1, lift: 0.5, tilt: -1.1, smile: -0.9, open: 0, look: [0.1, 0.6] },
    worried: { lid: 0.08, lidTilt: -0.5, lift: 0.8, tilt: -1, smile: -0.45, open: 0.2, sweat: 1 },
    scared: { lid: 0, pupil: 0.55, lift: 0.85, tilt: -0.8, smile: -0.5, open: 0.45, teeth: true, sweat: 1 },
    angry: { lid: 0.32, lidTilt: 1, lift: -0.6, tilt: 1.2, smile: -0.7, open: 0.35, teeth: true, vein: 1, pupil: 0.85 },
    determined: { lid: 0.25, lidTilt: 0.6, lift: -0.3, tilt: 0.9, smile: 0.15, open: 0 },
    surprised: { lid: 0, pupil: 0.55, lift: 1.3, tilt: -0.1, smile: 0, open: 0.9, mouth: "o" },
    shout: { lid: 0.12, lidTilt: 0.7, lift: -0.45, tilt: 1.1, smile: -0.2, open: 1.1, teeth: true, tongue: true },
    yawn: { closed: "tight", lift: 0.5, tilt: -0.3, smile: 0, open: 1, mouth: "o", tears: 0.4 },
    sleepy: { lid: 0.65, lift: 0, tilt: -0.2, smile: 0.1, open: 0 },
    proud: { lid: 0.35, squint: 0.2, lift: 0.25, tilt: 0.25, smile: 0.6, open: 0, look: [0.4, -0.3] },
    crying: { closed: "tight", lift: 0.5, tilt: -0.9, smile: -0.9, open: 0.6, teeth: true, tears: 1, blush: 0.5 },
  };

  /** Where the features sit, by head shape (fractions of the head radius R). */
  const SHAPES = {
    round: { rx: 1, ry: 1, jaw: 0.95, chin: 0.25 },
    oval: { rx: 0.9, ry: 1.08, jaw: 0.78, chin: 0.3 },
    square: { rx: 0.95, ry: 1.05, jaw: 0.95, chin: 0.32 },
    jowl: { rx: 1.0, ry: 1.0, jaw: 1.12, chin: 0.28 },
  };
  const EYE_SHAPES = { round: [1, 1.15], almond: [1.15, 0.85], narrow: [1.15, 0.66], droopy: [1.05, 0.9] };

  /** The head outline, three-quarter view facing right: the chin is towards the face side. */
  function headPath(cx, cy, R, s) {
    const rx = R * s.rx, ry = R * s.ry, jaw = R * s.jaw, chinX = cx + R * s.chin;
    return [
      `M ${f2(cx - rx)} ${f2(cy)}`,
      `C ${f2(cx - rx)} ${f2(cy - ry * 0.72)} ${f2(cx - rx * 0.55)} ${f2(cy - ry)} ${f2(cx + rx * 0.05)} ${f2(cy - ry)}`,
      `C ${f2(cx + rx * 0.7)} ${f2(cy - ry)} ${f2(cx + rx * 1.02)} ${f2(cy - ry * 0.6)} ${f2(cx + rx * 1.0)} ${f2(cy - ry * 0.05)}`,
      `C ${f2(cx + rx * 0.99)} ${f2(cy + ry * 0.45)} ${f2(chinX + jaw * 0.35)} ${f2(cy + ry * 0.95)} ${f2(chinX)} ${f2(cy + ry)}`,
      `C ${f2(chinX - jaw * 0.6)} ${f2(cy + ry * 1.02)} ${f2(cx - jaw * 0.85)} ${f2(cy + ry * 0.75)} ${f2(cx - rx * 0.97)} ${f2(cy + ry * 0.3)} Z`,
    ].join(" ");
  }

  /** The head seen from the front (presenters talking to the viewer): the same shape, symmetric. */
  function headPathFront(cx, cy, R, s) {
    const rx = R * s.rx, ry = R * s.ry, jaw = R * Math.min(s.jaw, 0.95) * 0.62;
    return [
      `M ${f2(cx - rx)} ${f2(cy)}`,
      `C ${f2(cx - rx)} ${f2(cy - ry * 0.75)} ${f2(cx - rx * 0.55)} ${f2(cy - ry)} ${f2(cx)} ${f2(cy - ry)}`,
      `C ${f2(cx + rx * 0.55)} ${f2(cy - ry)} ${f2(cx + rx)} ${f2(cy - ry * 0.75)} ${f2(cx + rx)} ${f2(cy)}`,
      `C ${f2(cx + rx)} ${f2(cy + ry * 0.5)} ${f2(cx + jaw)} ${f2(cy + ry * 0.98)} ${f2(cx)} ${f2(cy + ry)}`,
      `C ${f2(cx - jaw)} ${f2(cy + ry * 0.98)} ${f2(cx - rx)} ${f2(cy + ry * 0.5)} ${f2(cx - rx)} ${f2(cy)} Z`,
    ].join(" ");
  }

  /**
   * Build the face on a head group. o: { cx, cy, R, skin, face: look.face, child, beard,
   * hairColor } in head units. Returns the face handle for apply().
   */
  function build(S, head, o, seed = 1) {
    const fc = o.face || {}, shape = SHAPES[fc.shape || (o.child ? "round" : "oval")] || SHAPES.oval;
    const { cx, cy, R } = o;
    const F = { o, shape, seed, eyes: [], brows: [], front: !!o.front };
    // Ears (the far one of the turned head; both, seen from the front) and the head itself.
    for (const side of o.front ? [-1, 1] : [-1]) {
      const ex = o.front ? cx + side * R * shape.rx * 0.92 : cx - R * 0.78, k = side;
      el("path", { d: `M ${f2(ex)} ${f2(cy - R * 0.12)} C ${f2(ex + k * R * 0.3)} ${f2(cy - R * 0.28)} ${f2(ex + k * R * 0.36)} ${f2(cy + R * 0.32)} ${f2(ex - k * R * 0.02)} ${f2(cy + R * 0.38)} Z`, fill: S.mat(shade(o.skin, -0.06)), ...OUT }, head);
      el("path", { d: `M ${f2(ex + k * R * 0.06)} ${f2(cy - R * 0.04)} q ${f2(k * R * 0.12)} ${f2(R * 0.12)} ${f2(-k * R * 0.02)} ${f2(R * 0.28)}`, stroke: shade(o.skin, -0.3), "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, head);
    }
    F.head = el("path", { d: o.front ? headPathFront(cx, cy, R, shape) : headPath(cx, cy, R, shape), fill: S.mat(o.skin), ...OUT }, head);
    // Cel shadow: a hard-edged band down the side of the head away from the light, cut to the
    // head's outline (so it follows its form, not a straight line). The player turns it to the
    // face side when the light comes from behind (setLight). Not in flat prints.
    F.headId = S.id("hd");
    F.head.setAttribute("id", F.headId);
    F.clip = S.id("hc");
    S.addDefs(`<clipPath id="${F.clip}"><use href="#${F.headId}"/></clipPath>`);
    if (!S.flat && !o.front) {
      F.form = el("ellipse", { cx: f2(cx - R * 1.32), cy: f2(cy + R * 0.08), rx: f2(R * 0.78), ry: f2(R * 1.3), fill: shade(o.skin, -0.3), opacity: 0.42, "clip-path": `url(#${F.clip})` }, head);
      F.formX = [cx - R * 1.32, cx + R * 1.5];
    }
    // Rounded light on the cheek turned to the light, shadow under the jaw.
    if (!o.front) el("ellipse", { cx: f2(cx + R * 0.55), cy: f2(cy + R * 0.05), rx: f2(R * 0.3), ry: f2(R * 0.4), fill: "#ffffff", opacity: 0.12 }, head);

    const xc = o.front ? cx : cx + R * 0.28; // the face's centre line, turned towards +x (or in the middle)
    const eR = R * (o.child ? 0.21 : 0.18) * (fc.eyeScale || 1);
    const [ew, eh] = EYE_SHAPES[fc.eyes || (o.child ? "round" : "almond")] || EYE_SHAPES.almond;
    const iris = fc.iris || "#3a2414";
    const eyesAt = o.front ? [[cx - R * 0.36, cy - R * 0.08, 1], [cx + R * 0.36, cy - R * 0.08, 1]] : [[xc - R * 0.34, cy - R * 0.08, 1], [xc + R * 0.32, cy - R * 0.1, 0.82]];
    eyesAt.forEach(([x, y, k], i) => {
      const rx = eR * ew * k * (i && !o.front ? 0.85 : 1), ry = eR * eh * k;
      const eg = g(head, { transform: `translate(${f2(x)},${f2(y)})` });
      const clip = S.id("eye");
      S.addDefs(`<clipPath id="${clip}"><ellipse rx="${f2(rx)}" ry="${f2(ry)}"/></clipPath>`);
      const open = g(eg);
      el("ellipse", { rx: f2(rx), ry: f2(ry), fill: "#fffdf6" }, open);
      const inner = g(open, { "clip-path": `url(#${clip})` });
      const pupil = g(inner);
      el("circle", { r: f2(ry * 0.72), fill: iris }, pupil);
      const dot = el("circle", { r: f2(ry * 0.38), fill: "#120a05" }, pupil);
      el("circle", { cx: f2(ry * 0.24), cy: f2(-ry * 0.28), r: f2(ry * 0.2), fill: "#fff" }, pupil);
      el("circle", { cx: f2(-ry * 0.2), cy: f2(ry * 0.22), r: f2(ry * 0.09), fill: "#fff", opacity: 0.8 }, pupil);
      const upper = el("path", { fill: S.mat(shade(o.skin, -0.04)) }, inner);
      const lower = el("path", { fill: S.mat(shade(o.skin, -0.02)) }, inner);
      // A smiling cheek pushes the lower lid up: the line follows the lid, and the outline
      // under it is hidden (else the eye reads as a ring with the iris rolled up).
      const lowerLine = el("path", { fill: "none", stroke: INK, "stroke-width": 5, "stroke-linecap": "round" }, inner);
      const oClip = S.id("eyeo");
      const outlineClip = el("path", {}, el("clipPath", { id: oClip }, S.defs));
      el("ellipse", { rx: f2(rx), ry: f2(ry), fill: "none", stroke: INK, "stroke-width": 2.5, "clip-path": `url(#${oClip})` }, open);
      const lash = el("path", { fill: "none", stroke: INK, "stroke-width": o.female ? 4.5 : 3.5, "stroke-linecap": "round" }, open);
      const closedArc = el("path", { fill: "none", stroke: INK, "stroke-width": 4, "stroke-linecap": "round" }, eg);
      F.eyes.push({ eg, open, pupil, dot, upper, lower, lowerLine, outlineClip, lash, closedArc, x, y, rx, ry, droopy: fc.eyes === "droopy" });
      const bw = { thin: 4, thick: 7.5, bushy: 10.5 }[fc.brows || (o.child ? "thin" : "thick")] || 6;
      // A brow is a tapered shape: full at the inner end (towards the nose), fine at the tail.
      const brow = el("path", { fill: o.browColor || o.hairColor || INK, stroke: shade(o.browColor || o.hairColor || INK, -0.3), "stroke-width": 0.8, "stroke-linejoin": "round" }, head);
      brow.bw = bw * (i && !o.front ? 0.85 : 1); brow.inner = i ? -1 : 1;   // the inner end is towards the face's centre line
      F.brows.push(brow);
    });
    // Nose, on the centre line, pointing to the side the head is turned to.
    const nose = fc.nose || (o.child ? "button" : "round"), nx = o.front ? cx : xc + R * 0.12, ny = cy + R * 0.2, nc = shade(o.skin, -0.28);
    // One line in the cartoon manner: down the bridge (on the side turned away from the light),
    // round the tip, back into a small nostril curl. A soft shadow sits under the tip.
    const bridge = { button: 0.08, round: 0.17, long: 0.24 }[nose] ?? 0.18, tip = { button: 0.1, round: 0.15, long: 0.14 }[nose] ?? 0.15;
    el("ellipse", { cx: f2(nx + (o.front ? 0 : R * 0.02)), cy: f2(ny + R * 0.13), rx: f2(R * tip * 0.95), ry: f2(R * 0.045), fill: shade(o.skin, -0.18), opacity: 0.45 }, head);
    // From the front: the tip as a small curve between two nostril dots, a hint of the bridge.
    if (o.front) {
      const tw = R * tip * 0.9;
      el("path", { d: `M ${f2(nx - tw)} ${f2(ny + R * 0.06)} Q ${f2(nx)} ${f2(ny + R * 0.15)} ${f2(nx + tw)} ${f2(ny + R * 0.06)}`, stroke: nc, "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, head);
      el("path", { d: `M ${f2(nx - R * 0.03)} ${f2(ny - R * bridge * 0.8)} q ${f2(-R * 0.025)} ${f2(R * bridge * 0.5)} ${f2(-R * 0.01)} ${f2(R * bridge * 0.75)}`, stroke: nc, "stroke-width": 2.2, fill: "none", "stroke-linecap": "round", opacity: 0.55 }, head);
    } else el("path", {
      d: `M ${f2(nx - R * 0.03)} ${f2(ny - R * bridge)} Q ${f2(nx + R * tip * 0.6)} ${f2(ny - R * 0.02)} ${f2(nx + R * tip)} ${f2(ny + R * 0.04)} Q ${f2(nx + R * tip * 1.05)} ${f2(ny + R * 0.12)} ${f2(nx + R * tip * 0.35)} ${f2(ny + R * 0.11)} q ${f2(-R * 0.05)} ${f2(-R * 0.005)} ${f2(-R * 0.06)} ${f2(-R * 0.05)}`,
      stroke: nc, "stroke-width": nose === "button" ? 3 : 3.2, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round",
    }, head);
    // Blush, wrinkles, mustache.
    F.blush = o.front ? [-1, 1].map((sd) => el("ellipse", { cx: f2(cx + sd * R * 0.52), cy: f2(cy + R * 0.3), rx: f2(R * 0.15), ry: f2(R * 0.085), fill: "#f07a6a", opacity: 0 }, head)) : [
      el("ellipse", { cx: f2(xc - R * 0.48), cy: f2(cy + R * 0.3), rx: f2(R * 0.17), ry: f2(R * 0.09), fill: "#f07a6a", opacity: 0 }, head),
      el("ellipse", { cx: f2(xc + R * 0.42), cy: f2(cy + R * 0.28), rx: f2(R * 0.11), ry: f2(R * 0.07), fill: "#f07a6a", opacity: 0 }, head),
    ];
    if (fc.wrinkles) {
      const wc = shade(o.skin, -0.3);
      for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(xc - R * 0.55)} ${f2(cy - R * (0.6 + i * 0.12))} q ${f2(R * 0.4)} ${f2(-R * 0.06)} ${f2(R * 0.8)} 0`, stroke: wc, "stroke-width": 2, fill: "none", opacity: 0.6 }, head);
      el("path", { d: `M ${f2(xc - R * 0.62)} ${f2(cy - R * 0.02)} l ${f2(-R * 0.08)} ${f2(-R * 0.04)} M ${f2(xc - R * 0.62)} ${f2(cy + R * 0.04)} l ${f2(-R * 0.09)} ${f2(R * 0.02)}`, stroke: wc, "stroke-width": 2, opacity: 0.7 }, head);
      el("path", { d: `M ${f2(xc - R * 0.28)} ${f2(cy + R * 0.42)} q ${f2(-R * 0.06)} ${f2(R * 0.14)} ${f2(R * 0.02)} ${f2(R * 0.24)}`, stroke: wc, "stroke-width": 2, fill: "none", opacity: 0.6 }, head);
    }
    // Mouth: a path redrawn each frame; teeth and tongue are clipped to it.
    const mClip = S.id("mouth");
    F.mouthClip = el("path", {}, el("clipPath", { id: mClip }, S.defs));
    F.mouth = el("path", { fill: "#6a1e18", ...OUT, "stroke-width": 3 }, head);
    const inner = g(head, { "clip-path": `url(#${mClip})` });
    F.teeth = el("rect", { fill: "#fffdf4" }, inner);
    F.tongue = el("ellipse", { fill: "#e0675a" }, inner);
    F.mouthLine = el("path", { fill: "none", stroke: INK, "stroke-width": 3, "stroke-linecap": "round" }, head);
    // Smile creases beside the mouth corners, shown on big smiles.
    F.creases = [0, 1].map(() => el("path", { fill: "none", stroke: shade(o.skin, -0.35), "stroke-width": 2.5, "stroke-linecap": "round", opacity: 0 }, head));
    F.mouthAt = [o.front ? cx : xc + R * 0.02, cy + R * 0.55];
    F.mouthW = R * (o.child ? 0.48 : 0.46);
    if (fc.mustache && fc.mustache !== "none") {
      const mw = { thin: 0.1, thick: 0.16, droopy: 0.14 }[fc.mustache] || 0.12, [mx, my] = F.mouthAt, hc = o.hairColor || INK;
      for (const s of [-1, 1]) el("path", { d: `M ${f2(mx)} ${f2(my - R * 0.12)} q ${f2(s * R * 0.2)} ${f2(-R * 0.06)} ${f2(s * R * 0.32)} ${f2(fc.mustache === "droopy" ? R * 0.22 : R * 0.04)} q ${f2(-s * R * 0.14)} ${f2(-R * mw)} ${f2(-s * R * 0.32)} ${f2(-R * 0.02)} Z`, fill: hc, ...OUT, "stroke-width": 2 }, head);
    }
    // Cartoon marks.
    F.sweat = el("path", { d: `M ${f2(cx + R * 0.9)} ${f2(cy - R * 0.55)} q ${f2(R * 0.12)} ${f2(R * 0.2)} 0 ${f2(R * 0.28)} q ${f2(-R * 0.12)} ${f2(-R * 0.08)} 0 ${f2(-R * 0.28)} Z`, fill: "#bfe6ff", stroke: "#4a8ab8", "stroke-width": 2.5, opacity: 0 }, head);
    F.tears = F.eyes.map((e) => el("path", { fill: "#a8dcff", opacity: 0, stroke: "#4a8ab8", "stroke-width": 1.5 }, head));
    F.vein = el("path", { d: `M ${f2(cx - R * 0.45)} ${f2(cy - R * 0.85)} l ${f2(R * 0.1)} ${f2(R * 0.1)} m ${f2(-R * 0.1)} 0 l ${f2(R * 0.1)} ${f2(-R * 0.1)} m ${f2(R * 0.05)} ${f2(R * 0.05)} l ${f2(R * 0.12)} 0 m ${f2(-R * 0.06)} ${f2(-R * 0.06)} l 0 ${f2(R * 0.12)}`, stroke: "#d0302a", "stroke-width": 4, "stroke-linecap": "round", opacity: 0 }, head);
    return F;
  }

  /** Natural blinking every 2.5–4.5 s, 0.12 s long, at times fixed by the seed. */
  function blinkAt(seed, t) {
    const r = rand(seed);
    let at = 0.6 + r() * 1.5;
    while (at < t + 0.2) {
      if (Math.abs(t - at) < 0.06) return 1;
      at += 2.5 + r() * 2;
    }
    return 0;
  }

  /**
   * e: an expression name or numbers merged over neutral. talk: 0–1 speaking; viseme: an
   * optional mouth shape for lip-sync ("a" | "o" | "u" | "i" | "m", see lipsync).
   */
  function apply(F, e, t, talk = 0, viseme) {
    const x = typeof e === "string" ? EXPRESSIONS[e] || EXPRESSIONS.neutral : { ...EXPRESSIONS.neutral, ...(e || {}) };
    const blink = x.noBlink ? 0 : blinkAt(F.seed, t);
    F.eyes.forEach((eye, i) => {
      const { rx, ry } = eye;
      const closed = x.closed || (blink ? "blink" : null);
      eye.open.setAttribute("opacity", closed ? 0 : 1);
      if (closed) {
        // ^ ^ when laughing; a tight line when squeezing; a soft line when blinking.
        const d = closed === "happy" ? `M ${f2(-rx)} ${f2(ry * 0.2)} Q 0 ${f2(-ry * 1.1)} ${f2(rx)} ${f2(ry * 0.2)}` : closed === "tight" ? `M ${f2(-rx)} ${f2(-ry * 0.2)} L 0 ${f2(ry * 0.2)} L ${f2(rx)} ${f2(-ry * 0.2)}` : `M ${f2(-rx)} 0 Q 0 ${f2(ry * 0.45)} ${f2(rx)} 0`;
        eye.closedArc.setAttribute("d", d);
        eye.closedArc.setAttribute("opacity", 1);
      } else eye.closedArc.setAttribute("opacity", 0);
      const lid = clamp((x.lid ?? 0.12) + (eye.droopy ? 0.1 * (1 - clamp((x.smile ?? 0) - 0.5)) * (1 - clamp(x.lift || 0)) : 0)), lt = (x.lidTilt || 0) * 0.5;
      // The upper lid comes down to lidY; tilt lowers the inner (+x) or outer corner.
      const ly = -ry + 2 * ry * lid, inner = ly + lt * ry, outer = ly - lt * ry;
      eye.upper.setAttribute("d", `M ${f2(-rx * 1.2)} ${f2(-ry * 1.3)} L ${f2(rx * 1.2)} ${f2(-ry * 1.3)} L ${f2(rx * 1.2)} ${f2(inner)} Q 0 ${f2(ly - ry * 0.12)} ${f2(-rx * 1.2)} ${f2(outer)} Z`);
      eye.lash.setAttribute("d", `M ${f2(-rx * 1.05)} ${f2(outer + ry * 0.05)} Q 0 ${f2(ly - ry * 0.16)} ${f2(rx * 1.05)} ${f2(inner + ry * 0.05)}`);
      const sq = clamp(x.squint || 0), lo = ry - 2 * ry * sq * 0.6, lc = lo + ry * 0.2 - sq * ry * 0.9;
      eye.lower.setAttribute("d", `M ${f2(-rx * 1.2)} ${f2(ry * 1.3)} L ${f2(rx * 1.2)} ${f2(ry * 1.3)} L ${f2(rx * 1.2)} ${f2(lo)} Q 0 ${f2(lc)} ${f2(-rx * 1.2)} ${f2(lo)} Z`);
      eye.lowerLine.setAttribute("d", `M ${f2(-rx * 1.2)} ${f2(lo)} Q 0 ${f2(lc)} ${f2(rx * 1.2)} ${f2(lo)}`);
      eye.lowerLine.setAttribute("opacity", sq > 0.15 ? 1 : 0);
      eye.outlineClip.setAttribute("d", sq > 0.15
        ? `M ${f2(-rx * 2)} ${f2(-ry * 2)} L ${f2(rx * 2)} ${f2(-ry * 2)} L ${f2(rx * 2)} ${f2(lo)} L ${f2(rx * 1.2)} ${f2(lo)} Q 0 ${f2(lc)} ${f2(-rx * 1.2)} ${f2(lo)} L ${f2(-rx * 2)} ${f2(lo)} Z`
        : `M ${f2(-rx * 2)} ${f2(-ry * 2)} H ${f2(rx * 2)} V ${f2(ry * 2)} H ${f2(-rx * 2)} Z`);
      const look = x.gaze || x.look || (F.front ? [0, 0.05] : [0.35, 0]);
      tr(eye.pupil, look[0] * rx * 0.35, look[1] * ry * 0.35, 0, x.pupil ?? 1);
      // Brows: lift up/down; tilt 1 = angry (inner end down), -1 = sad (inner end up).
      // Cartoon brows move a lot: that is most of the acting.
      let by = eye.y - Math.max(ry, rx * 0.8) * 1.55 - (x.lift || 0) * ry * 1.15;
      // (from the front the two brows tilt as mirror images)
      // (from the front the brows are wider apart and both full size: a gentler slope reads the same)
      const a = (x.tilt || 0) * ry * 0.95 * (F.front ? (i ? -0.55 : 0.55) : 1);
      const bx0 = eye.x - rx * 1.15, bx1 = eye.x + rx * 1.15;
      const br = F.brows[i];
      // (raised brows stay under the fringe: they never climb onto the hair)
      if (F.o.browTop !== undefined) by = Math.max(by, F.o.browTop + Math.abs(a) + br.bw * 0.6);
      const my = by - ry * 0.4 - Math.max(0, x.lift || 0) * ry * 0.25;
      const tIn = br.bw, tOut = br.bw * 0.3, t0 = br.inner > 0 ? tOut : tIn, t1 = br.inner > 0 ? tIn : tOut, tm = (t0 + t1) / 2;
      br.setAttribute("d", `M ${f2(bx0)} ${f2(by - a - t0 * 0.3)} Q ${f2(eye.x)} ${f2(my - tm * 0.55)} ${f2(bx1)} ${f2(by + a - t1 * 0.5)} Q ${f2(bx1 + t1 * 0.35)} ${f2(by + a)} ${f2(bx1)} ${f2(by + a + t1 * 0.5)} Q ${f2(eye.x)} ${f2(my + tm * 0.55)} ${f2(bx0)} ${f2(by - a + t0 * 0.3)} Z`);
    });
    // Mouth: open, smile and shape, with lip-sync on top while talking.
    const flap = talk > 0 && !viseme ? talk * clamp(0.35 + 0.65 * Math.abs(Math.sin(t * 17) * Math.sin(t * 6.1 + 1))) : 0;
    let open = clamp(Math.max(x.open || 0, flap * 0.75)), smile = x.smile ?? 0.25, shape = x.mouth || "line";
    // With real speech the voice's loudness opens the mouth and the vowel shapes it.
    if (viseme) { const v = VISEMES[viseme]; if (v) { open = Math.max((x.open || 0) * 0.5, v.open * clamp(talk * 1.1)); if (v.shape && talk > 0.15) shape = v.shape; } }
    const [mx, my] = F.mouthAt, W0 = F.mouthW * (shape === "o" ? 0.7 : shape === "u" ? 0.45 : shape === "i" ? 1.1 : 1);
    const w = W0 * (1 - 0.1 * open) * (1 + 0.18 * Math.max(0, smile - 1)), corner = -smile * W0 * 0.24, depth = open * W0 * (shape === "o" ? 1.15 : 0.85);
    // Upper lip, then the lower one; the near side (-x) is wider than the far side.
    const L = mx - w * (F.front ? 0.5 : 0.58), Rr = mx + w * (F.front ? 0.5 : 0.42);
    const top = my + corner * 0.15 - open * W0 * 0.08 + smile * W0 * 0.08;
    const d = shape === "o" || shape === "u"
      ? `M ${f2(L)} ${f2(my)} Q ${f2(mx)} ${f2(my - depth * 0.5)} ${f2(Rr)} ${f2(my)} Q ${f2(mx)} ${f2(my + depth)} ${f2(L)} ${f2(my)} Z`
      : `M ${f2(L)} ${f2(my + corner)} Q ${f2(mx)} ${f2(top)} ${f2(Rr)} ${f2(my + corner)} Q ${f2(mx)} ${f2(my + corner + depth + smile * W0 * 0.25)} ${f2(L)} ${f2(my + corner)} Z`;
    const visible = open > 0.06;
    F.mouth.setAttribute("d", d);
    F.mouth.setAttribute("opacity", visible ? 1 : 0);
    F.mouthClip.setAttribute("d", d);
    F.mouthLine.setAttribute("opacity", visible ? 0 : 1);
    F.mouthLine.setAttribute("d", `M ${f2(L)} ${f2(my + corner)} Q ${f2(mx)} ${f2(my + smile * W0 * 0.3)} ${f2(Rr)} ${f2(my + corner)}`);
    const ck = clamp((smile - 0.8) * 2);
    F.creases.forEach((c, i) => {
      const s = i ? 1 : -1, cx0 = i ? Rr + W0 * 0.06 : L - W0 * 0.08, cy0 = my + corner - W0 * 0.14;
      c.setAttribute("opacity", f2(ck * 0.8));
      c.setAttribute("d", `M ${f2(cx0)} ${f2(cy0)} q ${f2(s * W0 * 0.1)} ${f2(W0 * 0.13)} 0 ${f2(W0 * 0.27)}`);
    });
    const teeth = visible && x.teeth;
    F.teeth.setAttribute("x", f2(L)); F.teeth.setAttribute("y", f2(Math.min(top, my + corner) - 2));
    F.teeth.setAttribute("width", f2(w)); F.teeth.setAttribute("height", f2(teeth ? W0 * 0.16 : 0));
    const tg = visible && (x.tongue || open > 0.5);
    F.tongue.setAttribute("cx", f2(mx)); F.tongue.setAttribute("cy", f2(my + corner + depth * 0.85));
    F.tongue.setAttribute("rx", f2(tg ? w * 0.3 : 0)); F.tongue.setAttribute("ry", f2(tg ? depth * 0.35 : 0));
    // Marks.
    F.blush.forEach((b) => b.setAttribute("opacity", f2(0.55 * (x.blush || 0) + (F.o.child ? 0.25 : 0))));
    F.sweat.setAttribute("opacity", f2(x.sweat ? 0.9 : 0));
    if (x.sweat) F.sweat.setAttribute("transform", `translate(0,${f2(((t * 40) % 30) - 5)})`);
    F.vein.setAttribute("opacity", f2(x.vein ? 0.9 * (0.7 + 0.3 * Math.sin(t * 8)) : 0));
    F.tears.forEach((tear, i) => {
      const e = F.eyes[i], k = x.tears || 0;
      tear.setAttribute("opacity", f2(k ? 0.85 : 0));
      if (k) { const len = e.ry * (1.5 + 2.5 * k) * (0.8 + 0.2 * Math.sin(t * 5 + i)); tear.setAttribute("d", `M ${f2(e.x - e.rx * 0.6)} ${f2(e.y + e.ry * 0.7)} q ${f2(-e.rx * 0.3)} ${f2(len * 0.5)} ${f2(-e.rx * 0.1)} ${f2(len)} q ${f2(e.rx * 0.3)} ${f2(-len * 0.3)} ${f2(e.rx * 0.35)} ${f2(-len)} Z`); }
    });
  }

  /** Mouth shapes for lip-sync, by the vowel being spoken. */
  const VISEMES = { a: { open: 0.85 }, o: { open: 0.7, shape: "o" }, u: { open: 0.45, shape: "u" }, i: { open: 0.35, shape: "i" }, e: { open: 0.55 }, m: { open: 0 } };

  WA.face = { build, apply, EXPRESSIONS, VISEMES, SHAPES };
})();
