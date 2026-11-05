import type { Layout } from "../../layouts/index.ts";
import type { Effect } from "../../schema/timeline.ts";
import { circleDrawing } from "./svg.ts";

/**
 * Particle and light effects as ASS events: each particle is a small vector shape with its
 * own \move and fades. Positions come from a seeded random generator, so a scene renders
 * the same way every time (and its cached clip stays valid).
 */

/** Small fast PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const bgr = (hex: string) => `&H${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase();
const alpha = (opacity: number) => `&H${Math.round((1 - opacity) * 255).toString(16).padStart(2, "0").toUpperCase()}&`;

function time(frame: number, fps: number): string {
  const cs = Math.round((frame / fps) * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

/** Effects sit under the texts and graphics (see ass.ts layers). */
const FX_LAYER = 0;

export function effectEvents(effects: Effect[], layout: Layout, fps: number, clipFrames: number, seedKey: string): string[] {
  const W = layout.width;
  const H = layout.height;
  const events: string[] = [];
  const add = (from: number, to: number, tags: string, drawing: string) => {
    const s = Math.max(0, Math.round(from));
    const e = Math.min(clipFrames, Math.round(to));
    if (e - s < 2) return;
    events.push(`Dialogue: ${FX_LAYER},${time(s, fps)},${time(e, fps)},gfx,,0,0,0,,{${tags}\\bord0\\shad0\\p1}${drawing}{\\p0}`);
  };
  const ms = (frames: number) => Math.round((frames / fps) * 1000);

  for (const fx of effects) {
    const r = rng(seedOf(`${seedKey}|${fx.type}`));
    const start = Math.min(fx.startFrame, clipFrames - 1);
    const span = clipFrames - start;
    const k = fx.intensity;
    const between = (a: number, b: number) => a + (b - a) * r();
    // Particles spawn throughout the scene, a few already in flight at the start.
    const spawns = (perSecond: number, life: number) => {
      const n = Math.max(1, Math.round((perSecond * k * (span + life)) / fps));
      return Array.from({ length: n }, () => start - life * 0.8 + r() * (span + life * 0.8));
    };

    switch (fx.type) {
      case "embers": {
        for (const t0 of spawns(14, fps * 3)) {
          const life = between(fps * 2, fps * 3.5);
          const x = between(0, W);
          const y = between(H * 0.65, H * 1.02);
          const rad = between(2.5, 6) * (H / 1080);
          const color = r() < 0.5 ? "#FFB347" : "#FF7A1A";
          add(t0, t0 + life, `\\an5\\move(${Math.round(x)},${Math.round(y)},${Math.round(x + between(-120, 120))},${Math.round(y - between(H * 0.3, H * 0.6))})\\1c${bgr(color)}\\1a${alpha(0.9)}\\blur2\\fad(${ms(life * 0.2)},${ms(life * 0.4)})`, circleDrawing(rad));
        }
        break;
      }
      case "dust": {
        for (const t0 of spawns(8, fps * 5)) {
          const life = between(fps * 4, fps * 6);
          const x = between(-50, W);
          const y = between(H * 0.45, H);
          add(t0, t0 + life, `\\an5\\move(${Math.round(x)},${Math.round(y)},${Math.round(x + between(80, 260))},${Math.round(y - between(10, 80))})\\1c${bgr("#E8D9B5")}\\1a${alpha(between(0.25, 0.5))}\\blur3\\fad(${ms(life * 0.3)},${ms(life * 0.3)})`, circleDrawing(between(2, 5) * (H / 1080)));
        }
        break;
      }
      case "stars": {
        const n = Math.round(60 * k);
        for (let i = 0; i < n; i++) {
          const x = between(0, W);
          const y = between(0, H * 0.55);
          const a = between(0.5, 1);
          const period = Math.round(between(700, 1800));
          // Twinkle: dim and brighten a few times over the scene.
          let tw = "";
          for (let t = Math.round(between(0, period)); t < ms(span); t += period) tw += `\\t(${t},${t + period / 2},\\1a${alpha(a * 0.3)})\\t(${t + period / 2},${t + period},\\1a${alpha(a)})`;
          add(start, clipFrames, `\\an5\\pos(${Math.round(x)},${Math.round(y)})\\1c${bgr("#FFF7D6")}\\1a${alpha(a)}\\blur1\\fad(600,0)${tw}`, circleDrawing(between(1.2, 3) * (H / 1080)));
        }
        break;
      }
      case "mist": {
        const n = Math.round(6 * k);
        for (let i = 0; i < n; i++) {
          const w = between(W * 0.5, W * 0.9);
          const h = between(H * 0.12, H * 0.22);
          const y = between(H * 0.45, H * 0.9);
          const x = between(-w / 2, W);
          const dx = between(80, 200) * (r() < 0.5 ? -1 : 1);
          add(start, clipFrames, `\\an5\\move(${Math.round(x)},${Math.round(y)},${Math.round(x + dx)},${Math.round(y)})\\1c${bgr("#F5F1E8")}\\1a${alpha(between(0.1, 0.18))}\\blur${Math.round(H / 25)}\\fad(1200,600)`, ellipse(w / 2, h / 2));
        }
        break;
      }
      case "light_rays": {
        const n = Math.round(5 * k);
        for (let i = 0; i < n; i++) {
          const x = between(W * 0.15, W * 0.85);
          const angle = between(-25, 25);
          const len = H * 1.3;
          const top = between(20, 60) * (H / 1080);
          const bottom = between(120, 260) * (H / 1080);
          const a = between(0.08, 0.16);
          add(start, clipFrames, `\\an8\\pos(${Math.round(x)},${Math.round(-H * 0.1)})\\org(${Math.round(x)},${Math.round(-H * 0.1)})\\frz${angle.toFixed(1)}\\1c${bgr("#FFE9A8")}\\1a${alpha(a)}\\blur${Math.round(H / 40)}\\fad(1500,800)\\t(0,${ms(span)},\\frz${(angle + between(-6, 6)).toFixed(1)})`, trapezoid(top, bottom, len));
        }
        break;
      }
      case "leaves": {
        for (const t0 of spawns(3, fps * 5)) {
          const life = between(fps * 4, fps * 6);
          const x = between(-W * 0.1, W * 0.9);
          const color = r() < 0.6 ? "#7FA650" : "#D9A441";
          const rot = Math.round(between(180, 720)) * (r() < 0.5 ? -1 : 1);
          add(t0, t0 + life, `\\an5\\move(${Math.round(x)},${Math.round(-40)},${Math.round(x + between(W * 0.1, W * 0.35))},${Math.round(H + 40)})\\1c${bgr(color)}\\1a${alpha(0.85)}\\frz0\\t(\\frz${rot})\\fad(300,300)`, ellipse(between(9, 15) * (H / 1080), between(4, 7) * (H / 1080)));
        }
        break;
      }
      case "rain": {
        for (const t0 of spawns(60, fps * 0.7)) {
          const life = between(fps * 0.5, fps * 0.8);
          const x = between(0, W * 1.1);
          add(t0, t0 + life, `\\an5\\move(${Math.round(x)},${Math.round(-60)},${Math.round(x - H * 0.18)},${Math.round(H + 60)})\\frz-10\\1c${bgr("#C9D8E8")}\\1a${alpha(0.45)}`, `m 0 0 l 2 0 l 2 ${Math.round(H / 24)} l 0 ${Math.round(H / 24)}`);
        }
        break;
      }
      case "flash":
        add(start, start + fps * 0.7, `\\an7\\pos(0,0)\\1c${bgr("#FFF8E7")}\\1a${alpha(0.85)}\\t(0,${ms(fps * 0.6)},\\1a&HFF&)`, `m 0 0 l ${W} 0 l ${W} ${H} l 0 ${H}`);
        break;
      case "shake":
        // Applied by the renderer to the whole picture (see shakeFilters).
        break;
    }
  }
  return events;
}

function ellipse(rx: number, ry: number): string {
  const kx = 0.5523 * rx;
  const ky = 0.5523 * ry;
  const P = (x: number, y: number) => `${Math.round(x + rx)} ${Math.round(y + ry)}`;
  return `m ${P(-rx, 0)} b ${P(-rx, -ky)} ${P(-kx, -ry)} ${P(0, -ry)} b ${P(kx, -ry)} ${P(rx, -ky)} ${P(rx, 0)} b ${P(rx, ky)} ${P(kx, ry)} ${P(0, ry)} b ${P(-kx, ry)} ${P(-rx, ky)} ${P(-rx, 0)}`;
}

/** A ray: narrow at the top, wide at the bottom; coordinates start at 0 (see circleDrawing). */
function trapezoid(top: number, bottom: number, length: number): string {
  const c = bottom / 2;
  const R = (n: number) => Math.round(n);
  return `m ${R(c - top / 2)} 0 l ${R(c + top / 2)} 0 l ${R(bottom)} ${R(length)} l 0 ${R(length)}`;
}
