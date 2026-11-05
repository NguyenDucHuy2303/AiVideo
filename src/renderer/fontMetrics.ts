import fs from "node:fs";
import path from "node:path";
import { FONTS_DIR } from "../config.ts";

/**
 * Minimal TrueType reader: glyph advance widths via cmap + hmtx. Lets us measure text
 * exactly as libass will lay it out instead of guessing an average character width.
 */
export class FontMetrics {
  /** ascender - descender in font units; libass scales this to the ASS font size. */
  readonly lineUnits: number;
  private readonly buf: Buffer;
  private readonly advances: number[];
  private readonly lookupGlyph: (cp: number) => number;
  private readonly cache = new Map<number, number>();

  constructor(buf: Buffer) {
    this.buf = buf;
    const tables = new Map<string, number>();
    const numTables = buf.readUInt16BE(4);
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      tables.set(buf.toString("latin1", rec, rec + 4), buf.readUInt32BE(rec + 8));
    }
    const table = (tag: string) => {
      const off = tables.get(tag);
      if (off === undefined) throw new Error(`font has no ${tag} table`);
      return off;
    };

    const hhea = table("hhea");
    this.lineUnits = buf.readInt16BE(hhea + 4) - buf.readInt16BE(hhea + 6);
    const numHMetrics = buf.readUInt16BE(hhea + 34);
    const hmtx = table("hmtx");
    this.advances = [];
    for (let i = 0; i < numHMetrics; i++) this.advances.push(buf.readUInt16BE(hmtx + i * 4));

    this.lookupGlyph = this.readCmap(table("cmap"));
  }

  private readCmap(cmap: number): (cp: number) => number {
    const buf = this.buf;
    const n = buf.readUInt16BE(cmap + 2);
    let fmt4 = -1;
    for (let i = 0; i < n; i++) {
      const rec = cmap + 4 + i * 8;
      const platform = buf.readUInt16BE(rec);
      const encoding = buf.readUInt16BE(rec + 2);
      const sub = cmap + buf.readUInt32BE(rec + 4);
      const format = buf.readUInt16BE(sub);
      if (format === 12 && (platform === 3 || platform === 0)) return this.cmap12(sub);
      if (format === 4 && ((platform === 3 && encoding === 1) || platform === 0)) fmt4 = sub;
    }
    if (fmt4 < 0) throw new Error("font has no usable Unicode cmap");
    return this.cmap4(fmt4);
  }

  private cmap12(sub: number): (cp: number) => number {
    const buf = this.buf;
    const groups = buf.readUInt32BE(sub + 12);
    return (cp) => {
      let lo = 0;
      let hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = sub + 16 + mid * 12;
        const start = buf.readUInt32BE(g);
        const end = buf.readUInt32BE(g + 4);
        if (cp < start) hi = mid - 1;
        else if (cp > end) lo = mid + 1;
        else return buf.readUInt32BE(g + 8) + (cp - start);
      }
      return 0;
    };
  }

  private cmap4(sub: number): (cp: number) => number {
    const buf = this.buf;
    const segX2 = buf.readUInt16BE(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < segX2; i += 2) {
        if (cp > buf.readUInt16BE(ends + i)) continue;
        const start = buf.readUInt16BE(starts + i);
        if (cp < start) return 0;
        const delta = buf.readInt16BE(deltas + i);
        const rangeOff = buf.readUInt16BE(ranges + i);
        if (rangeOff === 0) return (cp + delta) & 0xffff;
        const glyph = buf.readUInt16BE(ranges + i + rangeOff + (cp - start) * 2);
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
      return 0;
    };
  }

  /** Advance width of a code point in font units (missing glyphs use .notdef). */
  advance(cp: number): number {
    let w = this.cache.get(cp);
    if (w === undefined) {
      const glyph = this.lookupGlyph(cp);
      w = this.advances[Math.min(glyph, this.advances.length - 1)] ?? 0;
      this.cache.set(cp, w);
    }
    return w;
  }

  /** Width in pixels of `text` rendered by libass at ASS font size `size`. */
  width(text: string, size: number): number {
    let units = 0;
    for (const ch of text) units += this.advance(ch.codePointAt(0)!);
    return (units * size) / this.lineUnits;
  }
}

const loaded = new Map<string, FontMetrics>();

export function fontMetrics(bold: boolean): FontMetrics {
  const file = path.join(FONTS_DIR, bold ? "NotoSans-Bold.ttf" : "NotoSans-Regular.ttf");
  let m = loaded.get(file);
  if (!m) {
    m = new FontMetrics(fs.readFileSync(file));
    loaded.set(file, m);
  }
  return m;
}

export type Measure = (text: string) => number;

/**
 * Measure function for a style. Adds the outline on both sides plus a small margin for
 * kerning/hinting differences, so measured lines are never narrower than rendered ones.
 */
export function measureFor(bold: boolean, size: number, outline: number): Measure {
  const m = fontMetrics(bold);
  return (text) => m.width(text, size) * 1.03 + outline * 2;
}
