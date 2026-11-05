import type { Layout } from "../../layouts/index.ts";
import type { Graphic } from "../../schema/timeline.ts";
import { measureFor } from "../fontMetrics.ts";
import { wrapBalanced } from "../text.ts";
import { iconEvent } from "./icons.ts";
import { circleDrawing, roundedRectDrawing } from "./svg.ts";

/** Area the graphic may use, in px (between the heading and the captions). */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const WHITE = "#FFFFFF";
const ACCENT = "#FACC15";
const CARD = "#0F172A";
const TONES = {
  neutral: ["#93C5FD", "#FACC15"],
  bad_good: ["#F87171", "#4ADE80"],
} as const;
/** Text in graphics gets a thin dark outline so it reads on any background. */
const OUTLINE = 3;

/** Sizes per output shape, in px. */
const SIZES = {
  "9x16": { number: 300, unitRatio: 0.38, label: 58, row: 170, listText: 56, cardTitle: 58, cardPoint: 46, cardIcon: 120, cardMaxW: 9999, bigIcon: 380, iconLabel: 64, gap: 40, listMaxW: 9999 },
  "16x9": { number: 240, unitRatio: 0.38, label: 50, row: 125, listText: 50, cardTitle: 54, cardPoint: 42, cardIcon: 110, cardMaxW: 620, bigIcon: 290, iconLabel: 56, gap: 50, listMaxW: 1150 },
} as const;

/** ASS colour (&HBBGGRR&) from #RRGGBB. Override tags take alpha separately. */
function color(hex: string): string {
  return `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase();
}
const alphaHex = (a: number) => `&H${a.toString(16).padStart(2, "0").toUpperCase()}&`;
/** Fill colour + opacity (0 = invisible, 1 = opaque) of a drawing. */
const fill = (hex: string, opacity = 1) => `\\1c${color(hex)}\\1a${alphaHex(Math.round((1 - opacity) * 255))}`;
const stroke = (hex: string, width: number, opacity = 1) => `\\3c${color(hex)}\\3a${alphaHex(Math.round((1 - opacity) * 255))}\\bord${width}`;

function time(frame: number, fps: number): string {
  const cs = Math.round((frame / fps) * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

interface Ctx {
  fps: number;
  end: number;
  events: string[];
}

function emit(ctx: Ctx, layer: number, bold: boolean, start: number, text: string, end = ctx.end): void {
  const s = Math.min(start, ctx.end - 1);
  if (end <= s) return;
  // Graphics use layers 1–3: above effects (0), under texts (4).
  ctx.events.push(`Dialogue: ${layer + 1},${time(s, ctx.fps)},${time(end, ctx.fps)},${bold ? "gfxb" : "gfx"},,0,0,0,,${text}`);
}

/** Text wrapped into at most `maxLines` balanced lines, shrinking the size until it fits. */
function fit(text: string, size: number, maxWidth: number, maxLines: number, bold: boolean): { size: number; lines: string[]; height: number } {
  const min = Math.round(size * 0.7);
  for (let s = size; ; s -= 2) {
    const lines = wrapBalanced(text, maxWidth, measureFor(bold, s, OUTLINE));
    if (lines.length <= maxLines || s <= min) return { size: s, lines, height: lines.length * s };
  }
}

const textTags = (size: number, hex: string) => `\\fs${size}\\1c${color(hex)}\\3c${color("#000000")}\\bord${OUTLINE}\\shad0`;
/** Position, optionally gliding in from (dx, dy) over `ms`. */
const place = (x: number, y: number, dx = 0, dy = 0, ms = 350) =>
  dx || dy ? `\\move(${Math.round(x + dx)},${Math.round(y + dy)},${Math.round(x)},${Math.round(y)},0,${ms})` : `\\pos(${Math.round(x)},${Math.round(y)})`;
/** Scale in from 0 with a slight overshoot. */
const pop = (delayMs = 0, ms = 380) => `\\fscx0\\fscy0\\t(${delayMs},${delayMs + ms},\\fscx108\\fscy108)\\t(${delayMs + ms},${delayMs + ms + 140},\\fscx100\\fscy100)`;

/** "1.500" → 1500 with "." grouping; "3,5" → 3.5; "30%" keeps its suffix. Ranges are not countable. */
export function countable(value: string): { n: number; decimals: number; grouped: boolean; suffix: string } | undefined {
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(%|\+|x)?$/.exec(value.trim());
  if (!m) return undefined;
  const int = Number(m[1]!.replace(/\./g, ""));
  const dec = m[2] ?? "";
  return { n: Number(`${int}.${dec || "0"}`), decimals: dec.length, grouped: m[1]!.includes("."), suffix: m[3] ?? "" };
}

export function formatCount(v: number, c: NonNullable<ReturnType<typeof countable>>): string {
  const [int, dec] = v.toFixed(c.decimals).split(".");
  const grouped = c.grouped ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : int!;
  return `${grouped}${dec ? `,${dec}` : ""}${c.suffix}`;
}

function bigNumber(g: Extract<Graphic, { type: "big_number" }>, r: Region, L: Layout, ctx: Ctx): void {
  const S = SIZES[L.id];
  const w = r.x1 - r.x0;
  const cx = (r.x0 + r.x1) / 2;
  const label = g.label ? fit(g.label, S.label, w * 0.9, 2, false) : undefined;
  const unit = g.unit ? ` ${g.unit}` : "";
  const barH = 12;
  const barGap = 28;
  let size = Math.min(S.number, r.y1 - r.y0 - (label ? label.height + S.gap : 0) - barGap - barH);
  const width = (s: number) => measureFor(true, s, OUTLINE)(g.value) + (unit ? measureFor(true, Math.round(s * S.unitRatio), OUTLINE)(unit) : 0);
  while (width(size) > w * 0.95 && size > 60) size = Math.round(size * 0.92);
  const unitSize = Math.round(size * S.unitRatio);
  const blockH = size + barGap + barH + (label ? S.gap + label.height : 0);
  const top = (r.y0 + r.y1) / 2 - blockH / 2;
  const start = g.startFrame;

  const numberText = (v: string) => `${v}{\\fs${unitSize}\\1c${color(WHITE)}}${unit}`;
  const head = `\\an8${place(cx, top)}${textTags(size, ACCENT)}`;
  const c = countable(g.value);
  if (c) {
    // Count up over ~0.9 s, easing out, then hold the exact value as written.
    const steps = Math.max(2, Math.round((ctx.fps * 0.9) / 2));
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const v = c.n * (1 - (1 - t) ** 3);
      const from = start + (k - 1) * 2;
      emit(ctx, 2, true, from, `{${head}${k === 1 ? "\\fad(150,0)" : ""}}${numberText(formatCount(v, c))}`, k === steps ? ctx.end : from + 2);
    }
    emit(ctx, 2, true, start + steps * 2, `{${head}}${numberText(g.value)}`);
  } else {
    emit(ctx, 2, true, start, `{${head}\\fad(150,0)${pop()}}${numberText(g.value)}`);
  }

  const barW = Math.min(width(size), w) * 0.5;
  emit(ctx, 1, false, start + 4, `{\\an8${place(cx, top + size + barGap)}\\1c${color(ACCENT)}\\bord0\\shad0\\fscx0\\t(0,500,\\fscx100)\\p1}${roundedRectDrawing(barW, barH, barH / 2)}{\\p0}`);
  if (label) {
    emit(ctx, 2, false, start + Math.round(ctx.fps * 0.35), `{\\an8${place(cx, top + size + barGap + barH + S.gap, 0, 24)}${textTags(label.size, WHITE)}\\fad(250,0)}${label.lines.join("\\N")}`);
  }
}

function list(g: Extract<Graphic, { type: "list" }>, r: Region, L: Layout, ctx: Ctx): void {
  const S = SIZES[L.id];
  const blockW = Math.min(r.x1 - r.x0, S.listMaxW);
  let badge = Math.round(S.row * 0.72);
  const gapX = 36;
  const rowGap = 26;
  // One text size for all rows, so the list reads as a set.
  const fitAll = (badgeSize: number) => {
    const fits = g.items.map((it) => fit(it.text, S.listText, blockW - badgeSize - gapX, 2, true));
    const size = Math.min(...fits.map((f) => f.size));
    const lines = g.items.map((it) => fit(it.text, size, blockW - badgeSize - gapX, 2, true).lines);
    const rows = lines.map((l) => Math.max(badgeSize, l.length * size));
    return { size, lines, rows, total: rows.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1) };
  };
  let f = fitAll(badge);
  while (f.total > r.y1 - r.y0 && badge > 60) {
    badge = Math.round(badge * 0.9);
    f = fitAll(badge);
  }
  // Center the block on its real width: short items would otherwise hug the left edge.
  const measure = measureFor(true, f.size, OUTLINE);
  const used = badge + gapX + Math.max(...f.lines.flat().map(measure));
  const x0 = (r.x0 + r.x1) / 2 - Math.min(used, blockW) / 2;
  let y = (r.y0 + r.y1) / 2 - f.total / 2;
  g.items.forEach((it, i) => {
    const rowH = f.rows[i]!;
    const cy = y + rowH / 2;
    const bx = x0 + badge / 2;
    emit(ctx, 1, false, it.startFrame, `{\\an5${place(bx, cy, -40)}${fill(ACCENT, 0.22)}\\bord0\\shad0\\fad(250,0)\\p1}${circleDrawing(badge / 2)}{\\p0}`);
    emit(ctx, 2, false, it.startFrame, iconEvent(it.icon, Math.round(badge * 0.52), bx, cy, color(ACCENT), "\\fad(250,0)", (px, py) => place(px, py, -40)));
    emit(ctx, 2, true, it.startFrame, `{\\an4${place(x0 + badge + gapX, cy, -40)}${textTags(f.size, WHITE)}\\fad(250,0)}${f.lines[i]!.join("\\N")}`);
    y += rowH + rowGap;
  });
}

/**
 * Two cards. Side by side on 16:9; stacked on 9:16, where side-by-side columns would be too
 * narrow for readable text (icon on the left, title and points on the right).
 */
function compare(g: Extract<Graphic, { type: "compare" }>, r: Region, L: Layout, ctx: Ctx): void {
  const S = SIZES[L.id];
  const stacked = L.id === "9x16";
  const cx = (r.x0 + r.x1) / 2;
  const regionW = r.x1 - r.x0;
  const cardW = stacked ? regionW : Math.min((regionW - S.gap) / 2, S.cardMaxW);
  const pad = 36;
  const iconGap = 32;
  const textW = stacked ? cardW - 2 * pad - S.cardIcon - iconGap : cardW - 2 * pad;
  const sides = [g.left, g.right].map((side) => {
    const title = fit(side.title, S.cardTitle, textW, 2, true);
    const points = side.points.map((p) => fit(`• ${p}`, S.cardPoint, textW, 2, false));
    const text = title.height + (points.length ? 20 + points.reduce((a, p) => a + p.height, 0) + 10 * (points.length - 1) : 0);
    const content = stacked ? Math.max(S.cardIcon, text) : S.cardIcon + 24 + text;
    return { side, title, points, content };
  });
  const colors = TONES[g.tone];
  const rise = 40;

  const heights = stacked ? sides.map((s) => s.content + 2 * pad) : sides.map(() => Math.max(...sides.map((s) => s.content)) + 2 * pad);
  const total = stacked ? heights[0]! + S.gap + heights[1]! : heights[0]!;
  const top0 = (r.y0 + r.y1) / 2 - Math.min(total, r.y1 - r.y0) / 2;

  sides.forEach((s, i) => {
    const x = stacked ? cx - cardW / 2 : i === 0 ? cx - S.gap / 2 - cardW : cx + S.gap / 2;
    const top = stacked && i === 1 ? top0 + heights[0]! + S.gap : top0;
    const cardH = heights[i]!;
    const start = i === 0 ? g.startFrame : Math.max(g.rightStartFrame, g.startFrame + Math.round(ctx.fps * 0.4));
    const hex = colors[i]!;
    emit(ctx, 0, false, start, `{\\an7${place(x, top, 0, rise)}${fill(CARD, 0.75)}${stroke(hex, 3)}\\shad0\\fad(300,0)\\p1}${roundedRectDrawing(cardW, cardH, 28)}{\\p0}`);

    const iconX = stacked ? x + pad + S.cardIcon / 2 : x + cardW / 2;
    const iconY = stacked ? top + cardH / 2 : top + pad + S.cardIcon / 2;
    emit(ctx, 1, false, start, iconEvent(s.side.icon, S.cardIcon, iconX, iconY, color(hex), "\\fad(300,0)", (px, py) => place(px, py, 0, rise)));

    const textH = s.title.height + (s.points.length ? 20 + s.points.reduce((a, p) => a + p.height, 0) + 10 * (s.points.length - 1) : 0);
    const tx = stacked ? x + pad + S.cardIcon + iconGap : x + cardW / 2;
    let y = stacked ? top + cardH / 2 - textH / 2 : top + pad + S.cardIcon + 24;
    const align = stacked ? "\\an7" : "\\an8";
    emit(ctx, 1, true, start, `{${align}${place(tx, y, 0, rise)}${textTags(s.title.size, hex)}\\fad(300,0)}${s.title.lines.join("\\N")}`);
    y += s.title.height + 20;
    s.points.forEach((p, j) => {
      const delay = start + Math.round(ctx.fps * 0.25) * (j + 1);
      // Continuation lines are indented to sit under the text, not the bullet.
      const text = p.lines.map((l, k) => (k === 0 ? l : `\\h\\h\\h${l}`)).join("\\N");
      const px = stacked ? tx : x + pad;
      emit(ctx, 1, false, delay, `{\\an7${place(px, y, 0, 20)}${textTags(p.size, WHITE)}\\fad(250,0)}${text}`);
      y += p.height + 10;
    });
  });
}

function bigIcon(g: Extract<Graphic, { type: "icon" }>, r: Region, L: Layout, ctx: Ctx): void {
  const S = SIZES[L.id];
  const cx = (r.x0 + r.x1) / 2;
  const label = g.label ? fit(g.label, S.iconLabel, (r.x1 - r.x0) * 0.9, 2, true) : undefined;
  const labelBlock = label ? S.gap + label.height : 0;
  const size = Math.min(S.bigIcon, (r.y1 - r.y0 - labelBlock) / 1.6);
  const ring = size * 0.78;
  const cy = (r.y0 + r.y1) / 2 - labelBlock / 2;
  emit(ctx, 0, false, g.startFrame, `{\\an5${place(cx, cy)}${fill(ACCENT, 0.16)}${stroke(ACCENT, 4, 0.6)}\\shad0${pop(0, 420)}\\p1}${circleDrawing(ring)}{\\p0}`);
  emit(ctx, 1, false, g.startFrame, iconEvent(g.icon, Math.round(size), cx, cy, color(ACCENT), pop(120, 380)));
  if (label) {
    emit(ctx, 1, true, g.startFrame + Math.round(ctx.fps * 0.4), `{\\an8${place(cx, cy + ring + S.gap, 0, 24)}${textTags(label.size, WHITE)}\\fad(250,0)}${label.lines.join("\\N")}`);
  }
}

/** Dialogue lines drawing `g` inside `region`. Uses styles "gfx" and "gfxb" (see ass.ts). */
export function graphicEvents(g: Graphic, region: Region, layout: Layout, fps: number, clipFrames: number): string[] {
  const ctx: Ctx = { fps, end: clipFrames, events: [] };
  switch (g.type) {
    case "big_number":
      bigNumber(g, region, layout, ctx);
      break;
    case "list":
      list(g, region, layout, ctx);
      break;
    case "compare":
      compare(g, region, layout, ctx);
      break;
    case "icon":
      bigIcon(g, region, layout, ctx);
      break;
  }
  return ctx.events;
}
