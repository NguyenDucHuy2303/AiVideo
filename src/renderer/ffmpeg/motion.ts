import type { Motion } from "../../schema/timeline.ts";

export interface ZoompanExpr {
  z: string;
  x: string;
  y: string;
}

const f = (n: number) => n.toFixed(4);

/**
 * zoompan expressions for a camera move over `frames` output frames.
 * Position is expressed as a fraction (0..1) of the free space around the zoomed view,
 * so the same preset works for any image size and aspect ratio.
 */
export function zoompanExpr(motion: Motion, frames: number, focus: { x: number; y: number }): ZoompanExpr {
  const p = `(on/${Math.max(1, frames - 1)})`;
  const e = `(${p}*${p}*(3-2*${p}))`; // smoothstep easing
  const fx = f(focus.x);
  const fy = f(focus.y);

  let z: string;
  let px: string = fx;
  let py: string = fy;
  switch (motion) {
    case "none":
      z = "1";
      break;
    case "ken_burns":
      z = `1+0.12*${e}`;
      px = `(0.5+(${fx}-0.5)*${e})`;
      py = `(0.5+(${fy}-0.5)*${e})`;
      break;
    case "zoom_in":
      z = `1+0.22*${e}`;
      break;
    case "zoom_out":
      z = `1.22-0.22*${e}`;
      break;
    case "pan_left":
      z = "1.15";
      px = `(1-${e})`;
      break;
    case "pan_right":
      z = "1.15";
      px = e;
      break;
    case "pan_up":
      z = "1.15";
      py = `(1-${e})`;
      break;
    case "pan_down":
      z = "1.15";
      py = e;
      break;
  }
  return { z, x: `(iw-iw/zoom)*${px}`, y: `(ih-ih/zoom)*${py}` };
}
