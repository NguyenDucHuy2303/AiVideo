/**
 * The sound of the place under each scene, synthesized by ffmpeg like the music (no samples,
 * no licences, the same output for the same input): birds and a breeze in a village by day,
 * crickets at night, wind on a mountain, waves on a beach, the hum of a room in the studio.
 * Kept well under the voice and the music: it is felt more than heard.
 */
import { AUDIO_SAMPLE_RATE, FFMPEG, TIMEOUTS } from "../config.ts";
import { run } from "../utils/process.ts";

export const AMBIENCES = ["village", "field", "forest", "mountain", "night", "river", "sea", "underwater", "rain", "room", "hive", "cabin", "sky", "none"] as const;
export type Ambience = (typeof AMBIENCES)[number];

/** The place of a scene script (story sets and times; a question channel's place, in words). */
export function ambienceOf(scene: { set?: { name?: string }; time?: string; place?: string; board?: unknown }): Ambience {
  const place = (scene.place ?? "").toLowerCase();
  if (place) {
    if (/studio|classroom|room|kitchen|library|inside a house|living room/.test(place)) return "room";
    if (/hive|honeycomb/.test(place)) return "hive";
    if (/seabed|underwater|coral|under the sea/.test(place)) return "underwater";
    if (/beach|sea|ocean|wave|shore/.test(place)) return "sea";
    if (/rain|storm|puddle/.test(place)) return "rain";
    if (/airplane|plane|cabin|train|car /.test(place)) return "cabin";
    if (/space|mars|moon|planet|rocket/.test(place)) return "sky";
    if (/river|lake|pond|stream|waterfall/.test(place)) return "river";
    if (/forest|jungle|woods/.test(place)) return "forest";
    if (/mountain|cliff|hill/.test(place)) return "mountain";
    if (/night/.test(place) || scene.time === "night") return "night";
    return "field";
  }
  if (scene.time === "night") return "night";
  const set = scene.set?.name ?? "village";
  if (set === "mountain") return "mountain";
  if (set === "bamboo") return "forest";
  if (set === "palace") return "village";
  if (set === "sky") return "sky";
  if (set === "field" || set === "plain") return "field";
  return "village";
}

/** Pseudo-random in [0,1) from an expression (the sin hash, as in soundtrack.ts). */
const hash = (x: string, salt: number) => `(abs(sin((${x})*12.9898+${salt})*43758.5453)-floor(abs(sin((${x})*12.9898+${salt})*43758.5453)))`;

/** A bird: in each slot of `slot` s, a chance of a call of three quick rising notes. */
function birds(seed: number, slot: number, chance: number, lo: number, span: number): string {
  return [
    `st(0,floor(t/${slot}))`, `st(1,t-ld(0)*${slot})`,
    `st(2,gt(${hash("ld(0)", seed)},${1 - chance}))`,
    `st(3,${lo}+${span}*${hash("ld(0)", seed + 1)})`,
    `st(4,floor(ld(1)/0.11))`, `st(5,ld(1)-ld(4)*0.11)`,
    `ld(2)*lt(ld(4),2+floor(2*${hash("ld(0)", seed + 2)}))*lt(ld(5),0.08)*pow(sin(PI*ld(5)/0.08),2)*sin(2*PI*(ld(3)*ld(5)+5000*ld(5)*ld(5)))`,
  ].join(";");
}

/** One place's sound: lavfi sources, each with its filter chain and level. */
export function layers(kind: Ambience, seconds: number): { src: string; chain: string }[] {
  const sr = AUDIO_SAMPLE_RATE, d = seconds.toFixed(3);
  const noise = (color: string, a: number) => `anoisesrc=color=${color}:r=${sr}:d=${d}:a=${a}`;
  const ev = (expr: string) => `aevalsrc='${expr}':s=${sr}:d=${d}`;
  const wind = (a: number, f = 450) => ({ src: noise("brown", a), chain: `lowpass=f=${f},tremolo=f=0.11:d=0.55` });
  const leaves = (a: number) => ({ src: noise("pink", a), chain: "highpass=f=1800,lowpass=f=6000,tremolo=f=0.23:d=0.7" });
  const bird = (seed: number, slot: number, chance: number, g: number) => ({ src: ev(`${g}*(${birds(seed, slot, chance, 2300, 1500)})`), chain: "highpass=f=1500,aecho=0.6:0.4:60:0.2" });
  switch (kind) {
    case "village": return [wind(0.35), leaves(0.05), bird(11, 0.9, 0.35, 0.22), bird(29, 1.3, 0.25, 0.16)];
    case "field": return [wind(0.45, 500), leaves(0.06), bird(7, 1.1, 0.3, 0.2)];
    case "forest": return [wind(0.3), leaves(0.09), bird(3, 0.7, 0.45, 0.22), bird(19, 1.1, 0.35, 0.18), bird(41, 1.7, 0.3, 0.14)];
    case "mountain": return [wind(0.8, 700), leaves(0.04), bird(5, 2.3, 0.2, 0.12)];
    case "night": return [wind(0.25, 350), { src: ev(`0.08*sin(2*PI*4400*t)*gt(sin(2*PI*27*t),0.2)*gt(sin(2*PI*0.85*t+${hash("floor(t/1.2)", 3)}*6),0.55)+0.05*sin(2*PI*3900*t)*gt(sin(2*PI*31*t),0.3)*gt(sin(2*PI*0.6*t+1),0.6)`), chain: "highpass=f=2500" }];
    case "river": return [{ src: noise("pink", 0.35), chain: "bandpass=f=900:width_type=h:w=1400,tremolo=f=0.4:d=0.3" }, bird(13, 1.4, 0.25, 0.14)];
    case "sea": return [{ src: noise("brown", 0.9), chain: "lowpass=f=900,volume='0.25+0.75*pow(sin(PI*t/6.5),4)':eval=frame" }, { src: noise("pink", 0.2), chain: "highpass=f=2000,volume='0.2+0.8*pow(sin(PI*(t-0.6)/6.5),6)':eval=frame" }];
    case "underwater": return [{ src: noise("brown", 0.6), chain: "lowpass=f=220,tremolo=f=0.2:d=0.4" }, { src: ev(`0.25*gt(${hash("floor(t/0.45)", 9)},0.75)*exp(-30*(t-floor(t/0.45)*0.45))*sin(2*PI*(500+900*(t-floor(t/0.45)*0.45))*(t-floor(t/0.45)*0.45))`), chain: "lowpass=f=1500" }];
    case "rain": return [{ src: noise("pink", 0.45), chain: "highpass=f=900,lowpass=f=7000" }, wind(0.3, 400)];
    case "room": return [{ src: noise("pink", 0.12), chain: "lowpass=f=320" }];
    case "hive": return [{ src: ev("0.25*sin(2*PI*(215+6*sin(2*PI*5*t))*t)*(0.6+0.4*sin(2*PI*0.7*t))+0.15*sin(2*PI*(232+8*sin(2*PI*4.3*t))*t)"), chain: "lowpass=f=1800" }];
    case "cabin": return [{ src: noise("brown", 0.7), chain: "lowpass=f=260" }, { src: ev("0.05*sin(2*PI*118*t)"), chain: "anull" }];
    case "sky": return [wind(0.6, 600)];
    case "none": return [];
  }
}

export interface AmbienceSection { start: number; duration: number; kind: Ambience }

/** Consecutive scenes of the same place make one stretch (no restart at every cut). */
export function mergeSections(scenes: { duration: number; kind: Ambience }[]): AmbienceSection[] {
  const out: AmbienceSection[] = [];
  let t = 0;
  for (const s of scenes) {
    const last = out.at(-1);
    if (last && last.kind === s.kind) last.duration += s.duration;
    else out.push({ start: t, duration: s.duration, kind: s.kind });
    t += s.duration;
  }
  return out;
}

/** The whole film's ambience as a mono WAV, each stretch crossfading into the next. */
export async function renderAmbience(sections: AmbienceSection[], totalSeconds: number, output: string): Promise<void> {
  const fade = 1.2, inputs: string[] = [], chains: string[] = [], labels: string[] = [];
  let n = 0;
  sections.forEach((s, i) => {
    const d = s.duration + fade, parts = layers(s.kind, d);
    if (!parts.length) return;
    const first = n;
    for (const p of parts) { inputs.push("-f", "lavfi", "-i", p.src); chains.push(`[${n}:a]${p.chain}[l${n}]`); n++; }
    const ls = parts.map((_, k) => `[l${first + k}]`).join("");
    chains.push(`${ls}amix=inputs=${parts.length}:normalize=0,afade=t=in:d=${fade}:curve=qsin,afade=t=out:st=${(d - fade).toFixed(3)}:d=${fade}:curve=qsin,adelay=${Math.round(Math.max(0, s.start - (i ? fade / 2 : 0)) * 1000)}:all=1[s${i}]`);
    labels.push(`[s${i}]`);
  });
  const total = Math.round(totalSeconds * AUDIO_SAMPLE_RATE);
  if (!labels.length) {
    await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", `anullsrc=r=${AUDIO_SAMPLE_RATE}:cl=mono`, "-t", totalSeconds.toFixed(3), output], { timeoutMs: TIMEOUTS.assembleMs });
    return;
  }
  const graph = [...chains, `${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad,atrim=end_sample=${total},loudnorm=I=-36:TP=-9:LRA=11,aresample=${AUDIO_SAMPLE_RATE}[out]`].join(";");
  await run(FFMPEG, ["-hide_banner", "-nostdin", "-y", "-v", "warning", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-c:a", "pcm_s16le", output], { timeoutMs: TIMEOUTS.assembleMs });
}
