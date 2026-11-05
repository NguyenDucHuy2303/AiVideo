import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../../config.ts";
import { iconDrawing, type Drawing, type IconNode } from "./svg.ts";

/** Curated Lucide icons (ISC), vendored by scripts/vendor-icons.ts. */
const FILE = path.join(ROOT, "assets", "icons", "lucide.json");
const ICONS = (JSON.parse(fs.readFileSync(FILE, "utf8")) as { icons: Record<string, IconNode[]> }).icons;

/** Lucide draws on a 24×24 grid with a 2-unit stroke. */
export const ICON_GRID = 24;
export const ICON_STROKE = 2;

export const ICON_NAMES = Object.keys(ICONS) as [string, ...string[]];
export const FALLBACK_ICON = "sparkles";

export function isIcon(name: string): boolean {
  return Object.hasOwn(ICONS, name);
}

const cache = new Map<string, Drawing>();

/** Drawing of an icon `size` px wide. */
export function icon(name: string, size: number): Drawing {
  const key = `${name}@${size}`;
  let d = cache.get(key);
  if (!d) {
    const nodes = ICONS[name];
    if (!nodes) throw new Error(`unknown icon "${name}"`);
    d = iconDrawing(nodes, size / ICON_GRID);
    cache.set(key, d);
  }
  return d;
}

/**
 * Override tags + drawing that put an icon's 24×24 grid centered on (x, y). libass centers a
 * drawing's own box under \an5, so shift by how far that box sits from the grid center.
 */
export function iconEvent(
  name: string,
  size: number,
  x: number,
  y: number,
  color: string,
  extraTags = "",
  position: (x: number, y: number) => string = (px, py) => `\\pos(${Math.round(px)},${Math.round(py)})`,
): string {
  const d = icon(name, size);
  const dx = (d.box.x0 + d.box.x1) / 2 - size / 2;
  const dy = (d.box.y0 + d.box.y1) / 2 - size / 2;
  const bord = ((ICON_STROKE * size) / ICON_GRID / 2).toFixed(2);
  return `{\\an5${position(x + dx, y + dy)}\\1a&HFF&\\3c${color}\\bord${bord}\\shad0${extraTags}\\p1}${d.commands}{\\p0}`;
}
