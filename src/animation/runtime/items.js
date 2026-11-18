/*
 * Things in the scene (English lessons as stories, 16/11/2026): a gift box, an apple, a ball…,
 * drawn from the emoji pictures (icons.ts embeds their SVG in the scene), standing on the
 * ground of the world (the camera moves over them like over the actors). Stateless: every
 * frame is a formula of time.
 *
 *   { id, icon: { body, width, height }, x, lift = 0, size = 120, behind = false,
 *     from, until,                         pops in at `from`, out at `until`
 *     shakes: [{ at, dur, amp = 12 }],     wobbles (something inside wants out)
 *     carry: { by, from, until, dy = 0.5 }, held by an actor in front of the chest (`by`)
 *     moves: [{ at, dur, to: [x, lift], arc = 0 }],  slides or hops to another spot
 *     burst: at,                           swells, bursts in confetti, gone
 *     pops: [at, …],                       opens: a jump, a squash and confetti, and it stays
 *     label: { at, until, text, sub } }    the English word over it, the meaning under it
 */
(function () {
  const { el, g, f2, seg, smooth, clamp, lerp, hash, rand } = WA.core;
  const NS = "http://www.w3.org/2000/svg";
  const INK = "#2a1a0a";

  function build(S, items, actorLayer) {
    // (inside the actors' layer: it carries the camera; behind ones before the actors, the rest after)
    const front = g(actorLayer), back = g(actorLayer);
    actorLayer.insertBefore(back, actorLayer.firstChild);
    return (items || []).map((it) => {
      const node = g(it.behind ? back : front);
      const pic = g(node);
      const size = it.size ?? 120, ic = it.icon || {};
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("x", f2(-size / 2)); svg.setAttribute("y", f2(-size)); svg.setAttribute("width", f2(size)); svg.setAttribute("height", f2(size));
      svg.setAttribute("viewBox", `0 0 ${ic.width || 32} ${ic.height || 32}`); svg.setAttribute("overflow", "visible");
      svg.innerHTML = ic.body || "";
      pic.appendChild(svg);
      // A face (a thing that talks): two big eyes that blink and look about, a mouth that opens
      // with the voice (`face: { y, eyes, look }`, y as a share of the picture's height from its top).
      let face = null;
      if (it.face) {
        const f = it.face, fy = -size * (1 - (f.y ?? 0.55)), er = size * (f.eyes ?? 0.1), gap = size * 0.16;
        const fg = g(pic, { transform: `translate(0 ${f2(fy)})` });
        const eyes = [-1, 1].map((s) => {
          const e = g(fg, { transform: `translate(${f2(s * gap)} 0)` });
          const lid = g(e);
          el("ellipse", { cx: 0, cy: 0, rx: f2(er), ry: f2(er * 1.15), fill: "#fff", stroke: INK, "stroke-width": f2(er * 0.16) }, lid);
          const pupil = el("circle", { cx: 0, cy: 0, r: f2(er * 0.55), fill: INK }, lid);
          el("circle", { cx: f2(er * 0.2), cy: f2(-er * 0.25), r: f2(er * 0.18), fill: "#fff" }, lid);
          return { lid, pupil };
        });
        const mouth = el("path", { d: "", fill: "#7a1f2b", stroke: INK, "stroke-width": f2(er * 0.14), "stroke-linejoin": "round" }, fg);
        face = { eyes, mouth, er, gap, mw: size * 0.13, my: er * 1.9 };
      }
      const shadow = el("ellipse", { cx: 0, cy: 4, rx: f2(size * 0.42), ry: f2(size * 0.08), fill: "#000", opacity: 0.18 }, node, true);
      node.insertBefore(shadow, pic);
      const confetti = g(node);
      let label = null;
      if (it.label) {
        label = g(front);
        const big = it.label.size ?? 64, w = Math.max(String(it.label.text).length * big * 0.62, String(it.label.sub || "").length * big * 0.28) + big * 1.1;
        const h = big * (it.label.sub ? 1.9 : 1.35);
        el("rect", { x: f2(-w / 2), y: f2(-h), width: f2(w), height: f2(h), rx: f2(big * 0.35), fill: "#fffdf6", stroke: INK, "stroke-width": 5 }, label);
        el("path", { d: `M${f2(-big * 0.3)} -2 L0 ${f2(big * 0.35)} L${f2(big * 0.3)} -2 Z`, fill: "#fffdf6", stroke: INK, "stroke-width": 5, "stroke-linejoin": "round" }, label);
        el("rect", { x: f2(-big * 0.33), y: -8, width: f2(big * 0.66), height: 10, fill: "#fffdf6" }, label);
        const t1 = el("text", { x: 0, y: f2(-h + big * 1.05), "text-anchor": "middle", "font-family": "Nunito, 'Noto Sans', sans-serif", "font-weight": 900, "font-size": big, fill: "#e0452b" }, label);
        t1.textContent = it.label.text;
        if (it.label.sub) { const t2 = el("text", { x: 0, y: f2(-h + big * 1.65), "text-anchor": "middle", "font-family": "'Noto Sans', sans-serif", "font-weight": 600, "font-size": f2(big * 0.48), fill: "#5a4632" }, label); t2.textContent = it.label.sub; }
      }
      return { it, node, pic, shadow, confetti, label, face, size, seed: hash(it.id || "item") };
    });
  }

  /** Where an item is at t: its spot, a carrier's chest, a move's path. */
  function placeAt(I, t, ctx) {
    const it = I.it;
    let x = it.x ?? 0, lift = it.lift ?? 0;
    for (const m of it.moves || []) {
      if (t < m.at) continue;
      const k = smooth(seg(t, m.at, m.at + (m.dur ?? 0.6)));
      const tx = m.to?.[0] ?? x, tl = m.to?.[1] ?? lift;
      const nx = lerp(x, tx, k), nl = lerp(lift, tl, k) + Math.sin(Math.PI * seg(t, m.at, m.at + (m.dur ?? 0.6))) * (m.arc ?? 0);
      x = nx; lift = nl;
    }
    const c = it.carry;
    let hold = 1;
    if (c && t >= (c.from ?? 0) && t < (c.until ?? Infinity)) {
      const p = ctx.pointsAt(c.by, t), b = p.box, h = b[3] - b[1];
      x = (b[0] + b[2]) / 2 + (p.facing || 1) * (b[2] - b[0]) * 0.18;
      // Held in front of the chest, below the chin (18/11/2026: a big thing in a small child's
      // hands covered the face): no taller than a third of the one holding it.
      const x0 = x, lift0 = lift;
      hold = Math.min(1, (h * 0.32) / I.size);
      const chin = p.head ? p.head[1] + (p.headR || 0) * 1.05 : -Infinity;
      lift = -Math.max(b[1] + h * (c.dy ?? 0.5) + I.size * 0.5, chin + I.size * hold);
      // picked up: it rises into the hands and shrinks to fit them, no jump
      if (c.from > 0 && t < c.from + 0.3) { const k = smooth(seg(t, c.from, c.from + 0.3)); x = lerp(x0, x, k); lift = lerp(lift0, lift, k); hold = lerp(1, hold, k); }
    }
    return { x, lift, hold };
  }

  function render(list, t, ctx) {
    for (const I of list) {
      const it = I.it;
      const inK = it.from === undefined ? 1 : seg(t, it.from, it.from + 0.35);
      const outK = it.until === undefined ? 0 : seg(t, it.until, it.until + 0.25);
      // pop in: overshoot a little
      let scale = it.from === undefined ? 1 : inK >= 1 ? 1 : Math.sin(inK * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) * (inK < 0.01 ? 0 : 1);
      scale *= 1 - outK;
      let rot = 0, dy = 0;
      for (const s of it.shakes || []) {
        if (t < s.at || t > s.at + (s.dur ?? 1)) continue;
        const k = t - s.at, env = Math.sin(Math.PI * seg(t, s.at, s.at + (s.dur ?? 1)));
        rot += Math.sin(k * 38) * (s.amp ?? 12) * env;
        dy -= Math.abs(Math.sin(k * 19)) * (s.hop ?? 10) * env;
      }
      let burstK = 0;
      if (it.burst !== undefined && t >= it.burst) {
        burstK = seg(t, it.burst, it.burst + 0.3);
        scale *= burstK < 1 ? 1 + 0.35 * Math.sin(burstK * Math.PI * 0.5) : 0;
      }
      // opening (pops): it jumps, squashes as it lands, confetti flies; it stays
      let sx = 1, sy = 1;
      for (const p of it.pops || []) {
        if (t < p || t > p + 0.7) continue;
        const k = (t - p) / 0.7;
        dy -= Math.sin(Math.min(1, k / 0.55) * Math.PI) * I.size * 0.45;
        if (k > 0.55) { const q = Math.sin(((k - 0.55) / 0.45) * Math.PI); sx = 1 + 0.18 * q; sy = 1 - 0.18 * q; }
        rot += Math.sin(k * 18) * 8 * (1 - k);
      }
      const { x, lift, hold } = placeAt(I, t, ctx);
      scale *= hold;
      I.node.setAttribute("transform", `translate(${f2(x)} 0)`);
      I.pic.setAttribute("transform", `translate(0 ${f2(-lift + dy)}) rotate(${f2(rot)} 0 ${f2(-I.size * 0.1)}) scale(${f2(Math.max(0, scale) * sx)} ${f2(Math.max(0, scale) * sy)})`);
      I.shadow.setAttribute("opacity", f2(0.18 * clamp(scale) * clamp(1 - lift / 400)));
      if (I.face) {
        const F = I.face, talk = ctx.talkOf ? ctx.talkOf(it.id, t) : 0;
        // blink about every 3 s (its own rhythm), a glance left and right now and then
        const ph = (t + rand(I.seed) * 3) % 3.1, blink = ph < 0.12 ? Math.max(0.08, Math.abs(ph - 0.06) / 0.06) : 1;
        const look = (it.face.look ?? 0) + Math.sin(t * 0.9 + I.seed) * 0.25;
        for (const e of F.eyes) {
          e.lid.setAttribute("transform", `scale(1 ${f2(blink)})`);
          e.pupil.setAttribute("cx", f2(look * F.er * 0.35)); e.pupil.setAttribute("cy", f2(F.er * 0.1));
        }
        // a small smile shut; open with the voice
        const w = F.mw, o = 2 + talk * F.er * 1.5, y = F.my;
        F.mouth.setAttribute("d", talk > 0.04
          ? `M${f2(-w)} ${f2(y)} Q0 ${f2(y - o * 0.25)} ${f2(w)} ${f2(y)} Q0 ${f2(y + o * 1.6)} ${f2(-w)} ${f2(y)} Z`
          : `M${f2(-w)} ${f2(y)} Q0 ${f2(y + F.er * 0.7)} ${f2(w)} ${f2(y)} Q0 ${f2(y + F.er * 0.9)} ${f2(-w)} ${f2(y)} Z`);
      }
      // confetti from the burst: 18 bits flying out and falling
      let html = "";
      const boom = [...(it.burst !== undefined ? [it.burst] : []), ...(it.pops || [])].filter((b) => t >= b && t < b + 1.6).at(-1);
      if (boom !== undefined) {
        const k = t - boom, cols = ["#e0452b", "#f4b400", "#2f9e44", "#1c7ed6", "#ae3ec9", "#ff8fab"];
        for (let i = 0; i < 18; i++) {
          const a = -Math.PI * (0.1 + 0.8 * rand(I.seed + i)), v = 380 + 300 * rand(I.seed + 40 + i);
          const px = Math.cos(a) * v * k, py = -lift - I.size * 0.5 + Math.sin(a) * v * k + 700 * k * k;
          const r = 9 + 6 * rand(I.seed + 80 + i), op = clamp(1.6 - k);
          html += `<rect x="${f2(px - r / 2)}" y="${f2(py - r / 2)}" width="${f2(r)}" height="${f2(r * 0.6)}" fill="${cols[i % cols.length]}" opacity="${f2(op)}" transform="rotate(${f2(k * 500 + i * 37)} ${f2(px)} ${f2(py)})"/>`;
        }
      }
      I.confetti.innerHTML = html;
      if (I.label) {
        const L = it.label, a = seg(t, L.at, L.at + 0.3), b = L.until === undefined ? 0 : seg(t, L.until, L.until + 0.25);
        const s = (a < 1 ? Math.sin(a * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1) * (1 - b);
        const on = L.on ? ctx.pointsAt(L.on, t) : null;
        const lx = on ? (on.box[0] + on.box[2]) / 2 : x, ly = on ? on.box[1] - 30 : -lift - I.size * (it.burst !== undefined && t >= it.burst ? 0 : 1) - 30;
        I.label.setAttribute("transform", `translate(${f2(lx)} ${f2(ly + (L.dy ?? 0))}) scale(${f2(Math.max(0, t < L.at ? 0 : s))})`);
      }
    }
  }

  WA.items = { build, render };
})();
