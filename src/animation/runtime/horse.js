/*
 * Horses: an iron horse (armour plates, flaming mane and tail, glowing eyes) or an ordinary
 * one (coat colour, hair mane). Origin on the ground under the belly, facing right.
 *   look = { kind: "iron" | "plain", color, mane, saddle }
 * Gaits live in WA.motions (gallop, walk, rear, stand); this file draws and poses.
 */
(function () {
  const { el, g, tr, f2, shade, INK, OUT, clamp } = WA.core;
  const BODY_Y = -182;
  const NECK = [116, -42], HEAD = [52, -128], MOUTH = [100, 36], SEAT = [-8, -78];

  function build(S, parent, look = {}) {
    const iron = (look.kind || "iron") === "iron";
    const coat = look.color || (iron ? "#66727f" : "#8a5a32");
    const bodyFill = iron ? "url(#iron)" : S.mat(coat, true);
    const Hh = { root: g(parent), look, iron, legs: [] };
    Hh.body = g(Hh.root);
    const leg = (front, near) => {
      const hip = g(Hh.body), hex = near ? (iron ? "#6f7b89" : coat) : shade(iron ? "#6f7b89" : coat, -0.32);
      WA.human.limb(S, hip, front ? 74 : 82, front ? 36 : 44, hex);
      const knee = g(hip);
      WA.human.limb(S, knee, front ? 70 : 72, 24, hex);
      el("path", { d: "M -16 64 L 18 64 L 22 86 L -18 86 Z", fill: "#1f242b", ...OUT }, knee);
      if (iron) el("rect", { x: -15, y: 50, width: 30, height: 12, rx: 4, fill: "url(#gold)", ...OUT }, knee);
      const l = { hip, knee, front, near, x: front ? 102 : -112, y: front ? 18 : 10, L: front ? 74 : 82 };
      Hh.legs.push(l);
      return l;
    };
    leg(true, false); leg(false, false);
    Hh.tail = g(Hh.body);
    if (iron) for (let i = 0; i < 5; i++) el("path", { d: "M 0 0 C -40 -6 -90 10 -150 4 C -100 22 -50 24 -6 14 Z", fill: "url(#flame)", transform: `rotate(${-14 + i * 9}) scale(${1 - i * 0.1})` }, Hh.tail);
    else el("path", { d: "M 0 0 C -50 0 -90 30 -110 90 C -70 70 -40 40 -4 18 Z", fill: look.mane || "#3a2418", ...OUT }, Hh.tail);
    el("path", { d: "M -152 -6 C -162 -62 -112 -84 -60 -76 C 0 -66 60 -86 116 -66 C 160 -50 172 0 150 36 C 128 66 62 62 0 54 C -62 60 -124 62 -148 32 Z", fill: bodyFill, ...OUT }, Hh.body);
    if (iron) for (let i = 0; i < 6; i++) el("path", { d: `M ${-112 + i * 44} -66 q 16 40 0 104`, stroke: "#a7b3c3", "stroke-width": 4, fill: "none", opacity: 0.7 }, Hh.body);
    el("path", { d: "M -150 -10 C -150 -54 -110 -76 -60 -70", stroke: iron ? "#c3ccd8" : shade(coat, 0.35), "stroke-width": 6, fill: "none", opacity: 0.7, "stroke-linecap": "round" }, Hh.body);
    if (look.saddle !== false) {
      el("path", { d: "M -58 -72 Q -6 -92 48 -72 L 42 -22 Q -6 -8 -56 -24 Z", fill: S.mat(look.saddle || "#a3281d", true), ...OUT }, Hh.body);
      for (let i = 0; i < 5; i++) el("circle", { cx: -46 + i * 22, cy: -24 + Math.abs(i - 2) * 2, r: 4, fill: "url(#gold)", stroke: INK, "stroke-width": 1.5 }, Hh.body);
    }
    leg(true, true); leg(false, true);
    Hh.neck = g(Hh.body);
    el("path", { d: "M -40 34 C -32 -36 -6 -104 30 -140 C 58 -152 84 -134 80 -104 C 70 -60 58 -20 46 34 Z", fill: bodyFill, ...OUT }, Hh.neck);
    if (iron) for (let i = 0; i < 4; i++) el("path", { d: `M ${-26 + i * 14} ${10 - i * 34} q 32 4 56 -10`, stroke: "#a7b3c3", "stroke-width": 4, fill: "none", opacity: 0.7 }, Hh.neck);
    Hh.mane = g(Hh.neck);
    // The iron horse's mane is long flames; an ordinary horse's is short hair lying on the neck
    // (long locks read as wings).
    if (iron) for (let i = 0; i < 7; i++) el("path", { d: "M 0 0 C -32 -8 -58 -40 -70 -80 C -42 -58 -18 -44 8 -36 Z", fill: "url(#flame)", transform: `translate(${-22 + i * 7},${-120 + i * 20})` }, Hh.mane);
    else for (let i = 0; i < 9; i++) el("path", { d: "M 0 0 C -12 2 -24 -6 -30 -24 C -16 -18 -6 -16 8 -14 Z", fill: look.mane || "#3a2418", transform: `translate(${-14 + i * 5},${-126 + i * 15}) rotate(${-10 + i * 2})`, ...OUT, "stroke-width": 2.5 }, Hh.mane);
    Hh.head = g(Hh.neck);
    el("path", { d: "M -24 -12 C -4 -40 44 -36 96 2 C 118 18 116 42 94 48 C 64 52 22 34 -14 22 Z", fill: bodyFill, ...OUT }, Hh.head);
    el("path", { d: "M 20 30 Q 60 46 94 48", stroke: INK, "stroke-width": 3.5, fill: "none" }, Hh.head);
    el("path", { d: "M -10 -26 L 2 -66 L 20 -30 Z", fill: iron ? "#59616d" : shade(coat, -0.2), ...OUT }, Hh.head);
    if (iron) {
      el("circle", { cx: 30, cy: -10, r: 9, fill: "#ffb02e", stroke: INK, "stroke-width": 3 }, Hh.head);
      el("circle", { cx: 32, cy: -11, r: 4, fill: "#fff6c8" }, Hh.head);
      el("circle", { cx: 30, cy: -10, r: 26, fill: "url(#ember)", style: "mix-blend-mode: screen", opacity: 0.7 }, Hh.head);
    } else {
      el("ellipse", { cx: 30, cy: -10, rx: 7, ry: 8, fill: "#fffaf0", stroke: INK, "stroke-width": 2.5 }, Hh.head);
      el("circle", { cx: 32, cy: -9, r: 4.5, fill: INK }, Hh.head);
    }
    el("ellipse", { cx: 96, cy: 26, rx: 5, ry: 4, fill: INK }, Hh.head);
    // Far legs behind everything, near legs over the body, the neck on top.
    Hh.body.insertBefore(Hh.legs[1].hip, Hh.body.firstChild);
    Hh.body.insertBefore(Hh.legs[0].hip, Hh.body.firstChild);
    Hh.height = 400;
    return Hh;
  }

  /**
   * p: x, y, scale, facing, opacity, bob, pitch, legs [[upper, lower] × 4 in the order far
   * front, far hind, near front, near hind], neck, head, tail, maneFlow.
   */
  function apply(Hh, p, t) {
    const s = p.scale ?? 1, facing = p.facing ?? 1;
    tr(Hh.root, p.x, p.y ?? 0, 0, s * facing, s);
    Hh.root.setAttribute("opacity", f2(clamp(p.opacity ?? 1)));
    tr(Hh.body, 0, BODY_Y + (p.bob || 0), p.pitch || 0);
    Hh.legs.forEach((l, i) => {
      const a = p.legs?.[i] || [0, 0];
      tr(l.hip, l.x, l.y, -a[0]);
      tr(l.knee, 0, l.L, -a[1]);
    });
    tr(Hh.neck, NECK[0], NECK[1], p.neck || 0);
    tr(Hh.head, HEAD[0], HEAD[1], 10 + (p.head || 0));
    tr(Hh.tail, -146, -28, (p.tail || 0) + 6 * Math.sin(t * 8), 1 + 0.1 * Math.sin(t * 15), 1);
    if (Hh.iron) [...Hh.mane.children].forEach((m, i) => m.setAttribute("opacity", f2(0.7 + 0.3 * Math.sin(t * 18 + i * 1.9))));
    tr(Hh.mane, 0, 0, -8 * (p.maneFlow || 0), 1 + (Hh.iron ? 0.08 * Math.sin(t * 14) : 0), 1);
  }

  /** World points: the seat (rider's hips), the mouth (fire), hooves, head. */
  function points(Hh, p) {
    const s = p.scale ?? 1, f = p.facing ?? 1, pitch = ((p.pitch || 0) * Math.PI) / 180;
    const by = BODY_Y + (p.bob || 0);
    const rot = (x, y) => [x * Math.cos(pitch) - y * Math.sin(pitch), x * Math.sin(pitch) + y * Math.cos(pitch)];
    const world = (x, y) => { const [rx, ry] = rot(x, y); return [p.x + rx * s * f, (p.y ?? 0) + (by + ry) * s]; };
    const mouth = world(NECK[0] + HEAD[0] + MOUTH[0], NECK[1] + HEAD[1] + MOUTH[1]);
    return {
      seat: world(SEAT[0], SEAT[1]), mouth, mouthAngle: f > 0 ? pitch : Math.PI - pitch,
      head: world(NECK[0] + HEAD[0] + 40, NECK[1] + HEAD[1]), hooves: [[p.x - 112 * s * f, 0], [p.x + 102 * s * f, 0]],
      top: (p.y ?? 0) + (BODY_Y - 240) * s, height: 420 * s, feet: [p.x, p.y ?? 0],
      // Tail (a flame for the iron horse) to nose, ears to hooves.
      box: [Math.min(p.x - (Hh.iron ? 300 : 260) * s * f, p.x + 285 * s * f), (p.y ?? 0) + (BODY_Y + (p.bob || 0) - 250) * s, Math.max(p.x - (Hh.iron ? 300 : 260) * s * f, p.x + 285 * s * f), p.y ?? 0],
    };
  }

  WA.horse = { build, apply, points, BODY_Y };
})();
