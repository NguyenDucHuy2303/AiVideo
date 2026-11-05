import { AUDIO_SAMPLE_RATE, FFMPEG, TIMEOUTS } from "../config.ts";
import { run } from "../utils/process.ts";

/**
 * Music and sound effects synthesized by ffmpeg itself: no samples, no licences, the same
 * output for the same input. The music is a pentatonic plucked melody (in the spirit of the
 * đàn tranh) over a soft drone, with drums for battle; effects are short synthesized hits.
 */

export const MUSIC_MOODS = ["calm", "tense", "battle", "majestic"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
export const SFX_TYPES = ["boom", "whoosh", "drums", "wind", "shimmer", "chime"] as const;
export type SfxType = (typeof SFX_TYPES)[number];

export interface MusicSection {
  start: number;
  duration: number;
  mood: MusicMood;
}
export interface SfxEvent {
  type: SfxType;
  at: number;
}

/** Root G3, the "Bắc" pentatonic mode: do re fa sol la. */
const ROOT = 196;
const SCALE = [0, 2, 5, 7, 9];

const MOOD: Record<MusicMood, { beat: number; rest: number; octave: number; drumEvery: number; drum: number; pluck: number; drone: number }> = {
  calm: { beat: 0.8, rest: 0.35, octave: 0.15, drumEvery: 0, drum: 0, pluck: 0.3, drone: 0.16 },
  tense: { beat: 1.0, rest: 0.45, octave: 0.05, drumEvery: 2, drum: 0.35, pluck: 0.22, drone: 0.22 },
  battle: { beat: 0.36, rest: 0.25, octave: 0.25, drumEvery: 1, drum: 0.55, pluck: 0.26, drone: 0.18 },
  majestic: { beat: 0.6, rest: 0.2, octave: 0.45, drumEvery: 4, drum: 0.3, pluck: 0.32, drone: 0.2 },
};

/** Pseudo-random in [0,1) from an expression, the classic sin hash. */
const hash = (x: string, salt: number) => `(abs(sin((${x})*12.9898+${salt})*43758.5453)-floor(abs(sin((${x})*12.9898+${salt})*43758.5453)))`;

/** aevalsrc expression for one music section. `seed` varies the melody between sections. */
export function musicExpr(mood: MusicMood, seed: number): string {
  const m = MOOD[mood];
  const degree = `floor(${hash("ld(0)", seed)}*5)`;
  const semis = SCALE.reduceRight((acc, s, i) => (i === SCALE.length - 1 ? String(s) : `if(eq(ld(3),${i}),${s},${acc})`), "");
  return [
    `st(0,floor(t/${m.beat}))`,
    `st(1,t-ld(0)*${m.beat})`,
    `st(3,${degree})`,
    `st(4,${semis})`,
    `st(5,${ROOT}*pow(2,(ld(4)+12*gt(${hash("ld(0)", seed + 7)},${1 - m.octave}))/12))`,
    `st(6,gt(${hash("ld(0)", seed + 3)},${m.rest}))`,
    // Plucked string: three harmonics, fast decay, 5 ms attack (an instant start clicks).
    `st(7,ld(6)*(1-exp(-200*ld(1)))*exp(-3.5*ld(1))*(sin(2*PI*ld(5)*ld(1))+0.45*sin(4*PI*ld(5)*ld(1))+0.15*sin(6*PI*ld(5)*ld(1))))`,
    `st(8,(0.35*sin(2*PI*${ROOT / 2}*t)+0.25*sin(2*PI*${(ROOT * 0.75).toFixed(2)}*t))*(0.6+0.4*sin(2*PI*0.08*t)))`,
    m.drumEvery
      ? `st(9,t-floor(t/${m.beat * m.drumEvery})*${m.beat * m.drumEvery});st(10,exp(-7*ld(9))*sin(2*PI*(55+70*exp(-25*ld(9)))*ld(9)))`
      : "st(10,0)",
    `${m.pluck}*ld(7)+${m.drone}*ld(8)+${m.drum}*ld(10)`,
  ].join(";");
}

/** One synthesized effect: lavfi source + filter chain, and its length in seconds. */
export function sfxSource(type: SfxType): { src: string; chain: string; duration: number } {
  const sr = AUDIO_SAMPLE_RATE;
  switch (type) {
    case "boom":
      return { src: `aevalsrc='0.9*exp(-3*t)*sin(2*PI*(38+55*exp(-6*t))*t)+0.25*exp(-14*t)*(random(0)*2-1)':s=${sr}:d=2.2`, chain: "lowpass=f=900", duration: 2.2 };
    case "whoosh":
      return { src: `anoisesrc=color=pink:r=${sr}:d=1.2:a=0.5`, chain: "highpass=f=300,lowpass=f=2500,afade=t=in:d=0.55:curve=qsin,afade=t=out:st=0.55:d=0.65:curve=qsin", duration: 1.2 };
    case "drums": {
      // A short war-drum roll: eight hits, the last ones louder.
      const hit = (t0: number, g: number) => `${g}*gte(t,${t0})*exp(-7*(t-${t0}))*sin(2*PI*(60+80*exp(-25*(t-${t0})))*(t-${t0}))`;
      const hits = [0, 0.25, 0.5, 0.75, 1.0, 1.15, 1.3, 1.45].map((t0, i) => hit(t0, 0.5 + i * 0.06)).join("+");
      return { src: `aevalsrc='${hits}':s=${sr}:d=2.4`, chain: "lowpass=f=1200", duration: 2.4 };
    }
    case "wind":
      return { src: `anoisesrc=color=brown:r=${sr}:d=5:a=0.6`, chain: "lowpass=f=600,tremolo=f=0.35:d=0.6,afade=t=in:d=1.5,afade=t=out:st=3.3:d=1.7", duration: 5 };
    case "shimmer": {
      const notes = [784, 880, 1047, 1175, 1568].map((f, i) => `gte(t,${i * 0.11})*exp(-2.5*(t-${i * 0.11}))*sin(2*PI*${f}*(t-${i * 0.11}))`).join("+");
      return { src: `aevalsrc='0.22*(${notes})':s=${sr}:d=2.5`, chain: "aecho=0.8:0.6:90:0.3", duration: 2.5 };
    }
    case "chime":
      return { src: `aevalsrc='0.35*exp(-1.8*t)*sin(2*PI*523.25*t)+0.2*exp(-2.6*t)*sin(2*PI*784*t)+0.1*exp(-3.5*t)*sin(2*PI*1568*t)':s=${sr}:d=3`, chain: "aecho=0.8:0.5:120:0.25", duration: 3 };
  }
}

/** ffmpeg arguments that render the whole bed (music sections + effects) to a mono WAV. */
export function soundtrackArgs(sections: MusicSection[], sfx: SfxEvent[], totalSeconds: number, output: string): string[] {
  const inputs: string[] = [];
  const chains: string[] = [];
  const fade = 1.5;
  sections.forEach((s, i) => {
    // Sections overlap by the fade, so they crossfade instead of stopping and starting.
    const d = s.duration + fade;
    inputs.push("-f", "lavfi", "-i", `aevalsrc='${musicExpr(s.mood, 17 * (i + 1))}':s=${AUDIO_SAMPLE_RATE}:d=${d.toFixed(3)}`);
    chains.push(`[${i}:a]aecho=0.8:0.7:140|260:0.22|0.12,lowpass=f=5500,afade=t=in:d=${fade}:curve=qsin,afade=t=out:st=${(d - fade).toFixed(3)}:d=${fade}:curve=qsin,adelay=${Math.round(Math.max(0, s.start - (i ? fade / 2 : 0)) * 1000)}:all=1[a${i}]`);
  });
  sfx.forEach((e, j) => {
    const i = sections.length + j;
    const { src, chain } = sfxSource(e.type);
    inputs.push("-f", "lavfi", "-i", src);
    chains.push(`[${i}:a]${chain},adelay=${Math.round(Math.max(0, e.at) * 1000)}:all=1[a${i}]`);
  });
  const n = sections.length + sfx.length;
  const total = Math.round(totalSeconds * AUDIO_SAMPLE_RATE);
  const labels = Array.from({ length: n }, (_, i) => `[a${i}]`).join("");
  const graph = [
    ...chains,
    `${labels}amix=inputs=${n}:normalize=0:dropout_transition=0,apad,atrim=end_sample=${total},loudnorm=I=-24:TP=-3:LRA=11,aresample=${AUDIO_SAMPLE_RATE},alimiter=limit=0.9[out]`,
  ].join(";");
  return ["-hide_banner", "-nostdin", "-y", "-v", "warning", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-c:a", "pcm_s16le", output];
}

export async function renderSoundtrack(sections: MusicSection[], sfx: SfxEvent[], totalSeconds: number, output: string): Promise<void> {
  await run(FFMPEG, soundtrackArgs(sections, sfx, totalSeconds, output), { timeoutMs: TIMEOUTS.assembleMs });
}
