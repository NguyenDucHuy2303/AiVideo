import type { Layout } from "../../layouts/index.ts";
import type { Actor } from "../../schema/timeline.ts";

/** Smoothstep from 0 to 1 while t goes from t0 to t0 + d (seconds), as an ffmpeg expression. */
const ease = (t0: number, d: number) => {
  const p = `clip((t-${t0.toFixed(3)})/${d.toFixed(3)},0,1)`;
  return `(${p}*${p}*(3-2*${p}))`;
};

/**
 * Filters that animate a cut-out silhouette over the scene: `chain` prepares the actor
 * stream (size, fades), `overlay` places it frame by frame. Feet stand on layout.actor.baseY
 * unless the action lifts them (rise, fly_up).
 */
export function actorFilters(actor: Actor, layout: Layout, fps: number, frames: number): { chain: string; overlay: string } {
  const S = actor.startFrame / fps;
  const L = frames / fps;
  const span = Math.max(0.5, L - S);
  const H = Math.round(actor.height * layout.actor.maxHeight);
  const base = layout.actor.baseY;
  const cx = Math.round(actor.x * layout.width);
  const centered = `${cx}-w/2`;
  const standing = `${base}-h`;

  const chain = ["format=rgba"];
  let x = centered;
  let y = standing;
  switch (actor.action) {
    case "grow":
      // From a child's size to a giant in ~1.4 s, feet planted.
      chain.push(`scale=w=-2:h='max(4,trunc((${Math.round(H * 0.28)}+${Math.round(H * 0.72)}*${ease(S, 1.4)})/2)*2)':eval=frame`);
      break;
    default:
      chain.push(`scale=-2:${H}:flags=lanczos`);
  }
  switch (actor.action) {
    case "enter_left":
      x = `-w+(${cx}-w/2+w)*${ease(S, 1.6)}`;
      break;
    case "enter_right":
      x = `W-(W-(${cx}-w/2))*${ease(S, 1.6)}`;
      break;
    case "charge":
      // Across the whole frame during the scene, with a gallop bob.
      x = `-w+(W+w)*clip((t-${S.toFixed(3)})/${(span * 0.92).toFixed(3)},0,1)`;
      y = `${base}-h-12*abs(sin(t*9))`;
      break;
    case "rise":
      y = `H-(H-(${base}-h))*${ease(S, 1.6)}`;
      break;
    case "fly_up": {
      // Hold, then accelerate up and out of the top of the frame.
      const lift = S + span * 0.3;
      y = `${base}-h-(${base}+60)*pow(clip((t-${lift.toFixed(3)})/${(span * 0.7).toFixed(3)},0,1),2)`;
      break;
    }
  }
  chain.push(`fade=t=in:st=${S.toFixed(3)}:d=${actor.action === "appear" ? 0.8 : 0.35}:alpha=1`);
  return { chain: chain.join(","), overlay: `overlay=x='${x}':y='${y}':eval=frame:format=auto` };
}

/** Decaying camera shake starting at `start` seconds, as a crop that is scaled back to size. */
export function shakeFilters(start: number, amplitude: number, width: number, height: number): string[] {
  const A = Math.max(2, Math.round(amplitude));
  const gate = `exp(-5*(t-${start.toFixed(3)}))*gte(t,${start.toFixed(3)})`;
  return [`crop=w=iw-${2 * A}:h=ih-${2 * A}:x='${A}+${A}*sin(t*47)*${gate}':y='${A}+${A}*cos(t*37)*${gate}'`, `scale=${width}:${height}`, "setsar=1"];
}
