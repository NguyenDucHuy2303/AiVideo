/**
 * SVG icon geometry → ASS vector drawings, so libass draws icons in the same pass as the
 * text: crisp at any resolution, animatable with override tags, no image files.
 *
 * Icons are stroke-only (Lucide style). libass can't stroke a path directly, but it draws a
 * border around a shape with a transparent fill. A border around a closed shape only shows
 * outside it, and an open path gets closed, so every subpath is emitted forward and then
 * backward: a zero-area contour whose border is a stroke of 2 × \bord centered on the path.
 */

type Pt = [number, number];
type Seg = { kind: "l"; to: Pt } | { kind: "c"; c1: Pt; c2: Pt; to: Pt };
interface SubPath {
  start: Pt;
  segs: Seg[];
}

export type IconNode = [string, Record<string, string>];

/** Reads numbers and arc flags ("a4 4 0 01-3-4": flags may be packed without separators). */
class Scanner {
  i = 0;
  private readonly s: string;
  constructor(s: string) {
    this.s = s;
  }

  private skip(): void {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i]!)) this.i++;
  }

  atNumber(): boolean {
    this.skip();
    return this.i < this.s.length && /[-+.\d]/.test(this.s[this.i]!);
  }

  command(): string | undefined {
    this.skip();
    const c = this.s[this.i];
    if (c && /[a-zA-Z]/.test(c)) {
      this.i++;
      return c;
    }
    return undefined;
  }

  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`bad number in path at ${this.i}: "${this.s.slice(this.i, this.i + 10)}"`);
    this.i += m[0].length;
    return Number(m[0]);
  }

  flag(): boolean {
    this.skip();
    const c = this.s[this.i++];
    if (c !== "0" && c !== "1") throw new Error(`bad arc flag in path at ${this.i - 1}`);
    return c === "1";
  }
}

/** Endpoint-parameterized SVG arc → cubic Béziers (≤ 90° each). */
function arcToCubics(p0: Pt, rx: number, ry: number, angleDeg: number, large: boolean, sweep: boolean, p1: Pt): Seg[] {
  if (rx === 0 || ry === 0 || (p0[0] === p1[0] && p0[1] === p1[1])) return [{ kind: "l", to: p1 }];
  const phi = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0[0] - p1[0]) / 2;
  const dy = (p0[1] - p1[1]) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p1[0]) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0[1] + p1[1]) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const n = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): Pt => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): Pt => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const segs: Seg[] = [];
  for (let j = 0; j < n; j++) {
    const a = theta1 + j * step;
    const b = a + step;
    const pa = point(a);
    const pb = j === n - 1 ? p1 : point(b);
    const da = deriv(a);
    const db = deriv(b);
    segs.push({ kind: "c", c1: [pa[0] + k * da[0], pa[1] + k * da[1]], c2: [pb[0] - k * db[0], pb[1] - k * db[1]], to: pb });
  }
  return segs;
}

/** Parse an SVG path `d` attribute into absolute subpaths of lines and cubics. */
export function parsePath(d: string): SubPath[] {
  const sc = new Scanner(d);
  const paths: SubPath[] = [];
  let cur: SubPath | undefined;
  let pos: Pt = [0, 0];
  let lastCtrl: Pt | undefined; // for S/s (cubic) and T/t (quadratic) reflections
  let lastQuad: Pt | undefined;
  let cmd: string | undefined;

  const ensure = () => {
    if (!cur) {
      cur = { start: pos, segs: [] };
      paths.push(cur);
    }
    return cur;
  };
  const lineTo = (p: Pt) => {
    ensure().segs.push({ kind: "l", to: p });
    pos = p;
  };
  const cubicTo = (c1: Pt, c2: Pt, p: Pt) => {
    ensure().segs.push({ kind: "c", c1, c2, to: p });
    pos = p;
  };

  for (;;) {
    const next = sc.command();
    if (next) cmd = next;
    else if (!cmd || !sc.atNumber()) break;
    const rel = cmd === cmd.toLowerCase();
    const P = (x: number, y: number): Pt => (rel ? [pos[0] + x, pos[1] + y] : [x, y]);
    let ctrl: Pt | undefined;
    let quad: Pt | undefined;

    switch (cmd.toUpperCase()) {
      case "M": {
        pos = P(sc.number(), sc.number());
        cur = { start: pos, segs: [] };
        paths.push(cur);
        // Further coordinate pairs after a moveto are implicit linetos.
        cmd = rel ? "l" : "L";
        break;
      }
      case "L":
        lineTo(P(sc.number(), sc.number()));
        break;
      case "H": {
        const x = sc.number();
        lineTo([rel ? pos[0] + x : x, pos[1]]);
        break;
      }
      case "V": {
        const y = sc.number();
        lineTo([pos[0], rel ? pos[1] + y : y]);
        break;
      }
      case "C": {
        const c1 = P(sc.number(), sc.number());
        const c2 = P(sc.number(), sc.number());
        const p = P(sc.number(), sc.number());
        cubicTo(c1, c2, p);
        ctrl = c2;
        break;
      }
      case "S": {
        const c1: Pt = lastCtrl ? [2 * pos[0] - lastCtrl[0], 2 * pos[1] - lastCtrl[1]] : pos;
        const c2 = P(sc.number(), sc.number());
        const p = P(sc.number(), sc.number());
        cubicTo(c1, c2, p);
        ctrl = c2;
        break;
      }
      case "Q": {
        const q = P(sc.number(), sc.number());
        const p = P(sc.number(), sc.number());
        cubicTo([pos[0] + (2 / 3) * (q[0] - pos[0]), pos[1] + (2 / 3) * (q[1] - pos[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p);
        quad = q;
        break;
      }
      case "T": {
        const q: Pt = lastQuad ? [2 * pos[0] - lastQuad[0], 2 * pos[1] - lastQuad[1]] : pos;
        const p = P(sc.number(), sc.number());
        cubicTo([pos[0] + (2 / 3) * (q[0] - pos[0]), pos[1] + (2 / 3) * (q[1] - pos[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p);
        quad = q;
        break;
      }
      case "A": {
        const rx = sc.number();
        const ry = sc.number();
        const rot = sc.number();
        const large = sc.flag();
        const sweep = sc.flag();
        const p = P(sc.number(), sc.number());
        ensure().segs.push(...arcToCubics(pos, rx, ry, rot, large, sweep, p));
        pos = p;
        break;
      }
      case "Z": {
        if (cur) {
          if (pos[0] !== cur.start[0] || pos[1] !== cur.start[1]) cur.segs.push({ kind: "l", to: cur.start });
          pos = cur.start;
        }
        cur = undefined;
        cmd = undefined;
        break;
      }
      default:
        throw new Error(`unsupported path command "${cmd}"`);
    }
    lastCtrl = ctrl;
    lastQuad = quad;
  }
  return paths.filter((p) => p.segs.length);
}

const num = (v: string | undefined, fallback = 0) => (v === undefined ? fallback : Number(v));

/** Path data for a basic shape element, so everything goes through one parser. */
function shapeToPath(tag: string, a: Record<string, string>): string | undefined {
  switch (tag) {
    case "path":
      return a.d;
    case "line":
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case "polyline":
    case "polygon": {
      const pts = (a.points ?? "").trim().split(/[\s,]+/).map(Number);
      let d = "";
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]}`;
      return tag === "polygon" ? `${d}Z` : d;
    }
    case "circle":
    case "ellipse": {
      const cx = num(a.cx);
      const cy = num(a.cy);
      const rx = tag === "circle" ? num(a.r) : num(a.rx);
      const ry = tag === "circle" ? num(a.r) : num(a.ry);
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case "rect": {
      const x = num(a.x);
      const y = num(a.y);
      const w = num(a.width);
      const h = num(a.height);
      let rx = Math.min(num(a.rx, num(a.ry)), w / 2);
      let ry = Math.min(num(a.ry, num(a.rx)), h / 2);
      if (!rx || !ry) rx = ry = 0;
      if (!rx) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    default:
      return undefined;
  }
}

export interface Drawing {
  /** ASS drawing commands (\p1 units = px). */
  commands: string;
  /** Control-point box of the drawing, in px. */
  box: { x0: number; y0: number; x1: number; y1: number };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * ASS drawing of an icon scaled by `scale` (icon units → px). Every subpath is retraced so
 * the border tag strokes it (see the file comment).
 */
export function iconDrawing(nodes: IconNode[], scale: number): Drawing {
  const parts: string[] = [];
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const P = (p: Pt) => {
    const x = p[0] * scale;
    const y = p[1] * scale;
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
    return `${fmt(x)} ${fmt(y)}`;
  };
  for (const [tag, attrs] of nodes) {
    const d = shapeToPath(tag, attrs);
    if (!d) continue;
    for (const sp of parsePath(d)) {
      const out = [`m ${P(sp.start)}`];
      for (const s of sp.segs) out.push(s.kind === "l" ? `l ${P(s.to)}` : `b ${P(s.c1)} ${P(s.c2)} ${P(s.to)}`);
      // …and back to the start along the same curve.
      for (let i = sp.segs.length - 1; i >= 0; i--) {
        const s = sp.segs[i]!;
        const from = i === 0 ? sp.start : sp.segs[i - 1]!.to;
        out.push(s.kind === "l" ? `l ${P(from)}` : `b ${P(s.c2)} ${P(s.c1)} ${P(from)}`);
      }
      parts.push(out.join(" "));
    }
  }
  return { commands: parts.join(" "), box };
}

/**
 * Filled shapes (badges, cards). Not retraced: these use the fill, not the border.
 * Coordinates start at 0,0: libass misplaces drawings that extend into negative coordinates.
 */
export function circleDrawing(r: number): string {
  const k = 0.5523 * r;
  const P = (x: number, y: number) => `${fmt(x + r)} ${fmt(y + r)}`;
  return `m ${P(-r, 0)} b ${P(-r, -k)} ${P(-k, -r)} ${P(0, -r)} b ${P(k, -r)} ${P(r, -k)} ${P(r, 0)} b ${P(r, k)} ${P(k, r)} ${P(0, r)} b ${P(-k, r)} ${P(-r, k)} ${P(-r, 0)}`;
}

export function roundedRectDrawing(w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  const k = 0.5523 * r;
  return [
    `m ${fmt(r)} 0 l ${fmt(w - r)} 0`,
    `b ${fmt(w - r + k)} 0 ${fmt(w)} ${fmt(r - k)} ${fmt(w)} ${fmt(r)} l ${fmt(w)} ${fmt(h - r)}`,
    `b ${fmt(w)} ${fmt(h - r + k)} ${fmt(w - r + k)} ${fmt(h)} ${fmt(w - r)} ${fmt(h)} l ${fmt(r)} ${fmt(h)}`,
    `b ${fmt(r - k)} ${fmt(h)} 0 ${fmt(h - r + k)} 0 ${fmt(h - r)} l 0 ${fmt(r)}`,
    `b 0 ${fmt(r - k)} ${fmt(r - k)} 0 ${fmt(r)} 0`,
  ].join(" ");
}
