/*
 * Wata cartoon runtime: shared helpers. Classic scripts on purpose (no ES modules), so the
 * player opens straight from file:// in headless Chrome or any browser; every file adds
 * itself to window.WA.
 *
 * Conventions used by the whole library:
 * - World units: ground at y = 0, up is negative y; a child is about 300 units tall.
 * - Characters are drawn facing right (+x); facing left mirrors the whole rig.
 * - Joint angles in degrees: limbs hang down at 0, positive swings forward (towards the
 *   face); torso and head positive lean forward.
 * - Everything is a pure function of time: renderFrame(t) gives the same picture every run.
 */
(function () {
  const WA = (window.WA = window.WA || {});
  const NS = "http://www.w3.org/2000/svg";

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => (b === a ? (t >= a ? 1 : 0) : clamp((t - a) / (b - a)));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const EASE = {
    linear: (t) => clamp(t),
    smooth,
    in: (t) => Math.pow(clamp(t), 3),
    out: (t) => 1 - Math.pow(1 - clamp(t), 3),
    inOut: (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    backOut: (t) => { t = clamp(t); const c = 1.5; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    elastic: (t) => { t = clamp(t); return t === 0 || t === 1 ? t : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; },
  };
  /** 0 → 1 → 0 over [a, b]: a bump, for one-off moves (crouch, landing, flash). */
  const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * seg(t, a, b)));

  /** Small fast PRNG (mulberry32): the same seed always gives the same sequence. */
  function rand(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /** A value over a looping cycle u ∈ [0,1) through [u, value] keys, eased between keys. */
  function cycle(keys, u) {
    u = ((u % 1) + 1) % 1;
    for (let i = 0; i < keys.length - 1; i++) {
      const [u0, v0] = keys[i], [u1, v1] = keys[i + 1];
      if (u >= u0 && u <= u1) return lerp(v0, v1, smooth((u - u0) / (u1 - u0)));
    }
    return keys[keys.length - 1][1];
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const g = (parent, attrs) => el("g", attrs, parent);
  const f2 = (n) => (Math.round(n * 100) / 100).toString();
  const tr = (e, x, y, rot = 0, sx = 1, sy = sx) =>
    e.setAttribute("transform", `translate(${f2(x)},${f2(y)}) rotate(${f2(rot)}) scale(${sx.toFixed(4)},${sy.toFixed(4)})`);

  /** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255)).toString(16).padStart(2, "0");
    return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
  }
  function mixColor(a, b, k) {
    const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
    const c = (s) => Math.round(lerp((p >> s) & 255, (q >> s) & 255, k)).toString(16).padStart(2, "0");
    return `#${c(16)}${c(8)}${c(0)}`;
  }

  const INK = "#24150c";
  const OUT = { stroke: INK, "stroke-width": 4.5, "stroke-linejoin": "round", "stroke-linecap": "round" };

  /** Interpolate every number (and [a, b] pair) of two flat objects; others come from b. */
  function blend(a, b, k) {
    if (k >= 1 || !a) return b;
    if (k <= 0) return a;
    const out = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[key], y = b[key];
      if (typeof x === "number" && typeof y === "number") out[key] = lerp(x, y, k);
      else if (Array.isArray(x) && Array.isArray(y)) out[key] = x.map((v, i) => lerp(v, y[i], k));
      else if (x && y && typeof x === "object" && typeof y === "object") out[key] = blend(x, y, k);
      else out[key] = y !== undefined ? (k < 0.5 && x !== undefined ? x : y) : x;
    }
    return out;
  }

  WA.core = { NS, clamp, lerp, seg, smooth, EASE, bump, rand, hash, cycle, el, g, f2, tr, shade, mixColor, INK, OUT, blend };
})();
