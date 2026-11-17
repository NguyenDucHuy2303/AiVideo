/**
 * The explainer board (the question channel, studio/qa.ts): a picture that explains, drawn as
 * SVG by the scene director, shown on a card fixed to the screen (the camera does not move it),
 * beside or instead of the presenters.
 *
 *   scene.board = { svg: "<svg viewBox='0 0 1000 600'>…</svg>", x, y, w, h, bg }
 *     x, y, w, h: the card in fractions of the frame (default: the right 57%, from 0.40; the presenters
 *       on the left, inside the camera's region [0.02, 0.36])
 *
 * Inside the SVG, plain attributes animate it (times in seconds of the scene):
 *   data-in="1.2"   appears then (a quick pop)       data-out="4"  goes away then
 *   class="float"   bobs gently    "spin" turns      "pulse" breathes
 *   class="flow"    its dashes run along it (arrows, rays, currents)
 *   class="draw"    its line is drawn from start to end over a second (from data-in)
 * Every animated element is wrapped in a group of its own, so its own transform is kept.
 *
 * Pictures of things come from an icon set (icons.ts resolves them before the render):
 *   <icon name="cat" x="100" y="150" size="180" data-in="1"/>   (x, y: top left; size: width)
 * and board.icons carries their SVG.
 *
 * Games for the viewers (the English lessons, studio/formats.ts): board.reveal is when the answer
 * is given (the end of the viewers' pause): class="answer" appears then, class="shadow" (an icon)
 * is a black shadow until then and turns into the picture. board.corner: a small word card in the
 * top corner over a painted place (the presenters keep the rest of the frame).
 *
 * The overlay (scene.overlay, any layout): a scoreboard { score: { "Bối": n, "Beo": n, gain, at } }
 * and countdown clocks { countdowns: [{ at, seconds }] } over the viewers' pauses.
 *
 * board.style is the board's look:
 *   card (cream card, the default) · grid (squared paper) · chalk (a green chalkboard in a wooden
 *   frame: dark lines and words turn to chalk) · sketch (paper, every drawn shape redrawn by
 *   hand with Rough.js, MIT, when it is loaded).
 */
(function () {
  const { NS, el, g, clamp, smooth, f2 } = WA.core;
  const KINDS = ["float", "spin", "pulse", "flow", "draw"];

  /** Only drawing: no scripts, no event handlers, no outside links. */
  function clean(root) {
    for (const n of [...root.querySelectorAll("script, foreignObject, iframe, image, use[href^='http'], a")]) n.remove();
    for (const n of root.querySelectorAll("*")) {
      for (const a of [...n.attributes]) if (/^on/i.test(a.name) || (/href$/i.test(a.name) && !a.value.startsWith("#"))) n.removeAttribute(a.name);
    }
  }

  function build(S, board, parent) {
    const { W, H } = S;
    // Wide frames: the card on the right, the presenters on the left. Tall frames (Shorts): the
    // card across the top half, the presenters under it.
    const tall = H > W;
    if (board.corner) Object.assign(board, tall ? { x: 0.05, y: 0.04, w: 0.9, h: 0.24 } : { x: 0.59, y: 0.05, w: 0.38, h: 0.38 });
    const x = (board.x ?? (tall ? 0.04 : 0.4)) * W, y = (board.y ?? (tall ? 0.06 : 0.08)) * H, w = (board.w ?? (tall ? 0.92 : 0.57)) * W, h = (board.h ?? (tall ? 0.42 : 0.74)) * H;
    const root = g(parent);
    const style = board.style || "card";
    // The card: a soft shadow, the panel in the board's look, its frame.
    el("rect", { x: f2(x + 8), y: f2(y + 12), width: f2(w), height: f2(h), rx: 26, fill: "#000", opacity: 0.18 }, root);
    if (style === "chalk") {
      el("rect", { x: f2(x - 8), y: f2(y - 8), width: f2(w + 16), height: f2(h + 16), rx: 22, fill: "#8a5a32", stroke: "#3a2414", "stroke-width": 5 }, root);
      el("rect", { x: f2(x + 8), y: f2(y + 8), width: f2(w - 16), height: f2(h - 16), rx: 12, fill: board.bg || "#2f4a3c" }, root);
      el("rect", { x: f2(x + 8), y: f2(y + 8), width: f2(w - 16), height: f2(h - 16), rx: 12, fill: "#ffffff", opacity: 0.05 }, root);
    } else {
      const paper = board.bg || (style === "grid" ? "#fdfcf6" : style === "sketch" ? "#fffdf4" : "#fffaf0");
      el("rect", { x: f2(x), y: f2(y), width: f2(w), height: f2(h), rx: 26, fill: paper, stroke: "#3a2a20", "stroke-width": 5 }, root);
      if (style === "grid") {
        const id = S.id("grid");
        S.addDefs(`<pattern id="${id}" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M 34 0 L 0 0 0 34" fill="none" stroke="#9cc3e6" stroke-width="1.4" opacity="0.7"/></pattern>`);
        el("rect", { x: f2(x + 6), y: f2(y + 6), width: f2(w - 12), height: f2(h - 12), rx: 22, fill: `url(#${id})` }, root);
      }
    }
    const doc = new DOMParser().parseFromString(board.svg || "<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml");
    const src = doc.documentElement;
    if (src.nodeName !== "svg") return { root, items: [] };
    clean(src);
    icons(src, board.icons || {});
    reveal(src, board.reveal);
    if (style === "chalk") chalk(src);
    const pad = Math.min(w, h) * 0.04;
    const inner = document.importNode(src, true);
    inner.setAttribute("x", f2(x + pad)); inner.setAttribute("y", f2(y + pad));
    inner.setAttribute("width", f2(w - 2 * pad)); inner.setAttribute("height", f2(h - 2 * pad));
    if (!inner.getAttribute("viewBox")) inner.setAttribute("viewBox", "0 0 1000 600");
    inner.setAttribute("overflow", "hidden");
    root.appendChild(inner);
    if (style === "sketch") sketch(inner);
    // Whatever was drawn past the edges of its viewBox is brought back in: the view grows to
    // hold all of it (with a margin), the picture keeps its proportions.
    try {
      const vb = inner.getAttribute("viewBox").split(/[\s,]+/).map(Number), bb = inner.getBBox(), m = 20;
      const x0 = Math.min(vb[0], bb.x - m), y0 = Math.min(vb[1], bb.y - m);
      const x1 = Math.max(vb[0] + vb[2], bb.x + bb.width + m), y1 = Math.max(vb[1] + vb[3], bb.y + bb.height + m);
      if (x0 < vb[0] || y0 < vb[1] || x1 > vb[0] + vb[2] || y1 > vb[1] + vb[3]) inner.setAttribute("viewBox", `${f2(x0)} ${f2(y0)} ${f2(x1 - x0)} ${f2(y1 - y0)}`);
    } catch { /* not laid out */ }
    // Wrap every animated element so the animation does not replace its own transform.
    const items = [];
    for (const n of [...inner.querySelectorAll("[data-in], [data-out], .float, .spin, .pulse, .flow, .draw")]) {
      const wrap = document.createElementNS(NS, "g");
      n.parentNode.insertBefore(wrap, n);
      wrap.appendChild(n);
      wrap.style.transformBox = "fill-box";
      wrap.style.transformOrigin = "center";
      const cls = KINDS.filter((k) => n.classList.contains(k));
      const item = { wrap, n, at: parseFloat(n.getAttribute("data-in")), out: parseFloat(n.getAttribute("data-out")), cls, phase: items.length * 0.7 };
      if (cls.includes("flow") && !n.getAttribute("stroke-dasharray")) n.setAttribute("stroke-dasharray", "14 12");
      if (cls.includes("draw")) { n.setAttribute("pathLength", "1"); n.setAttribute("stroke-dasharray", "1 1"); }
      items.push(item);
    }
    return { root, items };
  }

  /** <icon name="…"> → the icon's SVG at its place (ids made unique: one icon may appear twice). */
  let uid = 0;
  function icons(root, set) {
    for (const ic of [...root.querySelectorAll("icon")]) {
      const name = ic.getAttribute("name") || "", data = set[name];
      const size = parseFloat(ic.getAttribute("size") || ic.getAttribute("width") || "120"), x = parseFloat(ic.getAttribute("x") || "0"), y = parseFloat(ic.getAttribute("y") || "0");
      const holder = document.createElementNS(NS, "g");
      if (data) holder.setAttribute("data-icon", name);
      for (const a of ["data-in", "data-out", "class", "transform", "opacity"]) if (ic.hasAttribute(a)) holder.setAttribute(a, ic.getAttribute(a));
      if (data) {
        const n = ++uid, body = data.body.replace(/id="([^"]+)"/g, `id="$1-i${n}"`).replace(/url\(#([^)]+)\)/g, `url(#$1-i${n})`).replace(/href="#([^"]+)"/g, `href="#$1-i${n}"`);
        holder.innerHTML = `<svg x="${f2(x)}" y="${f2(y)}" width="${f2(size)}" height="${f2((size * data.height) / data.width)}" viewBox="0 0 ${data.width} ${data.height}" overflow="visible">${body}</svg>`;
      } else {
        // Not in the set: a dashed frame with its name, so the picture still says what it meant
        // (coloured like the board's other lines and words).
        const hh = size * 0.8;
        holder.innerHTML = `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(size)}" height="${f2(hh)}" rx="18" fill="none" stroke="#3a2a20" stroke-width="3" stroke-dasharray="10 8"/><text x="${f2(x + size / 2)}" y="${f2(y + hh / 2 + 10)}" font-size="${f2(Math.min(30, size / 5))}" text-anchor="middle" font-family="sans-serif" fill="#2a2a40">${name.replace(/[<&]/g, "")}</text>`;
      }
      ic.replaceWith(holder);
    }
  }
  /**
   * The answer of a game: class="answer" comes in at the reveal (or later, by its own data-in);
   * class="shadow" is doubled: a black copy shown until the reveal, the picture from then.
   */
  function reveal(root, at) {
    if (!Number.isFinite(at)) return;
    const later = (n) => n.setAttribute("data-in", String(Math.max(at, parseFloat(n.getAttribute("data-in")) || 0)));
    for (const n of [...root.querySelectorAll(".answer")]) later(n);
    for (const n of [...root.querySelectorAll(".shadow")]) {
      const dark = n.cloneNode(true);
      dark.classList.remove("shadow");
      n.classList.remove("shadow");
      for (const m of [dark, ...dark.querySelectorAll("*")]) {
        for (const a of ["fill", "stroke"]) { const v = m.getAttribute(a); if (v && v !== "none") m.setAttribute(a, "#23202e"); }
        if (m.style) { if (m.style.fill && m.style.fill !== "none") m.style.fill = "#23202e"; if (m.style.stroke && m.style.stroke !== "none") m.style.stroke = "#23202e"; }
        if (/^(path|circle|ellipse|rect|polygon|polyline)$/.test(m.tagName) && !m.getAttribute("fill") && !(m.style && m.style.fill)) m.setAttribute("fill", "#23202e");
        m.removeAttribute("opacity"); m.removeAttribute("fill-opacity");
      }
      dark.setAttribute("data-out", String(at));
      n.parentNode.insertBefore(dark, n);
      later(n);
    }
  }
  const isIcon = (n) => !!n.closest("[data-icon]");
  /** How dark a colour is (0 black … 1 white); undefined for gradients, none, unknown. */
  function lum(c) {
    if (!c || c === "none" || c.startsWith("url")) return undefined;
    if (c === "black") return 0;
    if (c === "white") return 1;
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return undefined;
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /** On a chalkboard, dark lines and words are chalk (icons keep their colours). */
  function chalk(root) {
    const CHALK = "#f3efe2";
    // Coloured words become coloured chalk (lighter); pale panels become a faint wash of chalk.
    const lighten = (c, k) => { const h = c.length === 4 ? c.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3") : c; return "#" + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) + (255 - parseInt(h.slice(i, i + 2), 16)) * k).toString(16).padStart(2, "0")).join(""); };
    for (const n of root.querySelectorAll("*")) {
      if (isIcon(n)) continue;
      const text = n.tagName === "text" || !!n.closest("text");
      for (const a of ["fill", "stroke"]) {
        const v = n.getAttribute(a), l = lum(v);
        if (l === undefined) continue;
        if (l < 0.35) n.setAttribute(a, CHALK);
        else if (text && a === "fill" && l < 0.7 && /^#/.test(v)) n.setAttribute(a, lighten(v, 0.5));
        else if (!text && a === "fill" && l > 0.75) { n.setAttribute(a, "#ffffff"); n.setAttribute("fill-opacity", "0.13"); }
      }
      if (n.tagName === "text" && !n.getAttribute("fill")) n.setAttribute("fill", CHALK);
    }
  }
  /** Every drawn shape (not icons, words, or lines that run or draw themselves) redrawn by hand. */
  function sketch(inner) {
    if (!window.rough) return;
    const rc = window.rough.svg(inner);
    let seed = 1;
    for (const n of [...inner.querySelectorAll("rect, circle, ellipse, line, polyline, polygon, path")]) {
      if (isIcon(n) || n.closest("text") || n.classList.contains("draw") || n.classList.contains("flow") || n.closest("defs, clipPath, pattern, mask")) continue;
      const num = (a) => parseFloat(n.getAttribute(a) || "0");
      const fill = n.getAttribute("fill"), stroke = n.getAttribute("stroke") || (fill && fill !== "none" ? "#3a2a20" : "none");
      const o = { seed: seed++, roughness: 1.2, bowing: 1, stroke, strokeWidth: num("stroke-width") || 3, fill: fill && fill !== "none" && !fill.startsWith("url") ? fill : undefined, fillStyle: "solid" };
      let g;
      try {
        const tag = n.tagName;
        if (tag === "rect") g = rc.rectangle(num("x"), num("y"), num("width"), num("height"), o);
        else if (tag === "circle") g = rc.circle(num("cx"), num("cy"), num("r") * 2, o);
        else if (tag === "ellipse") g = rc.ellipse(num("cx"), num("cy"), num("rx") * 2, num("ry") * 2, o);
        else if (tag === "line") g = rc.line(num("x1"), num("y1"), num("x2"), num("y2"), o);
        else if (tag === "polygon" || tag === "polyline") {
          const pts = (n.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number), xy = [];
          for (let i = 0; i + 1 < pts.length; i += 2) xy.push([pts[i], pts[i + 1]]);
          g = tag === "polygon" ? rc.polygon(xy, o) : rc.linearPath(xy, o);
        } else g = rc.path(n.getAttribute("d") || "", o);
      } catch { continue; }
      for (const a of ["transform", "data-in", "data-out", "class", "opacity"]) if (n.hasAttribute(a)) g.setAttribute(a, n.getAttribute(a));
      n.replaceWith(g);
    }
  }

  /** The board at scene time t (the card pops in at the start: solid at once, growing to size). */
  function render(B, t) {
    const k = smooth(clamp(t / 0.3));
    B.root.style.transformBox = "fill-box";
    B.root.style.transformOrigin = "center";
    // …then drifts in very slowly while it is explained.
    B.root.style.transform = `scale(${f2((0.9 + 0.1 * k) * (1 + 0.018 * Math.min(1, t / 10)))})`;
    for (const it of B.items) {
      const inK = Number.isFinite(it.at) ? smooth(clamp((t - it.at) / 0.35)) : 1;
      const outK = Number.isFinite(it.out) ? 1 - smooth(clamp((t - it.out) / 0.3)) : 1;
      const tr = [];
      if (it.cls.includes("float")) tr.push(`translateY(${f2(7 * Math.sin((t + it.phase) * 2.6))}px)`);
      const s = (0.8 + 0.2 * inK) * (it.cls.includes("pulse") ? 1 + 0.06 * Math.sin((t + it.phase) * 5.2) : 1);
      tr.push(`scale(${f2(s)})`);
      if (it.cls.includes("spin")) tr.push(`rotate(${f2((t * 40) % 360)}deg)`);
      it.wrap.style.transform = tr.join(" ");
      it.wrap.setAttribute("opacity", f2(inK * outK));
      if (it.cls.includes("flow")) it.n.setAttribute("stroke-dashoffset", f2(-t * 50));
      if (it.cls.includes("draw")) it.n.setAttribute("stroke-dashoffset", f2(1 - smooth(clamp((t - (Number.isFinite(it.at) ? it.at : 0)) / 1.0))));
    }
  }

  /** The scoreboard and the clocks of a game, fixed to the screen (over any layout). */
  const TEAMS = [["Bối", "#f4a62a", "#b8730c"], ["Beo", "#4caf62", "#2f8040"]];
  function overlay(S, spec, parent) {
    const { W, H } = S, tall = H > W, root = g(parent), O = { root, score: null, clocks: [] };
    const u = tall ? W / 1080 : H / 1080;
    if (spec.score) {
      const sc = spec.score, x0 = tall ? 0.5 * W - 330 * u : 0.025 * W, y0 = tall ? 0.495 * H : 0.03 * H;
      const box = g(root);
      el("rect", { x: f2(x0 + 6 * u), y: f2(y0 + 8 * u), width: f2(660 * u), height: f2(112 * u), rx: f2(56 * u), fill: "#000", opacity: 0.2 }, box);
      el("rect", { x: f2(x0), y: f2(y0), width: f2(660 * u), height: f2(112 * u), rx: f2(56 * u), fill: "#fffaf0", stroke: "#3a2a20", "stroke-width": f2(5 * u) }, box);
      const vs = el("text", { x: f2(x0 + 330 * u), y: f2(y0 + 74 * u), "font-size": f2(40 * u), "font-weight": 800, "text-anchor": "middle", "font-family": "sans-serif", fill: "#3a2a20" }, box);
      vs.textContent = "VS";
      O.score = TEAMS.map(([name, color, dark], k) => {
        const px = x0 + (k ? 380 : 14) * u, py = y0 + 12 * u, team = g(box);
        el("rect", { x: f2(px), y: f2(py), width: f2(266 * u), height: f2(88 * u), rx: f2(44 * u), fill: color, stroke: dark, "stroke-width": f2(4 * u) }, team);
        const label = el("text", { x: f2(px + 30 * u), y: f2(py + 60 * u), "font-size": f2(44 * u), "font-weight": 800, "font-family": "sans-serif", fill: "#fff" }, team);
        label.textContent = name;
        const num = g(team);
        num.style.transformBox = "fill-box"; num.style.transformOrigin = "center";
        el("circle", { cx: f2(px + 212 * u), cy: f2(py + 44 * u), r: f2(36 * u), fill: "#fff" }, num);
        const t = el("text", { x: f2(px + 212 * u), y: f2(py + 62 * u), "font-size": f2(50 * u), "font-weight": 800, "text-anchor": "middle", "font-family": "sans-serif", fill: dark }, num);
        const before = (sc[name] || 0), gains = sc.gain === name || sc.gain === "both";
        t.textContent = String(before);
        return { t, num, before, after: before + (gains ? 1 : 0), at: sc.at || 0 };
      });
    }
    for (const c of spec.countdowns || []) {
      const cx = tall ? 0.86 * W : 0.19 * W, cy = tall ? 0.555 * H : 0.24 * H, r = 70 * u, k = g(root);
      k.style.transformBox = "fill-box"; k.style.transformOrigin = "center";
      el("circle", { cx: f2(cx + 4 * u), cy: f2(cy + 6 * u), r: f2(r), fill: "#000", opacity: 0.2 }, k);
      el("circle", { cx: f2(cx), cy: f2(cy), r: f2(r), fill: "#fffaf0", stroke: "#3a2a20", "stroke-width": f2(5 * u) }, k);
      const ring = el("circle", { cx: f2(cx), cy: f2(cy), r: f2(r - 14 * u), fill: "none", stroke: "#e53935", "stroke-width": f2(12 * u), "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1", transform: `rotate(-90 ${f2(cx)} ${f2(cy)})` }, k);
      const digit = el("text", { x: f2(cx), y: f2(cy + 26 * u), "font-size": f2(74 * u), "font-weight": 800, "text-anchor": "middle", "font-family": "sans-serif", fill: "#3a2a20" }, k);
      O.clocks.push({ k, ring, digit, at: c.at, seconds: c.seconds });
    }
    return O;
  }
  function renderOverlay(O, t) {
    for (const s of O.score || []) {
      const on = t >= s.at, pop = s.after !== s.before ? clamp((t - s.at) / 0.45) : 1;
      s.t.textContent = String(on ? s.after : s.before);
      s.num.style.transform = `scale(${f2(on && s.after !== s.before ? 1 + 0.45 * Math.sin(Math.PI * pop) : 1)})`;
    }
    for (const c of O.clocks) {
      const left = c.at + c.seconds - t, live = t >= c.at - 0.2 && left > -0.35;
      c.k.setAttribute("opacity", f2(live ? smooth(clamp((t - c.at + 0.2) / 0.25)) * smooth(clamp((left + 0.35) / 0.3)) : 0));
      if (!live) continue;
      const n = Math.max(1, Math.ceil(left)), frac = left - Math.floor(left);
      c.digit.textContent = String(Math.min(n, Math.ceil(c.seconds)));
      c.ring.setAttribute("stroke-dashoffset", f2(1 - clamp(left / c.seconds)));
      c.k.style.transform = `scale(${f2(1 + 0.08 * smooth(clamp((frac - 0.75) / 0.25)))})`;
    }
  }

  WA.board = { build, render, overlay, renderOverlay };
})();
