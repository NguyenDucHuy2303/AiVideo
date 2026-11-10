/*
 * Sets: the places of Vietnamese folk tales, drawn from reusable pieces (ridges, clouds,
 * bamboo, areca palms, stilt houses, a Văn Lang palace with a boat-shaped roof as on the
 * Đông Sơn drums, paddies, a dirt road, foreground grass). Every set is wide enough for a
 * long tracking shot (x from -6000 to 20000).
 */
(function () {
  const { el, g, f2, shade, rand, hash, OUT, INK } = WA.core;
  const X0 = -6000, X1 = 20000;

  function ridge(S, parent, base, height, step, colors, seed) {
    const r = rand(seed);
    let d = `M ${X0} ${base + 600} L ${X0} ${base}`;
    for (let x = X0; x <= X1; x += step) {
      const peak = base - height * (0.5 + 0.5 * r());
      d += ` C ${x + step * 0.25} ${peak} ${x + step * 0.45} ${peak - height * 0.12} ${x + step * 0.6} ${peak + height * 0.05} S ${x + step * 0.9} ${base - height * 0.25 * r()} ${x + step} ${base - height * 0.15 * r()}`;
    }
    d += ` L ${X1 + step} ${base + 600} Z`;
    el("path", { d, fill: S.grad(colors[0], colors[1]) }, parent);
  }

  function clouds(S, n, seed) {
    const R = rand(seed), night = S.time === "night";
    for (let i = 0; i < n; i++) {
      const c = g(S.layer("clouds"));
      const w = 200 + R() * 260;
      for (let k = 0; k < 5; k++) el("ellipse", { cx: f2((k - 2) * w * 0.24), cy: f2(-Math.abs(k - 2) * 14), rx: f2(w * 0.3), ry: f2(w * 0.15), fill: night ? "#56628f" : k % 2 ? shade(S.palette.sky[3], 0.25) : shade(S.palette.sky[4], 0.3), opacity: 0.6 }, c);
      S.drifting.push({ node: c, x: -2600 + i * 760 + R() * 300, y: -1050 - R() * 300, v: 8 + R() * 10 });
    }
  }

  function bamboo(S, parent, x, s, seed, color = "#3f6634") {
    const r = rand(seed), c = g(parent), n = 6 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const h = (280 + r() * 240) * s, bend = (r() - 0.4) * 110 * s, x0 = (i - n / 2) * 10 * s;
      el("path", { d: `M ${f2(x0)} 0 Q ${f2(x0 + bend * 0.3)} ${f2(-h * 0.5)} ${f2(x0 + bend)} ${f2(-h)}`, stroke: color, "stroke-width": f2(7 * s), fill: "none", "stroke-linecap": "round" }, c);
      for (let k = 1; k < 6; k++) { const tt = k / 6; el("circle", { cx: f2(x0 + bend * tt * tt), cy: f2(-h * tt), r: f2(3.5 * s), fill: shade(color, -0.3) }, c); }
      for (let k = 0; k < 5; k++) {
        const tt = 0.4 + k * 0.14, lx = x0 + bend * tt * tt, ly = -h * tt;
        for (let j = 0; j < 3; j++) el("path", { d: `M ${f2(lx)} ${f2(ly)} q ${f2(18 * s)} ${f2(-8 * s)} ${f2(42 * s)} ${f2(2 * s)} q ${f2(-22 * s)} ${f2(6 * s)} ${f2(-42 * s)} ${f2(-2 * s)}`, fill: j === 1 ? shade(color, 0.15) : color, transform: `rotate(${f2((j - 1) * 35 + (r() - 0.5) * 30 + (k % 2 ? 180 : 0))} ${f2(lx)} ${f2(ly)})` }, c);
      }
    }
    S.swaying.push({ node: c, x, phase: r() * 6, amp: 1 + r() });
    return c;
  }

  function palm(S, parent, x, s, seed) {
    const r = rand(seed), c = g(parent);
    const h = (430 + r() * 180) * s, lean = (r() - 0.5) * 70 * s;
    el("path", { d: `M 0 0 Q ${f2(lean * 0.4)} ${f2(-h * 0.5)} ${f2(lean)} ${f2(-h)}`, stroke: "#6d5a3c", "stroke-width": f2(12 * s), fill: "none", "stroke-linecap": "round" }, c);
    for (let i = 0; i < 8; i++) {
      const a = ((-170 + i * 24 + (r() - 0.5) * 10) * Math.PI) / 180, L = (120 + r() * 30) * s;
      el("path", { d: `M ${f2(lean)} ${f2(-h)} q ${f2(Math.cos(a) * L * 0.5)} ${f2(Math.sin(a) * L * 0.3 - 26 * s)} ${f2(Math.cos(a) * L)} ${f2(Math.sin(a) * L * 0.6 + 40 * s)}`, stroke: i % 2 ? "#3f6a32" : "#4f7a3a", "stroke-width": f2(13 * s), fill: "none", "stroke-linecap": "round" }, c);
    }
    S.swaying.push({ node: c, x, phase: r() * 6, amp: 0.7 });
  }

  /**
   * Văn Lang stilt house, as on the Đông Sơn drums: a saddle roof sweeping up at both ends
   * like a boat's prow and stern, with a bird on each end; woven walls.
   */
  function boatHouse(S, parent, x, s, dark) {
    const c = g(parent, { transform: `translate(${x},0) scale(${s})` });
    const wood = dark ? "#5b3b26" : "#7a4f30", wall = dark ? "#a37a4c" : "#cfa266", thatch = dark ? "#93653a" : "#bf8746";
    for (const sx of [-120, -50, 50, 120]) el("rect", { x: sx - 8, y: -128, width: 16, height: 128, fill: S.mat(wood), ...OUT }, c);
    el("rect", { x: -150, y: -146, width: 300, height: 22, fill: S.mat(wood, true), ...OUT }, c);
    el("rect", { x: -112, y: -252, width: 224, height: 108, fill: S.mat(wall, true), ...OUT }, c);
    for (let i = 0; i < 9; i++) el("line", { x1: -112 + i * 28, y1: -252, x2: -112 + i * 28 + 14, y2: -146, stroke: shade(wall, -0.2), "stroke-width": 3, opacity: 0.7 }, c); // woven bamboo
    el("rect", { x: -24, y: -226, width: 48, height: 82, fill: "#3e2616", ...OUT }, c);
    if (S.time === "dusk" || S.time === "night") el("rect", { x: -16, y: -218, width: 32, height: 28, fill: "#ffcf7a", opacity: 0.6 }, c);
    // The roof: low in the middle, rising to two upturned ends.
    el("path", { d: "M -250 -330 Q -200 -250 -150 -246 L 150 -246 Q 200 -250 250 -330 Q 180 -300 120 -400 Q 0 -440 -120 -400 Q -180 -300 -250 -330 Z", fill: S.mat(thatch, true), ...OUT }, c);
    for (let i = -6; i <= 6; i++) el("line", { x1: i * 22, y1: -250, x2: i * 16, y2: -410 + Math.abs(i) * 4, stroke: shade(thatch, -0.28), "stroke-width": 3, opacity: 0.7 }, c);
    for (const sx of [-1, 1]) el("path", { d: `M ${sx * 250} -330 q ${sx * 24} -34 ${sx * 6} -66 q ${sx * 18} 8 ${sx * 30} -4 q ${-sx * 8} 26 ${-sx * 26} 42 Z`, fill: S.mat("#5a3a22"), ...OUT }, c); // birds
    el("rect", { x: -60, y: -146, width: 16, height: 130, fill: S.mat(wood), transform: "rotate(-24 -52 -16)", ...OUT }, c);
    return c;
  }

  /** Stilt house with a thatched roof; a warm lamp inside at dusk and night. */
  /** Nhà tranh vách đất (northern village house): low earth walls under a deep thatched roof. */
  function thatchHouse(S, parent, x, s, dark) {
    const c = g(parent, { transform: `translate(${x},0) scale(${s})` });
    const wall = dark ? "#a88a5e" : "#d2b07a", wood = dark ? "#5b3b26" : "#7a4f30", thatch = dark ? "#9a7a3e" : "#c9a050";
    el("rect", { x: -230, y: -14, width: 460, height: 14, fill: S.mat("#9a8462", true), ...OUT }, c); // beaten-earth plinth
    el("rect", { x: -200, y: -170, width: 400, height: 158, fill: S.mat(wall, true), ...OUT }, c);
    for (let i = 0; i < 5; i++) el("path", { d: `M -200 ${-150 + i * 30} q 100 6 200 0 t 200 0`, stroke: shade(wall, -0.14), "stroke-width": 3, fill: "none", opacity: 0.6 }, c);
    for (const dx of [-120, 0, 120]) {
      el("rect", { x: dx - 34, y: -140, width: 68, height: 128, fill: "#3e2616", ...OUT }, c);
      for (let i = 0; i < 4; i++) el("line", { x1: dx - 34 + i * 22, y1: -140, x2: dx - 34 + i * 22, y2: -12, stroke: wood, "stroke-width": 5 }, c); // bamboo lattice
    }
    if (S.time === "dusk" || S.time === "night") el("rect", { x: -28, y: -130, width: 56, height: 60, fill: "#ffcf7a", opacity: 0.55 }, c);
    // The thatch: thick, low eaves, a hip roof with a straight ridge.
    el("path", { d: "M -290 -150 Q -240 -175 -210 -300 L 210 -300 Q 240 -175 290 -150 Q 0 -128 -290 -150 Z", fill: S.mat(thatch, true), ...OUT }, c);
    for (let i = -10; i <= 10; i++) el("line", { x1: i * 27, y1: -146 - Math.abs(i) * 0.5, x2: i * 19, y2: -296, stroke: shade(thatch, -0.25), "stroke-width": 3, opacity: 0.6 }, c);
    el("path", { d: "M -290 -150 Q 0 -128 290 -150", stroke: shade(thatch, -0.4), "stroke-width": 9, fill: "none" }, c);
    el("rect", { x: -222, y: -312, width: 444, height: 18, rx: 8, fill: S.mat(shade(thatch, -0.2), true), ...OUT }, c); // ridge
    return c;
  }

  /** Nhà ngói: wooden columns, brick walls, a tiled roof whose corners curl up (đầu đao). */
  function tileHouse(S, parent, x, s, dark) {
    const c = g(parent, { transform: `translate(${x},0) scale(${s})` });
    const wall = dark ? "#a8805c" : "#d9b07c", wood = dark ? "#5a2e1c" : "#7a3f22", tile = dark ? "#6a3222" : "#8e4430";
    el("rect", { x: -240, y: -20, width: 480, height: 20, fill: S.mat("#9a8a70", true), ...OUT }, c);
    el("rect", { x: -200, y: -190, width: 400, height: 172, fill: S.mat(wall, true), ...OUT }, c);
    for (const dx of [-200, -100, 0, 100, 200]) el("rect", { x: dx - 9, y: -200, width: 18, height: 182, fill: S.mat(wood), ...OUT }, c);
    for (const dx of [-150, 50]) el("rect", { x: dx, y: -160, width: 100, height: 140, fill: "#4a2414", ...OUT }, c);
    if (S.time === "dusk" || S.time === "night") el("rect", { x: 60, y: -150, width: 80, height: 50, fill: "#ffcf7a", opacity: 0.55 }, c);
    el("path", { d: "M -300 -190 Q -250 -205 -230 -320 L 230 -320 Q 250 -205 300 -190 Q 0 -176 -300 -190 Z", fill: S.mat(tile, true), ...OUT }, c);
    for (let i = 0; i < 6; i++) el("path", { d: `M ${-282 + i * 10} ${-196 - i * 21} Q 0 ${-182 - i * 21} ${282 - i * 10} ${-196 - i * 21}`, stroke: shade(tile, -0.3), "stroke-width": 3, fill: "none" }, c);
    el("rect", { x: -240, y: -334, width: 480, height: 18, rx: 6, fill: S.mat(shade(tile, -0.25), true), ...OUT }, c);
    for (const sx of [-1, 1]) el("path", { d: `M ${sx * 300} -190 q ${sx * 34} -14 ${sx * 40} -54 q ${-sx * 12} 22 ${-sx * 44} 44 Z`, fill: S.mat(tile, true), ...OUT }, c); // curled corners
    for (const sx of [-1, 1]) el("path", { d: `M ${sx * 240} -334 q ${sx * 20} -10 ${sx * 26} -40 q ${-sx * 10} 18 ${-sx * 30} 30 Z`, fill: S.mat(shade(tile, -0.25), true), ...OUT }, c);
    return c;
  }

  /** A palace or đình of tiled roofs: two tiers with curled corners, red columns, stone steps. */
  function tilePalace(S, parent, x, s) {
    const c = g(parent, { transform: `translate(${x},0) scale(${s})` });
    const red = "#9c2f1c", wall = "#e0b86a", tile = "#8a3a26", gold = "url(#gold)";
    el("rect", { x: -360, y: -40, width: 720, height: 40, fill: S.mat("#a89a80", true), ...OUT }, c);
    for (let i = 0; i < 3; i++) el("rect", { x: -70 + i * 6, y: -40 + i * 13, width: 140 - i * 12, height: 13, fill: "#bcae94", ...OUT, "stroke-width": 2 }, c);
    el("rect", { x: -290, y: -250, width: 580, height: 210, fill: S.mat(wall, true), ...OUT }, c);
    for (let i = -4; i <= 4; i++) el("rect", { x: i * 70 - 11, y: -262, width: 22, height: 222, fill: S.mat(red), ...OUT }, c);
    for (const dx of [-140, 0, 140]) el("rect", { x: dx - 40, y: -220, width: 80, height: 180, fill: "#4a2414", ...OUT }, c);
    const tier = (y, half, h) => {
      el("path", { d: `M ${-half - 70} ${y} Q ${-half - 20} ${y - 14} ${-half} ${y - h} L ${half} ${y - h} Q ${half + 20} ${y - 14} ${half + 70} ${y} Q 0 ${y + 14} ${-half - 70} ${y} Z`, fill: S.mat(tile, true), ...OUT }, c);
      for (let i = 0; i < 5; i++) el("path", { d: `M ${-half - 55 + i * 12} ${y - 4 - i * h / 5} Q 0 ${y + 8 - i * h / 5} ${half + 55 - i * 12} ${y - 4 - i * h / 5}`, stroke: shade(tile, -0.3), "stroke-width": 3, fill: "none" }, c);
      for (const sx of [-1, 1]) el("path", { d: `M ${sx * (half + 70)} ${y} q ${sx * 40} -16 ${sx * 46} -66 q ${-sx * 14} 26 ${-sx * 52} 54 Z`, fill: S.mat(tile, true), ...OUT }, c);
    };
    tier(-250, 300, 90);
    el("rect", { x: -200, y: -400, width: 400, height: 64, fill: S.mat(wall, true), ...OUT }, c);
    tier(-390, 210, 100);
    el("rect", { x: -230, y: -504, width: 460, height: 18, rx: 6, fill: S.mat(shade(tile, -0.25), true), ...OUT }, c);
    // Two dragons facing a pearl on the ridge, as on palaces and communal houses.
    for (const sx of [-1, 1]) el("path", { d: `M ${sx * 220} -504 q ${-sx * 40} -40 ${-sx * 110} -26 q ${sx * 30} -4 ${sx * 50} -24 q ${sx * 30} 20 ${sx * 60} 50 Z`, fill: S.mat("#5d7a5a", true), ...OUT, "stroke-width": 2.5 }, c);
    el("circle", { cx: 0, cy: -540, r: 18, fill: gold, ...OUT }, c);
    return c;
  }

  function house(S, parent, x, s, dark) {
    const style = (S.architecture && S.architecture.house) || (S.era === "van_lang" ? "boat" : "stilt");
    if (style === "boat") return boatHouse(S, parent, x, s, dark);
    if (style === "thatch") return thatchHouse(S, parent, x, s, dark);
    if (style === "tile") return tileHouse(S, parent, x, s, dark);
    const c = g(parent, { transform: `translate(${x},0) scale(${s})` });
    const wood = dark ? "#5b3b26" : "#7a4f30", wall = dark ? "#a37a4c" : "#cfa266", thatch = dark ? "#93653a" : "#bf8746";
    for (const sx of [-110, -40, 40, 110]) el("rect", { x: sx - 8, y: -122, width: 16, height: 122, fill: S.mat(wood), ...OUT }, c);
    el("rect", { x: -142, y: -140, width: 284, height: 22, fill: S.mat(wood, true), ...OUT }, c);
    el("rect", { x: -118, y: -254, width: 236, height: 118, fill: S.mat(wall, true), ...OUT }, c);
    for (let i = 0; i < 6; i++) el("line", { x1: -118, y1: -238 + i * 18, x2: 118, y2: -238 + i * 18, stroke: shade(wall, -0.18), "stroke-width": 3 }, c);
    el("rect", { x: -26, y: -228, width: 52, height: 92, fill: "#3e2616", ...OUT }, c);
    if (S.time === "dusk" || S.time === "night") el("rect", { x: -18, y: -220, width: 36, height: 30, fill: "#ffcf7a", opacity: 0.6 }, c);
    el("path", { d: "M -196 -236 L 0 -420 L 196 -236 Q 0 -256 -196 -236 Z", fill: S.mat(thatch, true), ...OUT }, c);
    for (let i = -6; i <= 6; i++) el("line", { x1: i * 28, y1: -242 - (6 - Math.abs(i)) * 2, x2: i * 10, y2: -372, stroke: shade(thatch, -0.25), "stroke-width": 3, opacity: 0.7 }, c);
    el("path", { d: "M -196 -236 Q 0 -256 196 -236", stroke: shade(thatch, -0.4), "stroke-width": 8, fill: "none" }, c);
    el("rect", { x: -58, y: -140, width: 16, height: 124, fill: S.mat(wood), transform: "rotate(-24 -50 -16)", ...OUT }, c);
    return c;
  }

  /** Văn Lang palace: a big stilt hall with a boat-shaped saddle roof and bird finials. */
  function palace(S, parent, x, s) {
    if (S.architecture && S.architecture.palace === "tile") return tilePalace(S, parent, x, s);
    const c = g(parent, { transform: `translate(${x},0) scale(${s})` });
    const wood = "#7a3f22", red = "#9c2f1c", wall = "#d9a85c", thatch = "#b07a3c";
    el("rect", { x: -330, y: -24, width: 660, height: 24, fill: S.mat("#9a8a70", true), ...OUT }, c); // stone base
    for (let i = -4; i <= 4; i++) el("rect", { x: i * 72 - 10, y: -170, width: 20, height: 148, fill: S.mat(red), ...OUT }, c);
    el("rect", { x: -320, y: -192, width: 640, height: 26, fill: S.mat(wood, true), ...OUT }, c);
    el("rect", { x: -260, y: -340, width: 520, height: 152, fill: S.mat(wall, true), ...OUT }, c);
    for (let i = 0; i < 8; i++) el("line", { x1: -260, y1: -322 + i * 18, x2: 260, y2: -322 + i * 18, stroke: shade(wall, -0.16), "stroke-width": 3 }, c);
    for (const dx of [-150, 0, 150]) el("rect", { x: dx - 34, y: -320, width: 68, height: 128, fill: "#4a2414", ...OUT }, c);
    // Boat-shaped roof sweeping up at both ends.
    el("path", { d: "M -420 -420 Q -300 -330 -280 -330 L 280 -330 Q 300 -330 420 -420 Q 330 -380 250 -470 L -250 -470 Q -330 -380 -420 -420 Z", fill: S.mat(thatch, true), ...OUT }, c);
    el("path", { d: "M -250 -470 Q 0 -640 250 -470 Z", fill: S.mat(shade(thatch, -0.1), true), ...OUT }, c);
    for (let i = -8; i <= 8; i++) el("line", { x1: i * 30, y1: -336, x2: i * 22, y2: -462, stroke: shade(thatch, -0.3), "stroke-width": 3, opacity: 0.6 }, c);
    for (const sx of [-1, 1]) {
      el("path", { d: `M ${sx * 420} -420 q ${sx * 30} -40 ${sx * 10} -80 q ${sx * 20} 10 ${sx * 34} -6 q ${-sx * 10} 30 ${-sx * 30} 50 Z`, fill: S.mat("#5a3a22"), ...OUT }, c); // bird finial
    }
    for (let i = 0; i < 9; i++) el("circle", { cx: -200 + i * 50, cy: -350, r: 9, fill: "url(#gold)", stroke: INK, "stroke-width": 2 }, c);
    for (const fx of [-380, 380]) {
      el("rect", { x: fx - 6, y: -560, width: 12, height: 560, fill: S.mat("#6b4a2a"), ...OUT }, c);
      el("path", { d: `M ${fx + 6} -556 L ${fx + 120} -530 L ${fx + 6} -500 Z`, fill: "#c0392b", ...OUT }, c);
    }
    return c;
  }

  /** The ground plane: dirt road under the actors, paddies with water mirroring the sky. */
  function ground(S, { road = true, paddies = true, seed = 5, painted = false } = {}) {
    const G = S.layer("ground"), R = rand(seed);
    // Under a painted backdrop only the road is drawn: the painting's own fields show around it.
    if (painted) paddies = false;
    else el("rect", { x: X0, y: -12, width: X1 - X0, height: 1600, fill: S.field }, G);
    if (paddies) {
      for (let i = 0; i < 8; i++) {
        const y = 70 + i * i * 14 + i * 30, h = 26 + i * 10;
        el("rect", { x: X0, y, width: X1 - X0, height: h, fill: S.water, opacity: 0.55 }, G);
        el("rect", { x: X0, y: y - 5, width: X1 - X0, height: 6, fill: shade(S.palette.field[1], 0.15) }, G);
      }
      const rows = [];
      for (let i = 0; i < 520; i++) {
        const x = X0 + R() * (X1 - X0), row = Math.floor(R() * 7), y = 64 + row * row * 14 + row * 30, s = 0.7 + row * 0.25;
        rows.push(`<path d="M ${x.toFixed(0)} ${y} l ${f2(-6 * s)} ${f2(-22 * s)} M ${x.toFixed(0)} ${y} l 0 ${f2(-26 * s)} M ${x.toFixed(0)} ${y} l ${f2(6 * s)} ${f2(-22 * s)}" stroke="${shade(S.palette.field[1], 0.1)}" stroke-width="${f2(3 * s)}" stroke-linecap="round"/>`);
      }
      G.insertAdjacentHTML("beforeend", rows.join(""));
    }
    if (road) {
      el("path", { d: `M ${X0} -16 L ${X1} -16 L ${X1} 40 L ${X0} 40 Z`, fill: S.mat(S.time === "night" ? "#6a5a48" : "#cfa066", true) }, G);
      el("path", { d: `M ${X0} 38 L ${X1} 38`, stroke: "#9c7040", "stroke-width": 6 }, G);
      for (let i = 0; i < 160; i++) el("ellipse", { cx: f2(X0 + R() * (X1 - X0)), cy: f2(R() * 36 - 10), rx: f2(4 + R() * 8), ry: f2(2 + R() * 3), fill: "#b48650", opacity: 0.8 }, G);
    }
  }

  function frontGrass(S, seed = 9) {
    const R = rand(seed);
    for (let i = 0; i < 90; i++) {
      const x = -4500 + i * 210 + R() * 120, s = 0.9 + R() * 0.9, c = g(S.layer("front"));
      for (let k = 0; k < 7; k++) {
        const a = (((k - 3) * 11 + (R() - 0.5) * 10) * Math.PI) / 180, h = (90 + R() * 90) * s;
        el("path", { d: `M ${f2(x + k * 7)} 320 q ${f2(Math.sin(a) * h * 0.3)} ${f2(-h * 0.6)} ${f2(Math.sin(a) * h)} ${f2(-h)}`, stroke: k % 2 ? "#2f4a1e" : "#3d5a26", "stroke-width": f2(9 * s), fill: "none", "stroke-linecap": "round" }, c);
      }
    }
  }

  function hills(S, seed) {
    const P = S.palette;
    ridge(S, S.layer("far"), -160, 420, 560, P.far, seed + 1);
    ridge(S, S.layer("far"), -60, 300, 420, P.far2, seed + 2);
    ridge(S, S.layer("mid"), 0, 190, 320, P.mid, seed + 3);
  }

  /** A tall lone mountain (Sóc Sơn) standing in the middle distance. */
  function mountain(S, x, s) {
    const c = g(S.layer("mid"), { transform: `translate(${x},0) scale(${s})` });
    el("path", { d: "M -900 40 C -620 -80 -420 -420 -160 -760 C -60 -880 40 -900 120 -800 C 330 -520 560 -180 920 40 Z", fill: S.grad(shade(S.palette.mid[0], 0.12), S.palette.mid[1], 0.9) }, c);
    el("path", { d: "M -160 -760 C -60 -880 40 -900 120 -800 C 60 -780 0 -740 -60 -700 Z", fill: shade(S.palette.mid[0], 0.3), opacity: 0.6 }, c);
    for (let i = 0; i < 26; i++) {
      const r = rand(400 + i), tx = -700 + r() * 1400, ty = -60 - r() * 520 * (1 - Math.abs(tx) / 900);
      el("circle", { cx: f2(tx), cy: f2(ty), r: f2(24 + r() * 26), fill: shade(S.palette.mid[1], -0.1), opacity: 0.8 }, c);
    }
    return c;
  }

  /** Clouds to stand on, for the realm of the immortals. */
  function cloudFloor(S) {
    const G = S.layer("ground"), R = rand(61);
    el("rect", { x: X0, y: 40, width: X1 - X0, height: 1600, fill: S.grad("#fff3e4", "#f2cdb8", 0.4) }, G);
    for (let i = 0; i < 160; i++) {
      const x = X0 + i * 170 + R() * 80, r = 90 + R() * 110;
      el("circle", { cx: f2(x), cy: f2(40 + R() * 60), r: f2(r), fill: i % 3 ? "#fff6ea" : "#fde3cf", opacity: 0.95 }, G);
    }
    for (let i = 0; i < 26; i++) {
      const c = g(S.layer("back"));
      const x = -4000 + i * 900 + R() * 300, w = 300 + R() * 260;
      for (let k = 0; k < 5; k++) el("ellipse", { cx: f2(x + (k - 2) * w * 0.26), cy: f2(-40 - Math.abs(k - 2) * 26), rx: f2(w * 0.32), ry: f2(w * 0.18), fill: k % 2 ? "#fff1e2" : "#ffe6d2", opacity: 0.9 }, c);
    }
    const front = S.layer("front");
    for (let i = 0; i < 40; i++) el("ellipse", { cx: f2(-4500 + i * 520 + R() * 200), cy: f2(260 + R() * 40), rx: f2(220 + R() * 160), ry: f2(80 + R() * 40), fill: "#fff8ef", opacity: 0.9 }, front);
  }

  /**
   * Props standing or lying in the set: { type, x, scale, layer ("back" by default) }.
   *   footprint · mat · rice · nong (count, food: rice | ca, empty) · bowls · armor · banner (color) · stumps · stone · fire_pit
   */
  function object(S, o) {
    const layer = S.layer(o.layer || (o.type === "footprint" || o.type === "mat" ? "ground" : "back"));
    const c = g(layer, { transform: `translate(${o.x || 0},${o.y || 0}) scale(${(o.scale || 1) * (o.facing === -1 ? -1 : 1)},${o.scale || 1})` });
    switch (o.type) {
      case "footprint": { // the giant footprint pressed into the field, seen low from the side
        el("ellipse", { cx: 0, cy: 6, rx: 230, ry: 26, fill: "#a37a4a" }, c); // raised rim of earth
        el("path", { d: "M -200 4 C -190 -12 -100 -18 -20 -14 C 80 -10 170 -16 196 0 C 210 14 160 24 60 22 C -40 20 -190 26 -200 4 Z", fill: "#4a3018", opacity: 0.9 }, c);
        el("path", { d: "M -186 8 C -120 18 40 20 180 8", stroke: "#2e1c0c", "stroke-width": 4, fill: "none", opacity: 0.6 }, c);
        for (let i = 0; i < 5; i++) el("ellipse", { cx: 212 + i * 4, cy: -22 + i * 9, rx: 20 - i * 2.5, ry: 7 - i * 0.6, fill: "#4a3018", opacity: 0.9 }, c); // toes
        el("path", { d: "M -230 6 C -200 -30 160 -34 230 4", stroke: "#c9a46e", "stroke-width": 5, fill: "none", opacity: 0.7 }, c);
        break;
      }
      case "mat": // a woven sleeping mat (chiếu)
        el("path", { d: "M -170 -6 L 170 -6 L 190 22 L -190 22 Z", fill: S.mat("#d9b874", true), ...OUT }, c);
        for (let i = -8; i <= 8; i++) el("line", { x1: i * 21, y1: -4, x2: i * 23, y2: 20, stroke: "#b8964f", "stroke-width": 2 }, c);
        break;
      case "rice": // baskets heaped with rice and a sack
        for (const [dx, sz] of [[-90, 1], [0, 1.15], [95, 0.95]]) {
          const b = g(c, { transform: `translate(${dx},0) scale(${sz})` });
          el("path", { d: "M -55 0 Q -60 -70 0 -76 Q 60 -70 55 0 Z", fill: S.mat("#c99a5a", true), ...OUT }, b);
          el("ellipse", { cx: 0, cy: -74, rx: 52, ry: 22, fill: "#fbf6e8", ...OUT }, b);
          el("path", { d: "M -48 -30 Q 0 -20 48 -30 M -52 -52 Q 0 -42 52 -52", stroke: "#8a6a3a", "stroke-width": 3, fill: "none" }, b);
        }
        break;
      case "nong": { // big round flat woven trays (nong) heaped with rice or cà: "bảy nong cơm, ba nong cà"
        // count (7), food "rice" | "ca", empty: trays already eaten clean (stacked).
        const n = o.count || 7, back = Math.ceil(n / 2), R0 = rand(hash(`nong${o.x}`));
        // Eaten trays pile up in one stack; full ones sit in two rows.
        const spots = o.empty ? Array.from({ length: n }, (_, i) => ({ x: 0, y: -i * 15, k: 1 })) : Array.from({ length: n }, (_, i) => i < back
          ? { x: (i - (back - 1) / 2) * 200, y: -46, k: 0.85 }
          : { x: (i - back - (n - back - 1) / 2) * 200 + 100, y: 0, k: 1 });
        for (const p of spots) {
          const t = g(c, { transform: `translate(${f2(p.x + (R0() - 0.5) * 20)},${p.y}) scale(${p.k})` });
          el("ellipse", { cx: 0, cy: 0, rx: 112, ry: 26, fill: S.mat("#b98a4a", true), ...OUT }, t);
          el("ellipse", { cx: 0, cy: -4, rx: 100, ry: 20, fill: S.mat("#d8b070", true) }, t);
          for (let k = -4; k <= 4; k++) el("path", { d: `M ${k * 22} -22 Q ${k * 25} -4 ${k * 22} 14`, stroke: "#a87c40", "stroke-width": 2, fill: "none", opacity: 0.7 }, t);
          el("ellipse", { cx: 0, cy: -4, rx: 100, ry: 20, fill: "none", stroke: "#8a6230", "stroke-width": 3 }, t);
          if (o.empty) continue;
          if (o.food === "ca") for (let k = 0; k < 9; k++) { // round white-purple cà, heaped
            const cx = (k % 4 - 1.5) * 34 + (k > 3 ? 17 : 0), cy = -14 - Math.floor(k / 4) * 18;
            el("circle", { cx: f2(cx), cy: f2(cy), r: 17, fill: S.mat(k % 3 ? "#8e5aa8" : "#e9e3f0"), ...OUT, "stroke-width": 2.5 }, t);
            el("path", { d: `M ${f2(cx - 6)} ${f2(cy - 15)} l 6 -5 l 6 5`, stroke: "#4e7a32", "stroke-width": 4, fill: "none" }, t);
          }
          else {
            el("path", { d: "M -84 -8 Q -70 -62 0 -66 Q 70 -62 84 -8 Q 0 4 -84 -8 Z", fill: S.mat("#fbf6e8"), ...OUT, "stroke-width": 3 }, t);
            for (let k = 0; k < 10; k++) el("ellipse", { cx: f2((R0() - 0.5) * 120), cy: f2(-14 - R0() * 40), rx: 4, ry: 2.4, fill: "#e4dcc6" }, t);
            // steam
            for (let k = -1; k <= 1; k++) el("path", { d: `M ${k * 30} -72 q -10 -18 0 -34 q 10 -16 0 -32`, stroke: "#fff", "stroke-width": 5, fill: "none", opacity: 0.45, "stroke-linecap": "round" }, t);
          }
        }
        break;
      }
      case "bowls": // a stack of rice bowls
        for (let i = 0; i < 6; i++) {
          el("path", { d: `M -40 ${-i * 22} Q 0 ${-i * 22 + 34} 40 ${-i * 22} Z`, fill: S.mat("#e9e2d0", true), ...OUT, transform: `translate(${(i % 2) * 6},0)` }, c);
          el("ellipse", { cx: (i % 2) * 6, cy: -i * 22, rx: 40, ry: 9, fill: "#fbf8ef", ...OUT, "stroke-width": 3 }, c);
        }
        break;
      case "armor": // the iron armour, left on the mountain top
        el("path", { d: "M -70 0 L -60 -110 Q 0 -130 60 -110 L 70 0 Q 0 14 -70 0 Z", fill: "url(#iron)", ...OUT }, c);
        for (let r = 0; r < 4; r++) el("path", { d: `M -50 ${-92 + r * 24} q 25 12 50 0 q 25 12 50 0`, stroke: "#b5c0cf", "stroke-width": 3, fill: "none" }, c);
        el("path", { d: "M -40 -112 Q -44 -170 0 -172 Q 44 -170 40 -114 Z", fill: "url(#iron)", ...OUT, transform: "translate(110,96) rotate(30)" }, c);
        break;
      case "banner": { // a war banner on a pole
        el("rect", { x: -7, y: -560, width: 14, height: 560, fill: S.mat("#5a3a22"), ...OUT }, c);
        const flag = g(c, { transform: "translate(7,-550)" });
        el("path", { d: "M 0 0 C 60 -10 110 20 170 6 L 170 120 C 110 134 60 104 0 114 Z", fill: o.color || "#3a2a2a", ...OUT }, flag);
        el("circle", { cx: 85, cy: 60, r: 26, fill: "none", stroke: "#c9a04a", "stroke-width": 6 }, flag);
        S.swaying.push({ node: flag, x: o.x || 0, phase: 1, amp: 0.6 });
        break;
      }
      case "stumps": // bamboo pulled out and broken
        for (let i = 0; i < 6; i++) el("path", { d: `M ${-120 + i * 46} 0 L ${-112 + i * 46} ${-50 - (i % 3) * 30} L ${-100 + i * 46} ${-38 - (i % 3) * 30} L ${-96 + i * 46} 0 Z`, fill: S.mat("#7fa04a"), ...OUT }, c);
        break;
      case "stone":
        el("path", { d: "M -120 0 C -130 -60 -60 -110 10 -100 C 90 -92 130 -40 120 0 Z", fill: S.mat("#8a8478", true), ...OUT }, c);
        break;
      case "fire_pit": // a cooking fire (the flames are drawn by the "embers" effect)
        el("ellipse", { cx: 0, cy: 0, rx: 60, ry: 14, fill: "#3a2a20" }, c);
        for (let i = 0; i < 4; i++) el("rect", { x: -50 + i * 26, y: -14, width: 18, height: 70, rx: 6, fill: S.mat("#6a4a2a"), ...OUT, transform: `rotate(${-50 + i * 34} ${-41 + i * 26} 0)` }, c);
        break;
    }
    return c;
  }

  /**
   * Build a set by name. Options: house / palace position (x) in the back layer, seed.
   *   village  – houses, bamboo and palms, a home stilt house near the action
   *   field    – open paddies and bamboo, no home house
   *   bamboo   – a bamboo grove closing in on both sides
   *   palace   – the king's hall behind the action
   *   mountain – Sóc Sơn rising behind the paddies
   *   sky      – above the clouds (the realm of the immortals)
   */
  function build(S, name, opts = {}) {
    const R = rand(opts.seed ?? 11);
    clouds(S, 8, 21);
    // Only the painting (question channel places: a studio, a beach, a rooftop…) and the objects.
    if (name === "plain") return (opts.objects || []).map((o) => ({ o, node: object(S, o) }));
    if (name === "sky") {
      cloudFloor(S);
      return (opts.objects || []).map((o) => ({ o, node: object(S, o) }));
    }
    // With a painted backdrop the far land, its trees and fields come from the painting; the
    // vector layers keep only what the era decides (the houses) and what is near.
    const painted = !!opts.painted;
    if (!painted) hills(S, 30);
    const mid = S.layer("mid"), village = S.layer("village"), back = S.layer("back");
    // A bamboo grove is drawn by the library even over a painting: the image model cannot
    // paint bamboo (it paints palms), so its painting is only the open land behind.
    const grove = name === "bamboo";
    if (!painted || grove) for (let i = 0; i < 30; i++) bamboo(S, mid, -5000 + i * 460 + R() * 200, 0.55, 100 + i, shade(S.palette.mid[0], -0.1));
    if (name === "mountain" && !painted) mountain(S, opts.mountainX ?? 600, opts.mountainScale ?? 1.2);
    if (name !== "bamboo") {
      for (let i = 0; i < 16; i++) house(S, village, -3600 + i * 880 + R() * 300, 0.42, true);
      if (!painted) for (let i = 0; i < 34; i++) palm(S, village, -3800 + i * 400 + R() * 200, 0.62, 200 + i);
    }
    if (!painted || grove) for (let i = 0; i < 20; i++) bamboo(S, village, -3600 + i * (grove ? 420 : 680) + R() * 300, grove ? 1.2 : 0.82, 300 + i, "#466b3a");
    ground(S, { paddies: name !== "palace" && name !== "bamboo", painted });
    if (name === "village") house(S, back, opts.houseX ?? -640, opts.houseScale ?? 1.3, false);
    if (name === "palace") palace(S, back, opts.palaceX ?? 0, opts.palaceScale ?? 1.4);
    const clumps = grove ? 60 : 14;
    if (opts.bambooLeft !== null) bamboo(S, back, opts.bambooLeft ?? -1050, 1.35, 900, "#3f6634");
    if (opts.bambooRight !== null) bamboo(S, back, opts.bambooRight ?? 1550, 1.4, 901, "#3f6634");
    for (let i = 0; i < clumps; i++) bamboo(S, back, (grove ? -4000 + i * 320 : 2600 + i * 640) + R() * 250, grove ? 1.9 + R() * 0.9 : 1.2 + R() * 0.5, 910 + i, "#3f6634");
    const objects = (opts.objects || []).map((o) => ({ o, node: object(S, o) }));
    frontGrass(S);
    return objects;
  }

  WA.scenery = { build, object, house, boatHouse, thatchHouse, tileHouse, tilePalace, palace, bamboo, palm, mountain };
})();
