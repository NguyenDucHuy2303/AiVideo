/**
 * The explainer board (the question channel, studio/qa.ts): a picture that explains, drawn as
 * SVG by the scene director, shown on a card fixed to the screen (the camera does not move it),
 * beside or instead of the presenters.
 *
 *   scene.board = { svg: "<svg viewBox='0 0 1000 600'>…</svg>", x, y, w, h, bg }
 *     x, y, w, h: the card in fractions of the frame (default: the right 61%, the presenters on the left)
 *
 * Inside the SVG, plain attributes animate it (times in seconds of the scene):
 *   data-in="1.2"   appears then (a quick pop)       data-out="4"  goes away then
 *   class="float"   bobs gently    "spin" turns      "pulse" breathes
 *   class="flow"    its dashes run along it (arrows, rays, currents)
 *   class="draw"    its line is drawn from start to end over a second (from data-in)
 * Every animated element is wrapped in a group of its own, so its own transform is kept.
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
    const x = (board.x ?? 0.36) * W, y = (board.y ?? 0.08) * H, w = (board.w ?? 0.61) * W, h = (board.h ?? 0.74) * H;
    const root = g(parent);
    // The card: a soft shadow, a rounded panel, a thin frame.
    el("rect", { x: f2(x + 8), y: f2(y + 12), width: f2(w), height: f2(h), rx: 26, fill: "#000", opacity: 0.18 }, root);
    el("rect", { x: f2(x), y: f2(y), width: f2(w), height: f2(h), rx: 26, fill: board.bg || "#fffaf0", stroke: "#3a2a20", "stroke-width": 5 }, root);
    const doc = new DOMParser().parseFromString(board.svg || "<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml");
    const src = doc.documentElement;
    if (src.nodeName !== "svg") return { root, items: [] };
    clean(src);
    const pad = Math.min(w, h) * 0.04;
    const inner = document.importNode(src, true);
    inner.setAttribute("x", f2(x + pad)); inner.setAttribute("y", f2(y + pad));
    inner.setAttribute("width", f2(w - 2 * pad)); inner.setAttribute("height", f2(h - 2 * pad));
    if (!inner.getAttribute("viewBox")) inner.setAttribute("viewBox", "0 0 1000 600");
    inner.setAttribute("overflow", "hidden");
    root.appendChild(inner);
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

  /** The board at scene time t (the card pops in at the start: solid at once, growing to size). */
  function render(B, t) {
    const k = smooth(clamp(t / 0.3));
    B.root.style.transformBox = "fill-box";
    B.root.style.transformOrigin = "center";
    B.root.style.transform = `scale(${f2(0.9 + 0.1 * k)})`;
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

  WA.board = { build, render };
})();
