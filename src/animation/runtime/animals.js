/*
 * Four-legged animals for fables and folk tales: one rig, shaped by the species.
 *   cast: { "type": "animal", "look": { "species": "buffalo", "color": "#4a4a52" } }
 *   species: buffalo (trâu) · tiger (hổ) · elephant (voi) · dog (chó) · cat (mèo) ·
 *            rabbit (thỏ) · fox (cáo) · turtle (rùa) · deer (hươu) · goat (dê) · mouse (chuột)
 * Birds, fish, frogs and ants have their own rig (critters.js).
 * The pose is the horse's (legs × 4, neck, head, tail, bob, pitch), so the horse gaits move
 * them (stand, walk, gallop); fables make them talk: the mouth opens with `talk`, eyes blink.
 * Origin on the ground under the belly, facing right.
 */
(function () {
  const { el, g, tr, f2, shade, INK, OUT, clamp } = WA.core;

  // Body [w, h]; legs front/hind [upper, lower], width; neck [x, y, length]; head; ears; tail…
  const SPECIES = {
    buffalo: { color: "#4f4e57", belly: "#66656e", body: [300, 150], front: [62, 58], hind: [66, 58], legW: 36, foot: "hoof", neck: [128, -30, 50], head: "bovine", ears: "side", horns: "buffalo", tail: "tuft", seat: [-10, -78] },
    tiger: { color: "#e3862c", belly: "#fff1d6", pattern: "stripes", body: [270, 112], front: [58, 52], hind: [62, 52], legW: 30, foot: "paw", neck: [118, -26, 30], head: "feline", ears: "round", tail: "long", whiskers: true },
    elephant: { color: "#8f8f9a", body: [350, 210], front: [74, 70], hind: [76, 70], legW: 60, foot: "pad", neck: [215, -70, 20], head: "elephant", ears: "big", tail: "thin", seat: [-20, -112] },
    dog: { color: "#c8955a", belly: "#ecd2a8", body: [190, 88], front: [44, 40], hind: [48, 40], legW: 22, foot: "paw", neck: [82, -24, 30], head: "canine", ears: "floppy", tail: "curl" },
    cat: { color: "#9a9aa4", belly: "#e6e6ec", body: [160, 70], front: [38, 34], hind: [42, 34], legW: 18, foot: "paw", neck: [70, -20, 22], head: "feline", ears: "pointy", tail: "up", whiskers: true },
    rabbit: { color: "#f3eee6", belly: "#ffffff", body: [130, 96], front: [22, 20], hind: [34, 28], legW: 22, foot: "paw", neck: [52, -34, 14], head: "rabbit", ears: "long", tail: "puff" },
    fox: { color: "#d4692a", belly: "#fff3e0", body: [190, 78], front: [42, 38], hind: [46, 38], legW: 18, foot: "paw", neck: [86, -24, 34], head: "canine", snout: 1.3, ears: "pointy", tail: "bushy" },
    turtle: { color: "#8aa65a", shell: "#6e5a30", body: [190, 90], front: [16, 16], hind: [16, 16], legW: 26, foot: "pad", neck: [96, 8, 40], head: "turtle", tail: "tiny" },
    deer: { color: "#b5763a", belly: "#f3e2c4", pattern: "spots", body: [210, 96], front: [64, 62], hind: [68, 62], legW: 18, foot: "hoof", neck: [92, -40, 70], head: "canine", snout: 1.1, ears: "pointy", antlers: true, tail: "puff" },
    mouse: { color: "#9c9aa6", belly: "#ece6ea", body: [96, 50], front: [16, 14], hind: [20, 16], legW: 10, foot: "paw", neck: [44, -14, 8], head: "feline", ears: "round", tail: "string", whiskers: true },
    goat: { color: "#e8e2d4", belly: "#f6f2e8", body: [190, 96], front: [48, 44], hind: [50, 44], legW: 20, foot: "hoof", neck: [84, -34, 40], head: "bovine", ears: "side", horns: "goat", beard: true, tail: "puff" },
  };

  function build(S, parent, look = {}) {
    const sp = SPECIES[look.species] || SPECIES.dog, coat = look.color || sp.color, belly = look.belly || sp.belly || shade(coat, 0.25);
    const [bw, bh] = sp.body, A = { root: g(parent), look, sp, legs: [], seed: WA.core.hash(look.species || "a") };
    A.body = g(A.root);
    const far = (hex) => shade(hex, -0.3);
    const leg = (front, near) => {
      const [L1, L2] = front ? sp.front : sp.hind, hip = g(A.body), hex = near ? coat : far(coat);
      WA.human.limb(S, hip, L1, sp.legW * (front ? 1 : 1.15), hex);
      const knee = g(hip);
      WA.human.limb(S, knee, L2, sp.legW * 0.8, hex);
      const w = sp.legW * 0.55;
      if (sp.foot === "hoof") el("path", { d: `M ${f2(-w)} ${L2 - 4} L ${f2(w)} ${L2 - 4} L ${f2(w * 1.1)} ${L2 + 12} L ${f2(-w * 1.1)} ${L2 + 12} Z`, fill: "#2a2422", ...OUT, "stroke-width": 2.5 }, knee);
      else el("ellipse", { cx: f2(w * 0.4), cy: L2 + 4, rx: f2(w * 1.3), ry: f2(w * 0.7), fill: near ? (sp.foot === "pad" ? shade(coat, -0.1) : coat) : far(coat), ...OUT, "stroke-width": 2.5 }, knee);
      const l = { hip, knee, front, x: (front ? 1 : -1) * bw * 0.34, y: bh * 0.22, L: L1 };
      A.legs.push(l);
      return l;
    };
    leg(true, false); leg(false, false);
    // Tail, behind the body.
    A.tail = g(A.body);
    const tailHex = coat;
    switch (sp.tail) {
      case "tuft": el("path", { d: "M 0 0 C -20 10 -26 50 -24 90", stroke: INK, "stroke-width": 7, fill: "none", "stroke-linecap": "round" }, A.tail); el("path", { d: "M 0 0 C -20 10 -26 50 -24 90", stroke: tailHex, "stroke-width": 4, fill: "none" }, A.tail); el("ellipse", { cx: -24, cy: 96, rx: 9, ry: 14, fill: shade(coat, -0.4), ...OUT, "stroke-width": 2 }, A.tail); break;
      case "long": case "up": {
        const d = sp.tail === "up" ? "M 0 0 C -30 -10 -50 -60 -30 -110" : "M 0 0 C -50 0 -90 30 -120 10";
        el("path", { d, stroke: INK, "stroke-width": sp.tail === "up" ? 13 : 17, fill: "none", "stroke-linecap": "round" }, A.tail);
        el("path", { d, stroke: coat, "stroke-width": sp.tail === "up" ? 8 : 12, fill: "none", "stroke-linecap": "round" }, A.tail);
        if (sp.pattern === "stripes") el("path", { d, stroke: "#2a1a10", "stroke-width": 12, fill: "none", "stroke-dasharray": "6 16" }, A.tail);
        break;
      }
      case "bushy": el("path", { d: "M 0 0 C -40 -10 -100 0 -130 30 C -96 44 -40 36 0 14 Z", fill: S.mat(coat, true), ...OUT }, A.tail); el("path", { d: "M -100 18 C -112 22 -124 26 -130 30 C -118 36 -106 38 -96 36 Z", fill: "#fffaf2", ...OUT, "stroke-width": 2 }, A.tail); break;
      case "curl": el("path", { d: "M 0 0 C -30 -10 -40 -50 -16 -56", stroke: INK, "stroke-width": 13, fill: "none", "stroke-linecap": "round" }, A.tail); el("path", { d: "M 0 0 C -30 -10 -40 -50 -16 -56", stroke: coat, "stroke-width": 8, fill: "none", "stroke-linecap": "round" }, A.tail); break;
      case "puff": el("circle", { cx: -6, cy: -6, r: sp.body[1] * 0.16, fill: "#fffaf2", ...OUT }, A.tail); break;
      case "string": el("path", { d: "M 0 0 C -30 12 -60 -14 -96 -4", stroke: INK, "stroke-width": 6, fill: "none", "stroke-linecap": "round" }, A.tail); el("path", { d: "M 0 0 C -30 12 -60 -14 -96 -4", stroke: shade(coat, 0.15), "stroke-width": 3, fill: "none", "stroke-linecap": "round" }, A.tail); break;
      case "thin": el("path", { d: "M 0 0 C -10 20 -12 50 -10 80", stroke: INK, "stroke-width": 5, fill: "none" }, A.tail); break;
      default: el("path", { d: "M 0 0 L -22 6 L 0 12 Z", fill: coat, ...OUT, "stroke-width": 2 }, A.tail);
    }
    // The body: a soft barrel; a turtle wears its shell.
    if (sp.head === "turtle") {
      el("path", { d: `M ${-bw / 2} 20 Q ${-bw / 2} ${-bh} 0 ${-bh} Q ${bw / 2} ${-bh} ${bw / 2} 20 Z`, fill: S.mat(look.shell || sp.shell, true), ...OUT }, A.body);
      for (let i = -2; i <= 2; i++) el("path", { d: `M ${i * bw * 0.16} ${-bh * 0.95 + Math.abs(i) * 14} l ${f2(bw * 0.07)} ${f2(bh * 0.4)} l ${f2(-bw * 0.07)} ${f2(bh * 0.4)}`, stroke: shade(look.shell || sp.shell, -0.35), "stroke-width": 4, fill: "none" }, A.body);
      el("path", { d: `M ${-bw / 2 - 6} 20 L ${bw / 2 + 6} 20`, stroke: shade(look.shell || sp.shell, 0.3), "stroke-width": 10, "stroke-linecap": "round" }, A.body);
    } else {
      el("path", { d: `M ${-bw / 2} ${f2(bh * 0.1)} C ${-bw / 2} ${-bh * 0.55} ${-bw * 0.3} ${-bh * 0.62} 0 ${-bh * 0.55} C ${bw * 0.3} ${-bh * 0.62} ${bw / 2} ${-bh * 0.5} ${bw / 2} ${f2(bh * 0.05)} C ${bw / 2} ${bh * 0.45} ${bw * 0.2} ${bh * 0.5} 0 ${bh * 0.46} C ${-bw * 0.2} ${bh * 0.5} ${-bw / 2} ${bh * 0.45} ${-bw / 2} ${f2(bh * 0.1)} Z`, fill: S.mat(coat, true), ...OUT }, A.body);
      el("path", { d: `M ${-bw * 0.3} ${bh * 0.4} Q 0 ${bh * 0.56} ${bw * 0.32} ${bh * 0.38}`, stroke: belly, "stroke-width": f2(bh * 0.14), fill: "none", "stroke-linecap": "round", opacity: 0.9 }, A.body);
      if (sp.pattern === "stripes") for (let i = -3; i <= 3; i++) el("path", { d: `M ${i * bw * 0.12} ${-bh * 0.56} q ${f2(bw * 0.04)} ${f2(bh * 0.3)} ${f2(-bw * 0.02)} ${f2(bh * 0.55)}`, stroke: "#2a1a10", "stroke-width": 9, fill: "none", "stroke-linecap": "round" }, A.body);
      if (sp.pattern === "spots") for (let i = 0; i < 9; i++) el("circle", { cx: f2(-bw * 0.35 + (i % 5) * bw * 0.16), cy: f2(-bh * 0.35 + Math.floor(i / 5) * bh * 0.25), r: 6, fill: "#fff3dc", opacity: 0.9 }, A.body);
      el("path", { d: `M ${-bw / 2 + 8} ${-bh * 0.1} C ${-bw / 2 + 12} ${-bh * 0.48} ${-bw * 0.28} ${-bh * 0.56} ${-bw * 0.05} ${-bh * 0.52}`, stroke: shade(coat, 0.35), "stroke-width": 6, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, A.body);
    }
    leg(true, true); leg(false, true);
    A.body.insertBefore(A.legs[1].hip, A.body.firstChild);
    A.body.insertBefore(A.legs[0].hip, A.body.firstChild);
    // Neck and head.
    const [nx, ny, nl] = sp.neck;
    A.neck = g(A.body);
    A.neckAt = [nx - bw * 0.15, ny];
    if (nl > 0 && sp.head !== "elephant") el("path", { d: `M ${-nl * 0.4} ${bh * 0.25} C ${-nl * 0.2} ${-nl * 0.4} ${nl * 0.1} ${-nl * 0.9} ${nl * 0.45} ${-nl * 1.1} L ${nl * 0.85} ${-nl * 0.7} C ${nl * 0.6} ${-nl * 0.2} ${nl * 0.4} ${bh * 0.1} ${nl * 0.5} ${bh * 0.25} Z`, fill: S.mat(sp.head === "turtle" ? coat : coat, true), ...OUT }, A.neck);
    A.head = g(A.neck);
    A.headAt = [nl * 0.55, -nl * 1.0];
    drawHead(S, A, sp, coat, belly);
    A.height = Math.abs(ny) + bh + sp.front[0] + sp.front[1] + nl + 120;
    A.bodyY = -(bh * 0.22 + sp.front[0] + sp.front[1] + 10);
    return A;
  }

  function eye(S, A, x, y, r) {
    const e = g(A.head, { transform: `translate(${f2(x)},${f2(y)})` });
    el("ellipse", { rx: f2(r), ry: f2(r * 1.1), fill: "#fffaf0", stroke: INK, "stroke-width": 2.5 }, e);
    el("circle", { cx: f2(r * 0.25), cy: 0, r: f2(r * 0.6), fill: INK }, e);
    el("circle", { cx: f2(r * 0.42), cy: f2(-r * 0.3), r: f2(r * 0.22), fill: "#fff" }, e);
    A.lid = el("ellipse", { rx: f2(r * 1.15), ry: 0, fill: A.lidHex, stroke: INK, "stroke-width": 2 }, e);
    A.eyeR = r;
  }

  /** The head (in head coordinates: the neck joint at 0,0, the face towards +x). */
  function drawHead(S, A, sp, coat, belly) {
    const h = A.head, dark = shade(coat, -0.35);
    A.lidHex = coat;
    const mouth = (x, y, w) => { A.mouth = el("path", { fill: "#5a1a14", ...OUT, "stroke-width": 2.5 }, h); A.mouthAt = [x, y, w]; };
    switch (sp.head) {
      case "bovine": {
        // Buffalo horns: two great crescents sweeping back (the far one darker, behind).
        if (sp.horns === "buffalo") for (const [dx, k] of [[14, -0.25], [0, 0]]) el("path", { d: `M ${4 + dx} -28 C ${-4 + dx} -96 ${-110 + dx} -112 ${-160 + dx} -60 C ${-118 + dx} -78 ${-44 + dx} -76 ${-12 + dx} -12 Z`, fill: S.mat(shade("#e8dcc0", k), true), ...OUT }, h);
        if (sp.horns === "goat") el("path", { d: "M 0 -30 C -12 -60 -44 -66 -56 -40 C -40 -50 -22 -44 -10 -20 Z", fill: S.mat("#c8b890", true), ...OUT }, h);
        if (sp.ears === "side") el("path", { d: "M -6 -12 C -40 -20 -56 -6 -52 4 C -36 4 -18 0 -4 2 Z", fill: S.mat(coat, true), ...OUT }, h);
        el("path", { d: "M -20 -30 C 10 -46 60 -36 92 -2 C 106 16 100 44 78 50 C 50 56 10 40 -16 20 Z", fill: S.mat(coat, true), ...OUT }, h);
        el("ellipse", { cx: 84, cy: 22, rx: 24, ry: 22, fill: S.mat(shade(coat, 0.18), true), ...OUT, "stroke-width": 2.5 }, h);
        el("ellipse", { cx: 94, cy: 16, rx: 4, ry: 5, fill: INK }, h);
        if (sp.beard) el("path", { d: "M 60 46 L 70 80 L 78 48 Z", fill: "#fffaf2", ...OUT, "stroke-width": 2 }, h);
        eye(S, A, 30, -12, 8);
        mouth(78, 40, 26);
        break;
      }
      case "feline": {
        const ear = (x) => sp.ears === "pointy"
          ? el("path", { d: `M ${x - 16} -34 L ${x} -72 L ${x + 16} -34 Z`, fill: S.mat(coat, true), ...OUT }, h)
          : el("circle", { cx: x, cy: -40, r: 16, fill: S.mat(coat, true), ...OUT }, h);
        ear(-8); ear(30);
        el("circle", { cx: 16, cy: 0, r: 46, fill: S.mat(coat, true), ...OUT }, h);
        if (sp.pattern === "stripes") for (let i = 0; i < 3; i++) el("path", { d: `M ${-4 + i * 14} -44 l 4 18`, stroke: "#2a1a10", "stroke-width": 6, "stroke-linecap": "round" }, h);
        el("ellipse", { cx: 48, cy: 18, rx: 26, ry: 20, fill: belly, ...OUT, "stroke-width": 2.5 }, h);
        el("path", { d: "M 62 6 L 76 8 L 68 18 Z", fill: "#c0605a", ...OUT, "stroke-width": 2 }, h);
        if (sp.whiskers) for (const dy of [-4, 6]) el("path", { d: `M 66 ${16 + dy} l 40 ${dy - 4}`, stroke: INK, "stroke-width": 2 }, h);
        eye(S, A, 34, -10, 9);
        mouth(60, 32, 22);
        break;
      }
      case "canine": {
        const s = sp.snout || 1;
        if (sp.antlers) for (const dx of [-6, 14]) el("path", { d: `M ${dx} -36 l -6 -40 m 3 20 l -16 -10 m 14 -2 l 12 -14`, stroke: "#7a5a3a", "stroke-width": 6, fill: "none", "stroke-linecap": "round" }, h);
        if (sp.ears === "pointy") for (const dx of [-10, 14]) el("path", { d: `M ${dx - 12} -30 L ${dx} -70 L ${dx + 14} -30 Z`, fill: S.mat(coat, true), ...OUT }, h);
        el("circle", { cx: 6, cy: -2, r: 38, fill: S.mat(coat, true), ...OUT }, h);
        el("path", { d: `M 20 -14 C ${50 * s} -18 ${84 * s} -6 ${92 * s} 10 C ${92 * s} 24 ${60 * s} 34 20 30 Z`, fill: S.mat(coat, true), ...OUT }, h);
        el("path", { d: `M 26 18 C ${50 * s} 26 ${80 * s} 22 ${90 * s} 12`, stroke: belly, "stroke-width": 8, fill: "none", "stroke-linecap": "round" }, h);
        el("ellipse", { cx: 92 * s, cy: 6, rx: 9, ry: 7, fill: INK }, h);
        if (sp.ears === "floppy") el("path", { d: "M -16 -30 C -40 -20 -42 20 -26 34 C -18 18 -10 -6 0 -26 Z", fill: S.mat(dark, true), ...OUT }, h);
        eye(S, A, 22, -12, 8);
        mouth(60 * s, 28, 26);
        break;
      }
      case "rabbit": {
        for (const dx of [-8, 10]) el("path", { d: `M ${dx - 10} -30 C ${dx - 16} -90 ${dx + 14} -100 ${dx + 10} -30 Z`, fill: S.mat(coat, true), ...OUT }, h);
        for (const dx of [-8, 10]) el("path", { d: `M ${dx - 4} -36 C ${dx - 6} -78 ${dx + 6} -84 ${dx + 5} -36 Z`, fill: "#f2b8c0" }, h);
        el("ellipse", { cx: 10, cy: 0, rx: 40, ry: 34, fill: S.mat(coat, true), ...OUT }, h);
        el("circle", { cx: 46, cy: 6, r: 6, fill: "#e07a8a", ...OUT, "stroke-width": 2 }, h);
        el("rect", { x: 40, y: 18, width: 10, height: 10, rx: 2, fill: "#fff", ...OUT, "stroke-width": 1.5 }, h);
        eye(S, A, 22, -8, 9);
        mouth(40, 22, 14);
        break;
      }
      case "elephant": {
        A.ear = el("path", { d: "M -10 -60 C -90 -70 -100 40 -30 60 C -10 40 0 0 -10 -60 Z", fill: S.mat(shade(coat, -0.08), true), ...OUT }, h);
        el("path", { d: "M -30 -60 C 10 -90 80 -70 86 -20 C 90 20 60 40 20 40 C -20 40 -40 0 -30 -60 Z", fill: S.mat(coat, true), ...OUT }, h);
        A.trunk = g(h, { transform: "translate(74,14)" });
        el("path", { d: "M -16 -10 C 14 40 12 110 -4 160 C 0 170 18 172 22 160 C 40 110 40 40 24 -10 Z", fill: S.mat(coat, true), ...OUT }, A.trunk);
        for (let i = 0; i < 7; i++) el("path", { d: `M ${-2 + i * 1.5} ${24 + i * 20} q 10 4 20 0`, stroke: dark, "stroke-width": 2.5, fill: "none" }, A.trunk);
        el("path", { d: "M 40 30 C 60 50 70 60 90 58 C 80 50 70 40 56 26 Z", fill: "#fffaf0", ...OUT, "stroke-width": 2.5 }, h); // tusk
        eye(S, A, 40, -24, 8);
        mouth(48, 36, 18);
        break;
      }
      case "turtle": {
        el("ellipse", { cx: 18, cy: -4, rx: 30, ry: 24, fill: S.mat(sp.color, true), ...OUT }, h);
        eye(S, A, 26, -10, 7);
        mouth(36, 8, 16);
        break;
      }
    }
  }

  /** p as for the horse, plus talk (0–1: the mouth opens) and look (eye direction). */
  function apply(A, p, t) {
    const s = p.scale ?? 1, facing = p.facing ?? 1;
    tr(A.root, p.x, p.y ?? 0, 0, s * facing, s);
    A.root.setAttribute("opacity", f2(clamp(p.opacity ?? 1)));
    tr(A.body, 0, A.bodyY + (p.bob || 0) * 0.6, (p.pitch || 0) * 0.7);
    A.legs.forEach((l, i) => {
      const a = p.legs?.[i] || [0, 0];
      tr(l.hip, l.x, l.y, -a[0] * 0.9);
      tr(l.knee, 0, l.L, -a[1] * 0.9);
    });
    tr(A.neck, A.neckAt[0], A.neckAt[1], (p.neck || 0) * 0.6);
    tr(A.head, A.headAt[0], A.headAt[1], (p.head || 0) * 0.5 + 2 * Math.sin(t * 1.3 + A.seed));
    tr(A.tail, -A.sp.body[0] * 0.48, -A.sp.body[1] * 0.2, (p.tail || 0) + 8 * Math.sin(t * 5 + A.seed));
    if (A.trunk) tr(A.trunk, 74, 14, 6 * Math.sin(t * 1.7));
    if (A.ear) A.ear.setAttribute("transform", `rotate(${f2(4 * Math.sin(t * 2.2))} -10 -10)`);
    // Blink now and then; talk opens the mouth (lower jaw drops).
    const blink = ((t + (A.seed % 7)) % 4.3) < 0.13;
    A.lid?.setAttribute("ry", f2(blink ? A.eyeR * 1.2 : 0));
    if (A.mouth) {
      const [mx, my, mw] = A.mouthAt, open = clamp(p.talk || 0) * mw * 0.7;
      A.mouth.setAttribute("d", `M ${f2(mx - mw / 2)} ${f2(my)} Q ${f2(mx)} ${f2(my + 4 + open)} ${f2(mx + mw / 2)} ${f2(my - 2)} Q ${f2(mx)} ${f2(my + 2)} ${f2(mx - mw / 2)} ${f2(my)} Z`);
    }
  }

  function points(A, p) {
    const s = p.scale ?? 1, f = p.facing ?? 1, [bw, bh] = A.sp.body, y0 = p.y ?? 0;
    const by = A.bodyY + (p.bob || 0) * 0.6;
    const headX = A.neckAt[0] + A.headAt[0] + 30, headY = by + A.neckAt[1] + A.headAt[1];
    const seat = A.sp.seat || [0, -bh * 0.55];
    const front = Math.max(bw / 2, headX + 110), back = bw / 2 + 120;
    return {
      seat: [p.x + seat[0] * s * f, y0 + (by + seat[1]) * s], mouth: [p.x + (headX + 50) * s * f, y0 + (headY + 20) * s], mouthAngle: f > 0 ? 0 : Math.PI,
      head: [p.x + headX * s * f, y0 + headY * s], headR: 45 * s, hooves: [[p.x - bw * 0.34 * s * f, y0], [p.x + bw * 0.34 * s * f, y0]],
      top: y0 + (headY - 90) * s, height: A.height * s, feet: [p.x, y0],
      hips: [p.x, y0 + by * s], // (the middle of the body: where effects on the animal are centred)
      box: [Math.min(p.x - back * s * f, p.x + front * s * f), y0 + (headY - 100) * s, Math.max(p.x - back * s * f, p.x + front * s * f), y0],
    };
  }

  WA.animal = { build, apply, points, SPECIES };
})();
