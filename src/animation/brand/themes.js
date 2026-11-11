/*
 * More looks for the channel's intro, outro and end card (brand.html, window.params.theme):
 *
 *   sach_truyen  a storybook opens on a lamp-lit table and the name pops up from its pages
 *   den_long     a Mid-Autumn night: lanterns and star lanterns rise, the drum is the moon
 *   mua_roi      the water-puppet pavilion at dusk; chú Tễu comes out on the water
 *   dong_que     countryside: a flute kite with the drum on it flies in over the rice fields
 *   cuon_thu     a scroll unrolls on red lacquer, the name in ink, a red seal stamped
 *
 * Every theme keeps the same timing (intro 3.5 s, outro 5 s with the subscribe click at 2.6 s,
 * end card 2.5 s), so the sounds of brand.ts fit them all. Uses brand.html's helpers.
 */
(function () {
  if (THEME === "trong_dong" || THEME === "ask_huy" || !["intro", "outro", "end"].includes(mode)) return;
  const V = H > W, U = Math.min(W, H);
  const add = (html) => defs.insertAdjacentHTML("beforeend", html);
  const D = P.duration || (mode === "intro" ? 3.5 : mode === "end" ? 2.5 : 5);

  function txt(parent, x, y, size, str, attrs = {}) {
    const t = el("text", { x: f2(x), y: f2(y), "text-anchor": "middle", "font-size": f2(size), "font-weight": 800, ...attrs }, parent);
    t.textContent = str;
    return t;
  }
  /** Text with a thick dark edge, readable on any background. */
  const bold = (parent, x, y, size, str, fill = "#fff6dc", edge = INK) => txt(parent, x, y, size, str, { fill, stroke: edge, "stroke-width": f2(size * 0.14), "stroke-linejoin": "round", "paint-order": "stroke" });

  add(`
    <filter id="tGlow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="tWarm"><stop offset="0" stop-color="#fff3c4" stop-opacity="0.95"/><stop offset="0.45" stop-color="#ffc85a" stop-opacity="0.35"/><stop offset="1" stop-color="#ff9a2a" stop-opacity="0"/></radialGradient>
  `);

  /** The subscribe button and the hand that clicks it (pops at t0, clicked at t0 + 2.2). */
  function subscribe(parent, size) {
    const btn = g(parent), bw = size, bh = size * 0.225;
    const rect = el("rect", { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: bh / 2, fill: "url(#btn)", stroke: INK, "stroke-width": 6 }, btn);
    const label = txt(btn, 0, bh * 0.17, bh * 0.46, T.subscribe, { fill: "#fff" });
    const bell = g(btn);
    el("path", { d: `M 0 ${f2(-bh * 0.38)} C ${f2(bh * 0.28)} ${f2(-bh * 0.38)} ${f2(bh * 0.3)} ${f2(-bh * 0.05)} ${f2(bh * 0.32)} ${f2(bh * 0.2)} L ${f2(bh * 0.4)} ${f2(bh * 0.3)} L ${f2(-bh * 0.4)} ${f2(bh * 0.3)} L ${f2(-bh * 0.32)} ${f2(bh * 0.2)} C ${f2(-bh * 0.3)} ${f2(-bh * 0.05)} ${f2(-bh * 0.28)} ${f2(-bh * 0.38)} 0 ${f2(-bh * 0.38)} Z`, fill: "#ffd25a", stroke: INK, "stroke-width": 5 }, bell);
    el("circle", { cy: f2(bh * 0.4), r: f2(bh * 0.09), fill: "#ffd25a", stroke: INK, "stroke-width": 4 }, bell);
    const hand = g(parent);
    el("path", { d: "M 0 0 L 0 -70 Q 0 -84 12 -84 Q 24 -84 24 -70 L 24 -36 L 54 -30 Q 70 -26 68 -6 L 62 40 Q 58 60 36 60 L 8 60 Q -10 60 -22 40 L -40 6 Q -46 -8 -32 -12 Q -20 -14 -10 0 Z", fill: "#fff", stroke: INK, "stroke-width": 6 }, hand);
    return (t, x, y, t0 = 0.4) => {
      const click = t0 + 2.2, clicked = t > click, pulse = clicked ? 1 : 1 + 0.06 * Math.sin(t * 7);
      tr(btn, x, y, 0, (EASE.backOut(seg(t, t0, t0 + 0.5)) * pulse * (1 - 0.08 * bump(t, click - 0.1, click + 0.15))) || 0.01);
      rect.setAttribute("fill", clicked ? "#8a8a8a" : "url(#btn)");
      label.textContent = clicked ? T.subscribed : T.subscribe;
      tr(bell, bw / 2 + bh * 0.7, 0, clicked ? 18 * Math.sin((t - click) * 18) * Math.exp(-(t - click) * 2) : 0);
      const hk = EASE.inOut(seg(t, t0 + 1.2, t0 + 2.1));
      tr(hand, lerp(W * 1.1, x + bw * 0.1, hk), lerp(H * 1.2, y + bh * 0.35, hk) + 12 * bump(t, click - 0.1, click + 0.15), -20, U / 900);
      hand.setAttribute("opacity", f2(1 - seg(t, t0 + 3, t0 + 3.4)));
    };
  }

  /** Sparks bursting from a point between born and born + 0.6 s. */
  function sparks(layer, t, x, y, born, seed = 3, color = "#fff1b0", spread = U * 0.6) {
    let html = "";
    for (let i = 0; i < 36; i++) {
      const r = rand(seed * 100 + i), b = born + r() * 0.6, age = t - b, life = 1.1;
      if (age < 0 || age > life) continue;
      const a = r() * Math.PI * 2, d = U * 0.05 + (age / life) * spread * (0.4 + r() * 0.6), sz = U * 0.008 * (1 - age / life) + 2;
      html += `<circle cx="${f2(x + Math.cos(a) * d)}" cy="${f2(y + Math.sin(a) * d * 0.8)}" r="${f2(sz)}" fill="${color}" opacity="${f2(1 - age / life)}"/>`;
    }
    layer.innerHTML = html;
  }

  /**
   * The layout every theme shares: the intro shows the emblem with the name and the tagline;
   * the outro puts the emblem on one side, "thanks" on top, the subscribe button on the other
   * side; the end card has the emblem in the middle, "watch the whole story" and "follow".
   */
  function cards(o) {
    const fx = g(svg);
    const top = g(svg), bottom = g(svg), flash = el("rect", { width: W, height: H, fill: o.flash ?? "#fff6d8", opacity: 0 }, svg);
    if (mode === "intro") {
      bold(bottom, W / 2, V ? H * 0.8 : H * 0.92, U * 0.05, B.tagline, o.tagFill ?? "#ffe9a8", o.tagEdge ?? INK);
      return (t) => {
        o.scene(t);
        o.emblem(t, W / 2, o.introY ?? H * 0.45, 1);
        bottom.setAttribute("opacity", f2(seg(t, 2.0, 2.4)));
        if (o.sparkAt !== undefined) sparks(fx, t, W / 2, o.sparkY ?? H * 0.4, o.sparkAt, 5, o.sparkColor);
        flash.setAttribute("opacity", f2(0.9 * seg(t, D - 0.35, D)));
      };
    }
    if (mode === "outro") {
      bold(top, W / 2, H * (V ? 0.14 : 0.15), U * 0.075, T.thanks, o.thanksFill ?? "#fff6dc", o.thanksEdge ?? INK);
      bold(bottom, W / 2, H * (V ? 0.92 : 0.94), U * 0.038, `${B.name} · ${B.tagline}`, o.tagFill ?? "#ffe9a8", o.tagEdge ?? INK);
      const sub = subscribe(svg, U * 0.62);
      return (t) => {
        o.scene(t);
        o.emblem(t, V ? W / 2 : W * 0.3, V ? H * 0.42 : H * 0.55, 0.72);
        top.setAttribute("opacity", f2(seg(t, 0.2, 0.6)));
        bottom.setAttribute("opacity", f2(seg(t, 0.8, 1.2)));
        sub(t, V ? W / 2 : W * 0.7, V ? H * 0.74 : H * 0.55);
      };
    }
    // end
    bold(top, W / 2, V ? H * 0.17 : H * 0.15, U * 0.07, T.watchFull, o.thanksFill ?? "#fff3d6", o.thanksEdge ?? INK);
    bold(bottom, W / 2, V ? H * 0.85 : H * 0.92, U * 0.055, T.follow, o.tagFill ?? "#ffd27a", o.tagEdge ?? INK);
    return (t) => {
      o.scene(t);
      o.emblem(t, W / 2, V ? H * 0.5 : H * 0.53, V ? 0.9 : 0.78);
      top.setAttribute("opacity", f2(seg(t, 0.2, 0.5)));
      bottom.setAttribute("opacity", f2(seg(t, 0.45, 0.8)));
    };
  }
  /** How far an emblem has come in: intros build up over time; outros and end cards pop. */
  const built = (t, a, b) => (mode === "intro" ? seg(t, a, b) : 1);
  const popIn = (t) => (mode === "intro" ? 1 : EASE.backOut(seg(t, 0, 0.6)) || 0.01);

  const THEMES = {
    /* ---------------------------------------------------------------- the storybook */
    sach_truyen() {
      add(`
        <radialGradient id="sLamp" cx="0.5" cy="0.38" r="0.85"><stop offset="0" stop-color="#fff2d2"/><stop offset="0.55" stop-color="#f0c27a"/><stop offset="1" stop-color="#9c5e22"/></radialGradient>
        <linearGradient id="sCover" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8402e"/><stop offset="1" stop-color="#871810"/></linearGradient>
        <linearGradient id="sPageR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#dcc79a"/><stop offset="0.1" stop-color="#fbf2dc"/><stop offset="1" stop-color="#f3e3bd"/></linearGradient>
        <linearGradient id="sPageL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#dcc79a"/><stop offset="0.1" stop-color="#fbf2dc"/><stop offset="1" stop-color="#f3e3bd"/></linearGradient>`);
      el("rect", { width: W, height: H, fill: "url(#sLamp)" }, svg);
      // The table's edge and its wood grain.
      el("rect", { y: H * 0.8, width: W, height: H * 0.2, fill: "#7a4a22" }, svg);
      for (let i = 0; i < 6; i++) el("path", { d: `M 0 ${f2(H * (0.83 + i * 0.03))} C ${f2(W * 0.3)} ${f2(H * (0.82 + i * 0.03))} ${f2(W * 0.6)} ${f2(H * (0.85 + i * 0.03))} ${W} ${f2(H * (0.83 + i * 0.03))}`, fill: "none", stroke: "#5e3616", "stroke-width": 3, opacity: 0.5 }, svg);
      const motes = g(svg);
      const pw = V ? W * 0.4 : H * 0.42, ph = pw * 1.32;
      const book = g(svg);
      el("ellipse", { cy: ph * 0.52, rx: pw * 1.15, ry: ph * 0.06, fill: "#3a1e08", opacity: 0.35 }, book);
      const back = el("rect", { x: -pw - 10, y: -ph / 2 - 10, width: pw * 2 + 20, height: ph + 20, rx: 14, fill: "#6e130c", stroke: INK, "stroke-width": 5 }, book);
      for (let i = 3; i >= 1; i--) el("rect", { x: 0, y: -ph / 2 + i * 2, width: pw + i * 3, height: ph - i * 4, fill: "#efe0bb", stroke: "#b89a6a", "stroke-width": 1.5 }, book);
      el("rect", { x: 0, y: -ph / 2, width: pw, height: ph, fill: "url(#sPageR)", stroke: "#a88a5a", "stroke-width": 2 }, book);
      // The cover: its outside while it turns on the right, its inside (endpaper) on the left.
      const cover = g(book);
      const coverOut = el("rect", { y: -ph / 2 - 6, height: ph + 12, rx: 10, fill: "url(#sCover)", stroke: INK, "stroke-width": 5 }, cover);
      const coverIn = el("rect", { y: -ph / 2, height: ph, fill: "url(#sPageL)", stroke: "#a88a5a", "stroke-width": 2 }, cover);
      const deco = g(cover); // the cover's gold frame and drum, squeezed with it
      el("rect", { x: pw * 0.08, y: -ph * 0.44, width: pw * 0.84, height: ph * 0.88, rx: 8, fill: "none", stroke: "#f2c45a", "stroke-width": 4 }, deco);
      spin(logo(g(deco, { transform: `translate(${f2(pw / 2)},${f2(-ph * 0.08)})` }), pw * 0.28, false), 0.4);
      txt(deco, pw / 2, ph * 0.3, pw * 0.12, B.name, { fill: "#ffe7a0" });
      // What pops up from the opened pages: the drum and the name on a ribbon.
      const pop = g(book);
      const emb = logo(g(pop, { transform: `translate(0,${f2(-ph * 0.12)})` }), pw * 0.36, false);
      const rib = g(pop, { transform: `translate(0,${f2(ph * 0.24)})` });
      el("path", { d: `M ${f2(-pw * 1.05)} ${f2(-pw * 0.13)} L ${f2(pw * 1.05)} ${f2(-pw * 0.13)} L ${f2(pw * 0.96)} 0 L ${f2(pw * 1.05)} ${f2(pw * 0.13)} L ${f2(-pw * 1.05)} ${f2(pw * 0.13)} L ${f2(-pw * 0.96)} 0 Z`, fill: "url(#ribbon)", stroke: INK, "stroke-width": 5 }, rib);
      bold(rib, 0, pw * 0.065, pw * 0.17, B.name);
      return cards({
        introY: H * 0.43, sparkAt: 1.5, sparkY: H * 0.35,
        scene(t) {
          let html = "";
          for (let i = 0; i < 28; i++) { const r = rand(40 + i), x = r() * W, y = H - ((t * (20 + r() * 30) + r() * H) % H); html += `<circle cx="${f2(x + 10 * Math.sin(t + i))}" cy="${f2(y)}" r="${f2(1.5 + r() * 2.5)}" fill="#fff6dc" opacity="${f2(0.25 + 0.3 * r())}"/>`; }
          motes.innerHTML = html;
        },
        emblem(t, x, y, s) {
          const k = EASE.inOut(built(t, 0.7, 1.45)), fly = mode === "intro" ? EASE.backOut(seg(t, 0, 0.7)) : popIn(t);
          // Closed, the book is centred on its cover; open, on its spine.
          tr(book, x - (pw / 2) * (1 - k) * s, y + (1 - fly) * H * 0.3, 0, Math.max(0.01, s * lerp(0.3, 1, fly)));
          back.setAttribute("opacity", f2(seg(k, 0.5, 0.52)));
          const w = pw * Math.cos(Math.PI * k);
          coverOut.setAttribute("x", "0"); coverOut.setAttribute("width", f2(Math.max(0, w)));
          coverOut.setAttribute("display", w > 0 ? "inline" : "none");
          coverIn.setAttribute("x", f2(Math.min(0, w))); coverIn.setAttribute("width", f2(Math.max(0, -w)));
          coverIn.setAttribute("display", w < 0 ? "inline" : "none");
          deco.setAttribute("transform", `scale(${f2(Math.max(0.001, w / pw))},1)`);
          deco.setAttribute("display", w > 0 ? "inline" : "none");
          const p = EASE.backOut(built(t, 1.35, 1.95));
          pop.setAttribute("transform", `translate(0,${f2(ph * 0.3 * (1 - p))}) scale(${f2(Math.max(0.01, p))})`);
          pop.setAttribute("opacity", f2(built(t, 1.35, 1.5)));
          spin(emb, t, 0.6);
        },
      });
    },

    /* --------------------------------------------------------- the lantern night */
    den_long() {
      add(`
        <linearGradient id="lSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a26"/><stop offset="0.6" stop-color="#231c4e"/><stop offset="1" stop-color="#5a2a4a"/></linearGradient>
        <radialGradient id="lRed" cx="0.45" cy="0.4"><stop offset="0" stop-color="#fff0a0"/><stop offset="0.35" stop-color="#ffb02e"/><stop offset="1" stop-color="#c8261a"/></radialGradient>
        <radialGradient id="lGold" cx="0.45" cy="0.4"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.4" stop-color="#ffd25a"/><stop offset="1" stop-color="#e07a12"/></radialGradient>
        <radialGradient id="lMoon"><stop offset="0" stop-color="#fff8d8" stop-opacity="0.9"/><stop offset="0.5" stop-color="#ffe9a8" stop-opacity="0.25"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>`);
      el("rect", { width: W, height: H, fill: "url(#lSky)" }, svg);
      const stars = g(svg), R = rand(8);
      const st = Array.from({ length: 110 }, () => ({ x: R() * W, y: R() * H * 0.75, r: 0.8 + R() * 2, p: R() * 6 }));
      const starNodes = st.map((s) => el("circle", { cx: f2(s.x), cy: f2(s.y), r: f2(s.r), fill: "#fff8e0" }, stars));
      const lan = g(svg); // behind the moon and the name
      const moon = g(svg);
      el("circle", { r: U * 0.36, fill: "url(#lMoon)" }, moon);
      const face = logo(moon, U * 0.19, false);
      const name = bold(g(svg), 0, 0, U * 0.105, B.name, "#ffe9a0", "#5a1a08");
      name.setAttribute("filter", "url(#tGlow)");
      // Lanterns: round paper lanterns and the five-pointed star lanterns of Tết Trung thu.
      const L = Array.from({ length: 16 }, (_, i) => {
        const r = rand(300 + i), star = i % 4 === 1, s = (U / 1080) * (0.55 + r() * 0.75);
        const node = g(lan), body = g(node);
        el("circle", { r: 110, fill: "url(#tWarm)", opacity: 0.55 }, body);
        if (star) {
          let d = "";
          for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 26 : 62; d += `${k ? "L" : "M"} ${f2(Math.cos(a) * rr)} ${f2(Math.sin(a) * rr)} `; }
          el("path", { d: d + "Z", fill: "url(#lGold)", stroke: "#8a2a0a", "stroke-width": 3, "stroke-linejoin": "round" }, body);
          el("path", { d: "M 0 40 L 0 95", stroke: "#c8261a", "stroke-width": 4 }, body);
        } else {
          el("ellipse", { rx: 46, ry: 54, fill: "url(#lRed)", stroke: "#7a1a0a", "stroke-width": 3 }, body);
          for (const k of [-0.55, 0, 0.55]) el("ellipse", { rx: f2(46 * Math.abs(k) || 1), ry: 54, fill: "none", stroke: "#a8200f", "stroke-width": 2, opacity: k ? 0.6 : 0 }, body);
          el("line", { x1: 0, y1: -54, x2: 0, y2: 54, stroke: "#a8200f", "stroke-width": 2, opacity: 0.6 }, body);
          for (const y of [-58, 52]) el("rect", { x: -20, y, width: 40, height: 10, rx: 3, fill: "#e8b93a", stroke: "#7a4a0a", "stroke-width": 2 }, body);
          el("path", { d: "M 0 62 L 0 100 M -6 100 L 0 112 L 6 100", stroke: "#e8b93a", "stroke-width": 4, fill: "none" }, body);
        }
        return { node, s, x: (i / 16 + (r() - 0.5) * 0.05) * W + W / 32, v: H * (0.16 + r() * 0.2), y0: H * (mode === "intro" ? 1.1 + r() * 0.5 : r() * 1.4 - 0.1), ph: r() * 6, amp: 10 + r() * 22 };
      });
      return cards({
        introY: H * 0.34, tagFill: "#ffe9a8",
        scene(t) {
          st.forEach((s, i) => starNodes[i].setAttribute("opacity", f2(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2 + s.p)))));
          for (const l of L) {
            let y = l.y0 - t * l.v;
            if (mode !== "intro") y = ((y + H * 0.2) % (H * 1.4) + H * 1.4) % (H * 1.4) - H * 0.2;
            tr(l.node, l.x + Math.sin(t * 1.3 + l.ph) * l.amp, y, 6 * Math.sin(t * 1.1 + l.ph), l.s);
          }
        },
        emblem(t, x, y, s) {
          const k = EASE.out(built(t, 0.2, 1.3));
          tr(moon, x, y + (1 - k) * H * 0.25, 0, Math.max(0.01, s * popIn(t)));
          moon.setAttribute("opacity", f2(k));
          spin(face, t, 0.3);
          const n = EASE.backOut(built(t, 1.1, 1.7));
          name.setAttribute("transform", `translate(${f2(x)},${f2(y + U * 0.33 * s)}) scale(${f2(Math.max(0.01, s * n * popIn(t)))})`);
          name.setAttribute("opacity", f2(built(t, 1.1, 1.3)));
        },
      });
    },

    /* --------------------------------------------------- the water-puppet pavilion */
    mua_roi() {
      add(`
        <linearGradient id="mSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262a5e"/><stop offset="0.55" stop-color="#8a4a72"/><stop offset="1" stop-color="#f0985a"/></linearGradient>
        <linearGradient id="mWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d7f86"/><stop offset="1" stop-color="#12343f"/></linearGradient>
        <linearGradient id="mRoof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3a2a"/><stop offset="1" stop-color="#3a1a10"/></linearGradient>
        <linearGradient id="mSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd9ae"/><stop offset="1" stop-color="#e8a874"/></linearGradient>`);
      el("rect", { width: W, height: H, fill: "url(#mSky)" }, svg);
      const WL = H * 0.7; // the water line
      const stage = g(svg); // pavilion and Tễu, placed by the emblem
      const S = U / 1080, PW = 760 * S, PH = 300 * S;
      const pav = g(stage);
      // Pillars, the dark stage behind the bamboo blind, the roof with upturned eaves.
      el("rect", { x: -PW / 2, y: -PH, width: PW, height: PH + 40 * S, fill: "#2a1208" }, pav);
      el("ellipse", { cx: 0, cy: -PH * 0.45, rx: PW * 0.4, ry: PH * 0.5, fill: "url(#tWarm)", opacity: 0.45 }, pav);
      const blind = g(pav);
      el("rect", { x: -PW * 0.42, y: -PH * 0.86, width: PW * 0.84, height: PH * 0.86, fill: "#c9a25a", stroke: "#6a4a1a", "stroke-width": 3 }, blind);
      for (let i = 1; i < 22; i++) el("line", { x1: -PW * 0.42, y1: f2(-PH * 0.86 + i * PH * 0.039), x2: PW * 0.42, y2: f2(-PH * 0.86 + i * PH * 0.039), stroke: "#8a6a2a", "stroke-width": 2, opacity: 0.7 }, blind);
      for (const x of [-0.5, -0.43, 0.43, 0.5]) el("rect", { x: f2(PW * x - 12 * S), y: -PH, width: 24 * S, height: PH + 60 * S, fill: "#b3261e", stroke: INK, "stroke-width": 3 }, pav);
      el("rect", { x: -PW * 0.56, y: -PH - 24 * S, width: PW * 1.12, height: 28 * S, fill: "#7a1a10", stroke: INK, "stroke-width": 3 }, pav);
      const roof = (y, w, h) => `M ${f2(-w / 2 - 70 * S)} ${f2(y - 40 * S)} Q ${f2(-w / 2)} ${f2(y)} ${f2(-w / 2 + 30 * S)} ${f2(y)} L ${f2(w / 2 - 30 * S)} ${f2(y)} Q ${f2(w / 2)} ${f2(y)} ${f2(w / 2 + 70 * S)} ${f2(y - 40 * S)} L ${f2(w * 0.32)} ${f2(y - h)} L ${f2(-w * 0.32)} ${f2(y - h)} Z`;
      el("path", { d: roof(-PH - 20 * S, PW * 1.2, 120 * S), fill: "url(#mRoof)", stroke: INK, "stroke-width": 4, "stroke-linejoin": "round" }, pav);
      el("rect", { x: -PW * 0.34, y: -PH - 175 * S, width: PW * 0.68, height: 40 * S, fill: "#7a1a10", stroke: INK, "stroke-width": 3 }, pav);
      el("path", { d: roof(-PH - 160 * S, PW * 0.78, 110 * S), fill: "url(#mRoof)", stroke: INK, "stroke-width": 4, "stroke-linejoin": "round" }, pav);
      const ridge = logo(g(pav, { transform: `translate(0,${f2(-PH - 300 * S)})` }), 42 * S, false);
      // The board under the eaves (hoành phi) with the channel's name in gold.
      const board = g(pav, { transform: `translate(0,${f2(-PH - 98 * S)})` });
      el("rect", { x: -PW * 0.36, y: -46 * S, width: PW * 0.72, height: 92 * S, rx: 8, fill: "#9a1c12", stroke: "#f2c45a", "stroke-width": 5 }, board);
      const clipId = "mBoardClip", clipRect = el("rect", { x: -PW * 0.36, y: -50 * S, height: 100 * S, width: 0 }, el("clipPath", { id: clipId }, defs));
      txt(g(board, { "clip-path": `url(#${clipId})` }), 0, 22 * S, 62 * S, B.name, { fill: "#ffe08a", stroke: "#5a1008", "stroke-width": 4 * S, "paint-order": "stroke" });
      // Chú Tễu: round belly, a tuft of hair, a red loincloth, waving.
      const teu = g(stage), tb = g(teu);
      const armL = g(tb, { transform: `translate(${-52 * S},${-150 * S})` }), armR = g(tb, { transform: `translate(${52 * S},${-150 * S})` });
      for (const [a, sx] of [[armL, -1], [armR, 1]]) {
        el("path", { d: `M 0 0 Q ${f2(sx * 40 * S)} ${f2(-30 * S)} ${f2(sx * 62 * S)} ${f2(-80 * S)}`, stroke: INK, "stroke-width": 30 * S, fill: "none", "stroke-linecap": "round" }, a);
        el("path", { d: `M 0 0 Q ${f2(sx * 40 * S)} ${f2(-30 * S)} ${f2(sx * 62 * S)} ${f2(-80 * S)}`, stroke: "#f2bf8c", "stroke-width": 22 * S, fill: "none", "stroke-linecap": "round" }, a);
      }
      el("ellipse", { cx: 0, cy: -100 * S, rx: 72 * S, ry: 80 * S, fill: "url(#mSkin)", stroke: INK, "stroke-width": 4 }, tb);
      el("path", { d: `M ${-70 * S} ${-50 * S} Q 0 ${-20 * S} ${70 * S} ${-50 * S} L ${66 * S} ${-10 * S} L ${-66 * S} ${-10 * S} Z`, fill: "#c8261a", stroke: INK, "stroke-width": 4 }, tb);
      el("circle", { cy: -230 * S, r: 70 * S, fill: "url(#mSkin)", stroke: INK, "stroke-width": 4 }, tb);
      el("path", { d: `M ${-14 * S} ${-296 * S} Q 0 ${-330 * S} ${16 * S} ${-298 * S} Q ${4 * S} ${-288 * S} ${-14 * S} ${-296 * S} Z`, fill: "#1a0e08" }, tb);
      for (const sx of [-1, 1]) {
        el("path", { d: `M ${f2(sx * 34 * S - 13 * S)} ${-238 * S} Q ${f2(sx * 34 * S)} ${-252 * S} ${f2(sx * 34 * S + 13 * S)} ${-238 * S}`, stroke: INK, "stroke-width": 5 * S, fill: "none", "stroke-linecap": "round" }, tb);
        el("circle", { cx: f2(sx * 46 * S), cy: -212 * S, r: 12 * S, fill: "#f08a7a", opacity: 0.7 }, tb);
      }
      el("path", { d: `M ${-30 * S} ${-205 * S} Q 0 ${-168 * S} ${30 * S} ${-205 * S} Z`, fill: "#8a1a10", stroke: INK, "stroke-width": 4 * S }, tb);
      const splash = g(stage);
      // Water in front (hides Tễu below the waist and the pavilion's stilts), with ripples.
      el("rect", { y: WL, width: W, height: H - WL, fill: "url(#mWater)" }, svg);
      const ripples = g(svg);
      return cards({
        introY: WL, tagFill: "#ffe9a8",
        scene(t) {
          let html = "";
          for (let i = 0; i < 14; i++) { const y = WL + 12 + i * (H - WL) / 14, ph = t * (0.6 + i * 0.05) + i; html += `<path d="M 0 ${f2(y)} ${Array.from({ length: 13 }, (_, k) => `Q ${f2(W * (k + 0.5) / 12)} ${f2(y + 5 * Math.sin(ph + k))} ${f2(W * (k + 1) / 12)} ${f2(y)}`).join(" ")}" stroke="#9fd0d4" stroke-width="2" fill="none" opacity="${f2(0.15 + 0.2 * (i / 14))}"/>`; }
          ripples.innerHTML = html;
        },
        emblem(t, x, y, s) {
          const ss = s * popIn(t);
          tr(stage, x, WL, 0, Math.max(0.01, ss)); // always standing in the water
          stage.setAttribute("opacity", f2(mode === "intro" ? seg(t, 0, 0.5) : 1));
          spin(ridge, t, 0.5);
          // Tễu comes out from behind the blind and rises from the water, then waves.
          const k = EASE.backOut(built(t, 0.6, 1.3));
          tr(teu, PW * 0.0, lerp(260 * S, 70 * S, k), 0, lerp(0.6, 1, k));
          const wave = Math.sin(t * 9) * 18 * seg(t, 1.2, 1.4);
          armL.setAttribute("transform", `translate(${-52 * S},${-150 * S}) rotate(${f2(-wave)})`);
          armR.setAttribute("transform", `translate(${52 * S},${-150 * S}) rotate(${f2(wave)})`);
          clipRect.setAttribute("width", f2(PW * 0.72 * EASE.inOut(built(t, 1.2, 1.9))));
          if (mode === "intro") {
            let html = "";
            for (let i = 0; i < 26; i++) {
              const r = rand(60 + i), age = t - 0.65 - r() * 0.15;
              if (age < 0 || age > 0.9) continue;
              const vx = (r() - 0.5) * 520 * S, vy = -(300 + r() * 380) * S;
              html += `<circle cx="${f2(vx * age)}" cy="${f2(40 * S + vy * age + 900 * S * age * age)}" r="${f2((5 + r() * 7) * S)}" fill="#cfeef0" opacity="${f2(1 - age / 0.9)}"/>`;
            }
            splash.innerHTML = html;
          }
        },
      });
    },

    /* ------------------------------------------------ the kite over the rice fields */
    dong_que() {
      add(`
        <linearGradient id="qSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e94d8"/><stop offset="0.7" stop-color="#a8d8f0"/><stop offset="1" stop-color="#e8f6fb"/></linearGradient>
        <linearGradient id="qKite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf4a"/><stop offset="0.55" stop-color="#f08a2a"/><stop offset="1" stop-color="#c8361a"/></linearGradient>`);
      el("rect", { width: W, height: H, fill: "url(#qSky)" }, svg);
      const sun = g(svg, { transform: `translate(${f2(W * 0.84)},${f2(H * 0.16)})` });
      el("circle", { r: U * 0.22, fill: "url(#tWarm)" }, sun);
      el("circle", { r: U * 0.06, fill: "#fff6c8" }, sun);
      const clouds = g(svg);
      const C = Array.from({ length: 5 }, (_, i) => { const r = rand(70 + i), c = g(clouds); for (let k = 0; k < 4; k++) el("ellipse", { cx: k * 60 - 90, cy: (k % 2) * -22, rx: 70 + r() * 30, ry: 34 + r() * 14, fill: "#fff", opacity: 0.9 }, c); return { c, x: r() * W, y: H * (0.08 + r() * 0.3), v: 8 + r() * 14, s: (U / 1080) * (0.6 + r() * 0.6) }; });
      // Hills, rice fields in bands, bamboo at the sides, a boy on a buffalo on the dike.
      el("path", { d: `M 0 ${f2(H * 0.66)} Q ${f2(W * 0.2)} ${f2(H * 0.55)} ${f2(W * 0.4)} ${f2(H * 0.64)} Q ${f2(W * 0.6)} ${f2(H * 0.52)} ${f2(W * 0.8)} ${f2(H * 0.63)} Q ${f2(W * 0.92)} ${f2(H * 0.58)} ${W} ${f2(H * 0.62)} L ${W} ${H} L 0 ${H} Z`, fill: "#7fb06a" }, svg);
      ["#9cc95a", "#86b84a", "#a9d26a", "#78aa3e", "#93c454", "#6e9e36"].forEach((c, i) => el("rect", { y: f2(H * (0.68 + i * 0.055)), width: W, height: f2(H * 0.06), fill: c }, svg));
      const sil = g(svg, { transform: `translate(${f2(W * 0.18)},${f2(H * 0.68)}) scale(${f2(U / 1080)})`, fill: "#2f4a22" });
      el("path", { d: "M -60 0 L -55 -30 Q -50 -50 -20 -52 L 40 -52 Q 62 -50 66 -34 L 80 -40 Q 88 -36 82 -26 L 70 -20 L 66 0 L 56 0 L 54 -18 L -40 -18 L -44 0 Z" }, sil);
      el("path", { d: "M 4 -52 L 0 -78 Q 2 -92 14 -90 Q 22 -86 18 -74 L 22 -52 Z" }, sil);
      el("circle", { cx: 8, cy: -98, r: 9 }, sil);
      for (const [x, f] of [[W * 0.03, 1], [W * 0.97, -1]]) {
        const b = g(svg, { transform: `translate(${f2(x)},${f2(H * 0.72)}) scale(${f2((f * U) / 1080)},${f2(U / 1080)})` });
        for (let k = 0; k < 7; k++) el("path", { d: `M ${k * 14 - 40} 0 Q ${k * 18 - 30} -260 ${k * 30 + 10} -${380 + k * 20}`, stroke: "#3f7a2a", "stroke-width": 9, fill: "none" }, b);
        for (let k = 0; k < 18; k++) { const r = rand(90 + k); el("ellipse", { cx: f2(r() * 220 - 40), cy: f2(-120 - r() * 300), rx: 46, ry: 12, fill: "#4f8f36", transform: `rotate(${f2(r() * 60 - 30)} ${f2(r() * 220 - 40)} ${f2(-120 - r() * 300)})` }, b); }
      }
      const string = el("path", { fill: "none", stroke: "#fff8e8", "stroke-width": 2, opacity: 0.85 }, svg);
      // The flute kite (diều sáo): wide curved wings, bamboo ribs, the drum in the middle.
      const kite = g(svg), KW = (V ? W * 0.62 : H * 0.6);
      const tails = el("path", { fill: "none", stroke: "#c8261a", "stroke-width": 8, "stroke-linecap": "round" }, kite);
      const tails2 = el("path", { fill: "none", stroke: "#ffcf4a", "stroke-width": 6, "stroke-linecap": "round" }, kite);
      el("path", { d: `M ${f2(-KW / 2)} 0 Q ${f2(-KW / 4)} ${f2(-KW * 0.24)} 0 ${f2(-KW * 0.1)} Q ${f2(KW / 4)} ${f2(-KW * 0.24)} ${f2(KW / 2)} 0 Q ${f2(KW / 4)} ${f2(KW * 0.04)} 0 ${f2(KW * 0.13)} Q ${f2(-KW / 4)} ${f2(KW * 0.04)} ${f2(-KW / 2)} 0 Z`, fill: "url(#qKite)", stroke: INK, "stroke-width": 5, "stroke-linejoin": "round" }, kite);
      el("path", { d: `M ${f2(-KW / 2)} 0 Q 0 ${f2(-KW * 0.06)} ${f2(KW / 2)} 0 M 0 ${f2(-KW * 0.1)} L 0 ${f2(KW * 0.13)}`, stroke: "#7a4a1a", "stroke-width": 4, fill: "none" }, kite);
      for (const sx of [-1, 1]) el("rect", { x: f2(sx * KW * 0.08 - 12), y: f2(-KW * 0.2), width: 24, height: f2(KW * 0.08), rx: 10, fill: "#d8b070", stroke: INK, "stroke-width": 3 }, kite);
      const kf = logo(g(kite, { transform: `translate(0,${f2(KW * 0.0)})` }), KW * 0.1, false);
      const banner = g(kite);
      el("path", { d: `M ${f2(-KW * 0.06)} ${f2(KW * 0.13)} L ${f2(-KW * 0.5)} ${f2(KW * 0.3)} M ${f2(KW * 0.06)} ${f2(KW * 0.13)} L ${f2(KW * 0.5)} ${f2(KW * 0.3)}`, stroke: "#fff8e8", "stroke-width": 2 }, banner);
      const rib = g(banner, { transform: `translate(0,${f2(KW * 0.38)})` });
      el("path", { d: `M ${f2(-KW * 0.62)} ${f2(-KW * 0.08)} L ${f2(KW * 0.62)} ${f2(-KW * 0.08)} L ${f2(KW * 0.55)} 0 L ${f2(KW * 0.62)} ${f2(KW * 0.08)} L ${f2(-KW * 0.62)} ${f2(KW * 0.08)} L ${f2(-KW * 0.55)} 0 Z`, fill: "url(#ribbon)", stroke: INK, "stroke-width": 5 }, rib);
      bold(rib, 0, KW * 0.04, KW * 0.105, B.name);
      return cards({
        introY: H * 0.3, tagFill: "#fff6dc",
        scene(t) {
          for (const c of C) tr(c.c, ((c.x + t * c.v) % (W + 400)) - 200, c.y, 0, c.s);
        },
        emblem(t, x, y, s) {
          const k = EASE.out(built(t, 0, 1.4));
          const kx = lerp(-KW, x, k), ky = lerp(H * 1.1, y, EASE.inOut(built(t, 0, 1.4))) + Math.sin(t * 2.2) * U * 0.012;
          tr(kite, kx, ky, (1 - k) * -25 + 4 * Math.sin(t * 1.7), Math.max(0.01, s * popIn(t)));
          let d = "", d2 = "";
          for (let i = 0; i <= 12; i++) { const u = i / 12, yy = KW * 0.13 + u * KW * 0.9, xx = Math.sin(t * 5 - u * 6) * KW * 0.05 * u; d += `${i ? "L" : "M"} ${f2(xx - KW * 0.03)} ${f2(yy)} `; d2 += `${i ? "L" : "M"} ${f2(xx + KW * 0.03)} ${f2(yy)} `; }
          tails.setAttribute("d", d); tails2.setAttribute("d", d2);
          const b = EASE.backOut(built(t, 1.3, 1.9));
          banner.setAttribute("transform", `scale(1,${f2(Math.max(0.01, b))})`);
          spin(kf, t, 0.4);
          string.setAttribute("d", `M ${f2(kx)} ${f2(ky + KW * 0.13 * s)} Q ${f2(lerp(kx, -W * 0.1, 0.5))} ${f2(lerp(ky, H * 1.2, 0.3))} ${f2(-W * 0.1)} ${f2(H * 1.2)}`);
        },
      });
    },

    /* ------------------------------------------------------- the scroll and the seal */
    cuon_thu() {
      add(`
        <radialGradient id="cBg" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="#5e1610"/><stop offset="1" stop-color="#140402"/></radialGradient>
        <linearGradient id="cPaper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7ead0"/><stop offset="1" stop-color="#ead7ae"/></linearGradient>
        <linearGradient id="cWood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1206"/><stop offset="0.5" stop-color="#7a4a22"/><stop offset="1" stop-color="#2a1206"/></linearGradient>`);
      el("rect", { width: W, height: H, fill: "url(#cBg)" }, svg);
      // Gold cloud scrolls (mây) and a double gold frame, as on lacquered boards.
      const R = rand(12);
      for (let i = 0; i < 16; i++) {
        const x = R() * W, y = R() * H, s = (U / 1080) * (0.6 + R() * 0.8);
        el("path", { d: "M -60 0 C -60 -30 -20 -30 -20 -6 C -20 -40 30 -40 30 -6 C 30 -30 70 -24 64 2 C 60 18 40 18 36 6 M -60 0 C -60 14 -40 18 -32 8", fill: "none", stroke: "#e8b93a", "stroke-width": 4, opacity: 0.22, transform: `translate(${f2(x)},${f2(y)}) scale(${f2(s)})` }, svg);
      }
      el("rect", { x: U * 0.03, y: U * 0.03, width: W - U * 0.06, height: H - U * 0.06, fill: "none", stroke: "#e8b93a", "stroke-width": 4, opacity: 0.7 }, svg);
      el("rect", { x: U * 0.045, y: U * 0.045, width: W - U * 0.09, height: H - U * 0.09, fill: "none", stroke: "#e8b93a", "stroke-width": 1.5, opacity: 0.6 }, svg);
      const SW = V ? W * 0.84 : W * 0.6, SH = SW * (V ? 0.6 : 0.4), RW = U * 0.04;
      const scroll = g(svg);
      const clipId = "cPaperClip", clip = el("rect", { y: -SH / 2, height: SH }, el("clipPath", { id: clipId }, defs));
      const paper = g(scroll, { "clip-path": `url(#${clipId})` });
      el("rect", { x: -SW / 2, y: -SH / 2, width: SW, height: SH, fill: "url(#cPaper)" }, paper);
      el("rect", { x: -SW / 2 + SW * 0.04, y: -SH / 2 + SH * 0.08, width: SW * 0.92, height: SH * 0.84, fill: "none", stroke: "#b3261e", "stroke-width": 3, opacity: 0.6 }, paper);
      const words = g(paper);
      txt(words, 0, SH * 0.09 - (mode === "intro" ? SH * 0.06 : 0), SH * 0.26, B.name, { fill: "#8a1c14" });
      if (mode === "intro") txt(words, 0, SH * 0.27, SH * 0.075, B.tagline, { fill: "#6a3a1a", "font-weight": 700 });
      const wordsClip = "cWordsClip", wc = el("rect", { x: -SW / 2, y: -SH / 2, height: SH, width: 0 }, el("clipPath", { id: wordsClip }, defs));
      words.setAttribute("clip-path", `url(#${wordsClip})`);
      // The red seal: the drum's star cut into a square stamp.
      const seal = g(paper, { transform: `translate(${f2(SW * 0.38)},${f2(SH * 0.28)})` }), sz = SH * 0.2;
      const sealIn = g(seal);
      el("rect", { x: -sz / 2, y: -sz / 2, width: sz, height: sz, rx: sz * 0.12, fill: "#c0261a", opacity: 0.92 }, sealIn);
      el("rect", { x: -sz * 0.42, y: -sz * 0.42, width: sz * 0.84, height: sz * 0.84, rx: sz * 0.08, fill: "none", stroke: "#f7ead0", "stroke-width": 2.5 }, sealIn);
      let st = "";
      for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2 - Math.PI / 2, rr = sz * (i % 2 ? 0.1 : 0.32); st += `${i ? "L" : "M"} ${f2(Math.cos(a) * rr)} ${f2(Math.sin(a) * rr)} `; }
      el("path", { d: st + "Z", fill: "#f7ead0" }, sealIn);
      const rollers = [g(scroll), g(scroll)];
      for (const r of rollers) {
        el("rect", { x: -RW / 2, y: -SH * 0.56, width: RW, height: SH * 1.12, rx: RW * 0.4, fill: "url(#cWood)", stroke: INK, "stroke-width": 3 }, r);
        for (const y of [-SH * 0.6, SH * 0.6]) el("circle", { cy: f2(y), r: RW * 0.62, fill: "#e8b93a", stroke: INK, "stroke-width": 3 }, r);
      }
      const gold = g(svg);
      return cards({
        introY: H * 0.45, sparkAt: undefined,
        scene() {},
        emblem(t, x, y, s) {
          // The outro's scroll sits high (the button goes under it); the end card's in the middle.
          if (mode === "outro" && !V) s = 0.6; // leave room for the button
          const k = EASE.inOut(built(t, 0.3, 1.3)), w = SW * lerp(0.02, 1, k);
          tr(scroll, x, y, 0, Math.max(0.01, s * (mode === "intro" ? EASE.backOut(seg(t, 0, 0.3)) : popIn(t))));
          clip.setAttribute("x", f2(-w / 2)); clip.setAttribute("width", f2(w));
          tr(rollers[0], -w / 2 - RW * 0.3, 0); tr(rollers[1], w / 2 + RW * 0.3, 0);
          wc.setAttribute("width", f2(SW * EASE.inOut(built(t, 0.9, 1.6))));
          const stamp = built(t, 1.72, 1.86);
          tr(sealIn, 0, 0, -6, lerp(1.8, 1, EASE.out(stamp)));
          sealIn.setAttribute("opacity", f2(mode === "intro" ? stamp : 1));
          if (mode === "intro") sparks(gold, t, x + SW * 0.38 * s, y + SH * 0.28 * s, 1.78, 9, "#ffd25a", U * 0.4);
        },
      });
    },
  };

  render = (THEMES[THEME] || THEMES.sach_truyen)();
})();
