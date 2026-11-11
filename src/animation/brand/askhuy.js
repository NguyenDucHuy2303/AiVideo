/*
 * The look of the "Ask Huy" channel (brand theme "ask_huy", assets/brand/ask-huy/brand.json):
 * a white speech bubble with a big yellow question mark, the name in chunky letters, on a
 * bright sky full of drifting question marks. Every mode of brand.html: logo (transparent),
 * intro (3.5 s), outro (5 s, the subscribe click at 2.6 s), end (a short's card, 2.5 s) and
 * thumb (a frame of the film with the question). Uses brand.html's helpers and texts.
 */
(function () {
  if (THEME !== "ask_huy") return;
  // brand.html has already drawn its drum face for some modes: start from a clean page.
  for (const n of [...svg.childNodes]) if (n !== defs) n.remove();
  const V = H > W, U = Math.min(W, H), DARK = "#1d3557", YELLOW = "#ffd23f", CORAL = "#ff6b6b", D = P.duration || (mode === "intro" ? 3.5 : mode === "end" ? 2.5 : 5);
  defs.insertAdjacentHTML("beforeend", `
    <linearGradient id="akSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f86e0"/><stop offset="1" stop-color="#7fd4ff"/></linearGradient>
    <linearGradient id="akShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.4" stop-color="#0b1a33" stop-opacity="0"/><stop offset="1" stop-color="#0b1a33" stop-opacity="0.85"/></linearGradient>
    <linearGradient id="akRibbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a7a"/><stop offset="1" stop-color="#e2453c"/></linearGradient>
    <radialGradient id="akGlow"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="0.5" stop-color="#fff3b0" stop-opacity="0.3"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  `);
  const word = (parent, x, y, size, str, fill, attrs = {}) => {
    const t = el("text", { x: f2(x), y: f2(y), "text-anchor": "middle", "font-size": f2(size), "font-weight": 800, fill, stroke: DARK, "stroke-width": f2(size * 0.16), "stroke-linejoin": "round", "paint-order": "stroke", ...attrs }, parent);
    t.textContent = str;
    return t;
  };
  const star = (parent, x, y, r, fill) => {
    let d = "";
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.38 : r; d += `${i ? "L" : "M"} ${f2(x + Math.cos(a) * rr)} ${f2(y + Math.sin(a) * rr)} `; }
    return el("path", { d: d + "Z", fill, stroke: DARK, "stroke-width": f2(r * 0.16), "stroke-linejoin": "round" }, parent);
  };

  /** The logo: a speech bubble with a question mark (and the name under it), size R. */
  function logo(parent, R, withName = true) {
    const L = g(parent), bubble = g(L);
    el("circle", { r: R * 1.35, fill: "url(#akGlow)" }, bubble);
    el("path", { d: `M ${f2(-R * 0.55)} ${f2(R * 0.55)} L ${f2(-R * 0.85)} ${f2(R * 1.05)} L ${f2(-R * 0.15)} ${f2(R * 0.66)} Z`, fill: "#ffffff", stroke: DARK, "stroke-width": f2(R * 0.07), "stroke-linejoin": "round" }, bubble);
    el("rect", { x: f2(-R), y: f2(-R * 0.8), width: f2(R * 2), height: f2(R * 1.56), rx: f2(R * 0.6), fill: "#ffffff", stroke: DARK, "stroke-width": f2(R * 0.07) }, bubble);
    // The tail joins the bubble without a line across it.
    el("path", { d: `M ${f2(-R * 0.6)} ${f2(R * 0.66)} L ${f2(-R * 0.12)} ${f2(R * 0.68)} L ${f2(-R * 0.3)} ${f2(R * 0.8)} Z`, fill: "#ffffff" }, bubble);
    const qm = g(bubble);
    word(qm, 0, R * 0.45, R * 1.3, "?", YELLOW);
    const stars = g(L);
    star(stars, R * 1.05, -R * 0.85, R * 0.2, YELLOW);
    star(stars, -R * 1.12, -R * 0.55, R * 0.14, CORAL);
    star(stars, R * 1.2, R * 0.35, R * 0.12, "#ffffff");
    let name = null;
    if (withName) {
      name = g(L);
      const t = el("text", { x: 0, y: f2(R * 1.75), "text-anchor": "middle", "font-size": f2(R * 0.66), "font-weight": 800, stroke: DARK, "stroke-width": f2(R * 0.11), "stroke-linejoin": "round", "paint-order": "stroke" }, name);
      const [ask, huy] = (B.name || "Ask Huy").split(/\s+(.*)/);
      t.innerHTML = `<tspan fill="${YELLOW}">${ask}</tspan><tspan fill="#ffffff"> ${huy || ""}</tspan>`;
    }
    return { L, bubble, qm, stars, name };
  }
  /** The little life of the logo: the question mark wiggles, the stars twinkle. */
  const alive = (lg, t) => {
    tr(lg.qm, 0, 0, 8 * Math.sin(t * 5));
    [...lg.stars.children].forEach((s, i) => s.setAttribute("transform", `translate(${f2(Math.sin(t * 2 + i) * 4)},0)`));
    lg.stars.setAttribute("opacity", f2(0.75 + 0.25 * Math.sin(t * 6)));
  };

  /** The bright sky with clouds and question marks drifting up. */
  function sky() {
    el("rect", { width: W, height: H, fill: "url(#akSky)" }, svg);
    for (let i = 0; i < 6; i++) {
      const r = rand(40 + i), x = r() * W, y = H * (0.15 + r() * 0.7), s = U * (0.08 + r() * 0.08);
      const c = g(svg, { opacity: 0.85 });
      for (const [dx, dy, k] of [[-1, 0.2, 0.8], [0, 0, 1], [1, 0.25, 0.75]]) el("ellipse", { cx: f2(x + dx * s), cy: f2(y + dy * s), rx: f2(s * k), ry: f2(s * k * 0.62), fill: "#ffffff" }, c);
    }
    const marks = g(svg), list = [];
    const colours = [YELLOW, CORAL, "#ffffff", "#8ee27a", "#c8a2ff"];
    for (let i = 0; i < 18; i++) {
      const r = rand(70 + i), size = U * (0.05 + r() * 0.07);
      list.push({ x: r() * W, y0: r() * H, speed: U * (0.05 + r() * 0.08), size, spin: (r() - 0.5) * 40, node: word(marks, 0, 0, size, "?", colours[i % colours.length], { opacity: 0.55 }) });
    }
    return (t) => {
      for (const m of list) {
        const y = ((m.y0 - t * m.speed) % (H + m.size * 2) + H + m.size * 2) % (H + m.size * 2) - m.size;
        m.node.setAttribute("transform", `translate(${f2(m.x)},${f2(y)}) rotate(${f2(m.spin * Math.sin(t + m.x))})`);
      }
    };
  }
  /** Sparkles bursting from x, y at `born`. */
  function sparkles(layer, t, x, y, born) {
    let html = "";
    for (let i = 0; i < 30; i++) {
      const r = rand(200 + i), b = born + r() * 0.4, age = t - b, life = 1;
      if (age < 0 || age > life) continue;
      const a = r() * Math.PI * 2, d = U * 0.08 + (age / life) * U * (0.3 + r() * 0.4), sz = U * 0.012 * (1 - age / life) + 2;
      html += `<circle cx="${f2(x + Math.cos(a) * d)}" cy="${f2(y + Math.sin(a) * d)}" r="${f2(sz)}" fill="${i % 2 ? YELLOW : "#ffffff"}" opacity="${f2(1 - age / life)}"/>`;
    }
    layer.innerHTML = html;
  }
  /** The subscribe button and the hand clicking it at 2.6 s (as the other themes). */
  function subscribe(size) {
    const btn = g(svg), bw = size, bh = size * 0.225;
    const rect = el("rect", { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: bh / 2, fill: "url(#btn)", stroke: DARK, "stroke-width": 6 }, btn);
    const label = el("text", { x: 0, y: f2(bh * 0.17), "text-anchor": "middle", "font-size": f2(bh * 0.46), "font-weight": 800, fill: "#fff" }, btn);
    label.textContent = T.subscribe;
    const hand = g(svg);
    el("path", { d: "M 0 0 L 0 -70 Q 0 -84 12 -84 Q 24 -84 24 -70 L 24 -36 L 54 -30 Q 70 -26 68 -6 L 62 40 Q 58 60 36 60 L 8 60 Q -10 60 -22 40 L -40 6 Q -46 -8 -32 -12 Q -20 -14 -10 0 Z", fill: "#fff", stroke: DARK, "stroke-width": 6 }, hand);
    return (t, x, y) => {
      const clicked = t > 2.6, pulse = clicked ? 1 : 1 + 0.06 * Math.sin(t * 7);
      tr(btn, x, y, 0, EASE.backOut(seg(t, 0.4, 0.9)) * pulse * (1 - 0.08 * bump(t, 2.5, 2.75)) || 0.01);
      rect.setAttribute("fill", clicked ? "#8a8a8a" : "url(#btn)");
      label.textContent = clicked ? T.subscribed : T.subscribe;
      const hk = EASE.inOut(seg(t, 1.6, 2.5));
      tr(hand, lerp(W * 1.1, x + bw * 0.1, hk), lerp(H * 1.2, y + bh * 0.35, hk) + 12 * bump(t, 2.5, 2.75), -20, U / 900);
      hand.setAttribute("opacity", f2(1 - seg(t, 3.4, 3.8)));
    };
  }

  if (mode === "logo") {
    const holder = g(svg, { transform: `translate(${W / 2},${H * (P.withName === false ? 0.5 : 0.4)})` });
    const lg = logo(holder, U * (P.withName === false ? 0.36 : 0.3), P.withName !== false);
    render = (t) => alive(lg, 0.3);
    return;
  }

  if (mode === "intro") {
    const drift = sky(), holder = g(svg), lg = logo(holder, U * 0.24, true), sp = g(svg);
    const tag = word(svg, W / 2, H * (V ? 0.8 : 0.92), U * 0.05, B.tagline, "#ffffff", { opacity: 0 });
    const flash = el("rect", { width: W, height: H, fill: "#ffffff", opacity: 0 }, svg);
    render = (t) => {
      drift(t);
      // The bubble pops in with a turn, the name bounces up under it, the tagline follows.
      const k = EASE.backOut(seg(t, 0.15, 0.75));
      tr(holder, W / 2, H * 0.42, (1 - k) * -30, Math.max(0.01, k));
      tr(lg.bubble, 0, 0, 0, 1 + 0.06 * bump(t, 0.75, 1.0));
      alive(lg, t);
      const n = EASE.backOut(seg(t, 0.9, 1.4));
      lg.name.setAttribute("transform", `translate(0,${f2((1 - n) * U * 0.2)}) scale(${f2(Math.max(0.01, n))})`);
      lg.name.setAttribute("opacity", f2(seg(t, 0.9, 1.05)));
      tag.setAttribute("opacity", f2(seg(t, 1.6, 2.0)));
      sparkles(sp, t, W / 2, H * 0.42, 0.7);
      flash.setAttribute("opacity", f2(0.9 * seg(t, D - 0.3, D)));
    };
    return;
  }

  if (mode === "outro") {
    const drift = sky(), holder = g(svg), lg = logo(holder, U * (V ? 0.2 : 0.17), true);
    const thanks = word(svg, W / 2, H * (V ? 0.17 : 0.16), U * 0.075, T.thanks, "#ffffff", { opacity: 0 });
    const click = subscribe(U * 0.62);
    const ask = word(svg, W / 2, H * (V ? 0.9 : 0.93), U * 0.045, T.ask || "Got a question? Ask Huy!", YELLOW, { opacity: 0 });
    render = (t) => {
      drift(t);
      tr(holder, V ? W / 2 : W * 0.28, V ? H * 0.42 : H * 0.5, 0, EASE.backOut(seg(t, 0, 0.6)) || 0.01);
      alive(lg, t);
      thanks.setAttribute("opacity", f2(seg(t, 0.2, 0.6)));
      click(t, V ? W / 2 : W * 0.68, V ? H * 0.72 : H * 0.53);
      ask.setAttribute("opacity", f2(seg(t, 0.9, 1.3)));
    };
    return;
  }

  if (mode === "end") {
    const drift = sky(), holder = g(svg), lg = logo(holder, U * (V ? 0.22 : 0.16), true);
    const line1 = word(svg, W / 2, V ? H * 0.2 : H * 0.15, U * 0.07, T.watchFull, "#ffffff", { opacity: 0 });
    const line2 = word(svg, W / 2, V ? H * 0.84 : H * 0.94, U * 0.05, T.follow, YELLOW, { opacity: 0 });
    render = (t) => {
      drift(t);
      const k = EASE.backOut(seg(t, 0, 0.5));
      tr(holder, W / 2, V ? H * 0.46 : H * 0.42, (1 - k) * -20, lerp(0.1, 1, k));
      alive(lg, t);
      line1.setAttribute("opacity", f2(seg(t, 0.3, 0.6)));
      line2.setAttribute("opacity", f2(seg(t, 0.5, 0.8)));
    };
    return;
  }

  if (mode === "thumb") {
    // A frame of the film, darkened at the bottom; the question big and yellow, "ASK HUY" on a
    // coral ribbon above it, the bubble logo in the corner.
    el("image", { href: P.frame, width: W, height: H, preserveAspectRatio: "xMidYMid slice" }, svg);
    el("rect", { width: W, height: H, fill: "url(#akShade)" }, svg);
    const badge = g(svg, { transform: `translate(${W - H * 0.17},${H * 0.17})` });
    alive(logo(badge, H * 0.11, false), 0.3);
    const words = (P.title || "").toUpperCase().split(/\s+/).filter(Boolean);
    let drawn = false;
    render = () => {
      if (drawn) return;
      drawn = true;
      const maxW = W * 0.9, x = W * 0.05;
      const probe = el("text", { "font-size": 100, "font-weight": 800 }, svg);
      const width = (s, size) => { probe.textContent = s; return probe.getComputedTextLength() * size / 100; };
      let size = H * 0.2, lines = [words.join(" ")];
      for (; size > H * 0.08; size *= 0.95) {
        if (width(words.join(" "), size) <= maxW) { lines = [words.join(" ")]; break; }
        let best;
        for (let k = 1; k < words.length; k++) {
          const two = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
          const w = Math.max(width(two[0], size), width(two[1], size));
          if (w <= maxW && (!best || w < best.w)) best = { w, two };
        }
        if (best) { lines = best.two; break; }
      }
      probe.remove();
      const lh = size * 1.02, base = H * 0.93 - (lines.length - 1) * lh;
      lines.forEach((line, i) => {
        const t = el("text", { x, y: base + i * lh, "font-size": f2(size), "font-weight": 800, fill: YELLOW, stroke: "#0b1a33", "stroke-width": f2(size * 0.15), "stroke-linejoin": "round", "paint-order": "stroke" }, svg);
        t.textContent = line;
      });
      const sz = H * 0.06, top = base - size * 0.95 - sz * 0.6;
      const sub = g(svg, { transform: `translate(${x},${top})` });
      const box = el("rect", { x: 0, y: -sz * 1.05, height: sz * 1.45, rx: 12, fill: "url(#akRibbon)", stroke: DARK, "stroke-width": 5 }, sub);
      const st = el("text", { x: sz * 0.5, y: 0, "font-size": f2(sz), "font-weight": 800, fill: "#fff" }, sub);
      st.textContent = (P.subtitle || B.name).toUpperCase();
      box.setAttribute("width", f2(st.getComputedTextLength() + sz));
    };
  }
})();
