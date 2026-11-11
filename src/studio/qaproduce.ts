/**
 * The film of a question (the "Ask Huy" channel, qa.ts): the approved script voiced in English
 * (Kokoro), every scene directed by the brain into one of three layouts, then rendered by the
 * story renderer like the other films:
 *
 *   board  Huy (and Mai) on the left of the studio, an explainer picture on a card on the right:
 *          an SVG the brain draws, its parts appearing in time with the words (runtime/board.js)
 *   host   Huy (and Mai) in the studio, talking to the viewer
 *   place  Huy and Mai somewhere else (a beach, a rooftop at sunset, Mars), painted once by FLUX
 *
 *   node src/studio/qaproduce.ts <slug> prepare|render
 */
import fs from "node:fs/promises";
import path from "node:path";
import { think } from "../brain/claude.ts";
import { ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { run } from "../utils/process.ts";
import { renderStory } from "../animation/story.ts";
import { backdropOfPlace } from "../animation/backdrops.ts";
import { SIZES } from "../imagegen/sd.ts";
import { boardIcons } from "../animation/icons.ts";
import { styleOf } from "../animation/styles.ts";
import { jobDir } from "./jobs.ts";
import { isFact, profileOf, type QAPlan, type QAProfile } from "./qa.ts";
import { loadJob } from "./jobs.ts";

export const qaProject = (slug: string) => path.join(ROOT, "projects", slug);
const STYLE = "hien_dai";
/** The channel's home: one painting for every studio scene. */
const STUDIO = "a bright, cheerful children's TV studio: pastel walls with simple shapes of stars, planets and question marks, a wooden floor, soft lights";

/** Huy and Mai, always the same (the human rig: modern clothes made of parts). */
export const LOOKS = {
  huy: { body: "man", build: "slim", skin: "#e0a878", outfit: { type: "parts", top: { cut: "chui", color: "#2f7fd0", trim: "#1d5a9a", length: "hip", sleeves: "short" }, lower: { type: "pants", color: "#3b4a63", length: "ankle" } }, hair: { style: "short", color: "#1a1410" }, shoes: "#2f3440", face: { shape: "oval", eyes: "round", nose: "button", brows: "thick", iris: "#2b1a0e", eyeScale: 1.15 } },
  mai: { body: "child", skin: "#f0c08e", outfit: { type: "parts", top: { cut: "chui", color: "#f4a62a", length: "hip", sleeves: "short" }, lower: { type: "skirt", color: "#d9435a", length: "knee" } }, hair: { style: "long", color: "#1a1410" }, shoes: "#e05a6e", face: { shape: "round", eyes: "round", nose: "button", brows: "thin", iris: "#2b1a0e" } },
};
/** Outfits for places that need them (space, the Moon, Mars…): the same faces, other clothes. */
const SUIT = { type: "parts", top: { cut: "chui", color: "#f2f4f7", trim: "#9aa8b6", length: "hip", sleeves: "long" }, lower: { type: "pants", color: "#e6e9ee", length: "ankle" }, belt: { color: "#7d8b99", ends: false } };
Object.assign(LOOKS, {
  huy_space: { ...LOOKS.huy, outfit: SUIT, headwear: "space_helmet", gloves: "#e9edf2", shoes: "#aeb9c4" },
  // Long hair is tied up inside the helmet.
  mai_space: { ...LOOKS.mai, outfit: SUIT, headwear: "space_helmet", gloves: "#e9edf2", shoes: "#aeb9c4", hair: { style: "bun", color: "#1a1410" } },
});
const OUTFITS = ["everyday", "spacesuit"] as const;

const MOVES = ["idle", "talk", "point", "wave", "raise", "cheer", "worry", "give", "stretch"] as const;
const FACES = ["neutral", "happy", "joy", "laugh", "surprised", "worried", "proud", "determined", "sad", "scared"] as const;
const WHO = { type: "object", properties: { do: { enum: [...MOVES] }, face: { enum: [...FACES] } }, required: ["do", "face"] };
const SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          layout: { enum: ["board", "host", "place"] },
          place: { type: "string" },
          time: { enum: ["day", "dawn", "dusk", "night"] },
          huy: WHO,
          mai: { ...WHO, properties: { ...WHO.properties, show: { type: "boolean" } }, required: ["do", "face", "show"] },
          outfit: { enum: [...OUTFITS] },
          board: { type: "string" },
        },
        required: ["index", "layout", "place", "time", "outfit", "huy", "mai", "board"],
      },
    },
  },
  required: ["scenes"],
};
interface Directed { index: number; layout: "board" | "host" | "place"; place: string; time: string; outfit?: (typeof OUTFITS)[number]; huy: { do: string; face: string }; mai: { do: string; face: string; show: boolean }; board: string }

const system = (P: QAProfile) => `You direct the scenes of "${P.channel}"${P.lang === "vi" ? " (in Vietnamese)" : ""}, a 2D cartoon for children aged 6–12 that answers one question per video. Huy (the host, a young man) explains; Mai (8) asks and guesses. You also draw the explainer pictures, as SVG, in a clean, bright, friendly flat style: thick dark outlines (#3a2a20, stroke-width 4–6), flat fills, rounded shapes, big readable labels.`;

const BOARD_RULES = [
  "Board SVG rules (layout board):",
  `- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"> … </svg>; draw inside x 30–970, y 30–570; the card behind it is cream (#fffaf0), no background rect needed.`,
  "- Things (animals, food, objects, people, vehicles, weather, plants, places, the Sun, the Earth…) are pictures from the icon library, not drawn: <icon name=\"cat\" x=\"100\" y=\"150\" size=\"180\"/> (x, y: top left; size: width; name: the plain English word for the thing, one or two words, no colours: cat, red apple, honeybee, sun, rainbow, airplane, volcano, backpack). Draw yourself only what no icon shows: diagrams, arrows, waves, rays, layouts, labels, charts, cut-aways.",
  "- Simple shapes only (rect, circle, ellipse, path, polygon, line, text, g, icon). At most about 40 elements. No images, no scripts, no filters, no gradients, no foreignObject.",
  "- Text: font-family=\"sans-serif\", font-size 28–48, short labels (1–4 words), dark (#2a2a40); at most one title of up to 6 words at the top. Never let text run past x 970.",
  "- Show exactly what the line explains (the visual note says what), like a good picture-book diagram: e.g. a smiling Sun, a prism, waves of different lengths, little molecule dots, arrows.",
  "- Icons take data-in and the motion classes too.",
  "- Animate with attributes only: data-in=\"seconds\" makes a part pop in at that time (the scene lasts the given seconds; bring parts in step by step, in the order the words mention them, the last one before 70% of the scene); class=\"float\" bobs, \"spin\" turns, \"pulse\" breathes, \"flow\" makes dashes run along a line (rays, arrows, currents), \"draw\" draws a line from start to end (with data-in). Use 1–3 kinds of motion per picture, not everything.",
  "- Write it compactly: integer coordinates, no comments, no ids, no style attributes, classes only for the motions above, at most about 30 elements.",
  "- Colours: sky blue #4aa3e0, sun yellow #ffd23f, red #e53935, orange #fb8c00, green #43a047, violet #8e24aa, cream #fff3b0, dark #3a2a20.",
].join("\n");

function brief(P: QAProfile, plan: QAPlan, from: number, to: number, seconds: number[], kind?: string): string {
  return [
    ...(kind === "lesson" ? ["An English lesson for Vietnamese children: a word card shows the picture, the English word big (it is what the child learns) and the Vietnamese meaning smaller under it. Emma is only a voice (the card's): never on screen."]
      : P.lang === "vi" ? ["All text on the boards is in Vietnamese (with its diacritics), short and simple."] : []),
    "Choosing the layout: place only for a real place that can be painted (a park, a beach, a rooftop, Mars); anything imagined, impossible or abstract (\"Mai imagines the sky as a pinball machine\", inside a molecule) is a board picture instead.",
    "Moves: point = at the board or at something in front; raise = pointing up at the sky or above; wave = hello or goodbye; cheer = delight; worry = puzzled.",
    "outfit: spacesuit in space, on the Moon or on another planet; everyday otherwise.",
    `Direct scenes ${from + 1}–${to} of "${plan.title}". For each: layout (board for every scene whose visual is diagram, labels, arrows, map, compare, zoom, count or experiment; host when only the host talks to camera; place when the visual is somewhere else: then place = that place in a few words, e.g. "a sandy beach with gentle waves", the same words every time the same place comes back; for board and host, place = "studio"), time (of the place: day unless the visual says sunset/night/dawn), what Huy and Mai do and their faces (talk while speaking; point at the board when explaining it; Mai shows when she speaks or reacts), and the board SVG (empty string unless layout is board).`,
    "", BOARD_RULES, "",
    "Scenes (index, seconds, visual kind, visual note, lines):",
    ...plan.scenes.slice(from, to).map((s, k) => {
      const i = from + k;
      return `${i + 1}. ${seconds[i]?.toFixed(1) ?? "?"}s · ${s.visual.kind} · ${s.visual.what}\n   ${s.parts.map((p) => `${p.who}: ${p.text}`).join(" / ")}`;
    }),
  ].join("\n");
}

/**
 * A presenter's moves through a scene: pointing at the board the whole time looks stiff, so a
 * point is a beat in the middle (talk, point, talk); other moves are held.
 */
export function gestures(actor: string, move: { do: string; face: string }, seconds: number): Record<string, unknown>[] {
  if (move.do !== "point" || seconds < 2.5) return [{ actor, at: 0, do: move.do, face: move.face }];
  const at = Math.round(Math.min(1.4, seconds * 0.25) * 100) / 100, back = Math.round(Math.max(at + 1.6, seconds * 0.7) * 100) / 100;
  return [{ actor, at: 0, do: "talk", face: move.face }, { actor, at, do: "point", face: move.face }, ...(back < seconds - 0.5 ? [{ actor, at: back, do: "talk", face: move.face }] : [])];
}

/** The board looks, one per video (by its name, so a video keeps its look when directed again). */
export const BOARD_STYLES = ["card", "grid", "chalk", "sketch"] as const;
export function boardStyleOf(slug: string): (typeof BOARD_STYLES)[number] {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BOARD_STYLES[h % BOARD_STYLES.length]!;
}

/** The scene script for the player (anim/sNN.json). */
function sceneOf(P: QAProfile, d: Directed, plan: QAPlan, i: number, seconds: number, style: (typeof BOARD_STYLES)[number] = "card", log: (s: string) => void = () => {}): Record<string, unknown> {
  const speaks = new Set(plan.scenes[i]!.parts.map((p) => p.who));
  const withMai = d.mai.show || speaks.has(P.kid.name);
  const suit = d.outfit === "spacesuit" ? "_space" : "";
  const cast: Record<string, unknown>[] = [{ id: "huy", type: "human", look: `huy${suit}`, x: 0 }];
  if (withMai) cast.push({ id: "mai", type: "human", look: `mai${suit}`, x: d.layout === "board" ? -140 : 250, facing: d.layout === "board" ? 1 : -1 });
  const actions: Record<string, unknown>[] = gestures("huy", d.huy, seconds);
  if (withMai) actions.push(...gestures("mai", d.mai, seconds));
  const on = withMai ? ["huy", "mai"] : ["huy"];
  const shot = d.layout === "board" ? { at: 0, type: "full", on, dx: 0.33, share: 0.56, gy: 0.9, push: 0.05 }
    : d.layout === "host" ? { at: 0, type: withMai ? "full" : "medium", on, push: 0.06 }
    : { at: 0, type: "full", on, share: 0.62 };
  return {
    castFile: "cast.json", duration: Math.max(1, Math.round(seconds * 100) / 100), time: d.time, style: STYLE, styleLook: styleOf(STYLE).look,
    set: { name: "plain" }, place: d.layout === "place" ? d.place : STUDIO, cast, actions, shots: [shot], mood: "playful",
    ...(d.layout === "board" && d.board.trim() ? { board: boardOf(d.board, style, i, log), speakerShots: false } : {}),
  };
}

/** A board: its SVG, its look, and the icons it asks for (flat ones on chalk and sketch). */
function boardOf(svg: string, style: (typeof BOARD_STYLES)[number], i: number, log: (s: string) => void): Record<string, unknown> {
  const { icons, missing } = boardIcons(svg, style === "chalk" || style === "sketch" ? "flat" : "color");
  if (missing.length) log(`  s${String(i + 1).padStart(2, "0")}: no icon for ${missing.join(", ")} (its name is shown)`);
  return { svg, style, icons };
}

/** Everything but the film: voices, direction, paintings. */
export async function prepareQA(slug: string, log: (s: string) => void = console.log): Promise<string> {
  const kind = (await loadJob(slug)).kind;
  const dir = jobDir(slug), proj = qaProject(slug), anim = path.join(proj, "anim"), P = profileOf(kind);
  const plan: QAPlan = JSON.parse(await fs.readFile(path.join(dir, "plan.json"), "utf8"));
  await fs.mkdir(anim, { recursive: true });
  const script = await fs.readFile(path.join(dir, "script.txt"), "utf8");
  const lines = script.trim().split("\n").slice(1);
  await fs.writeFile(path.join(proj, "script.txt"), [plan.title, ...lines].join("\n") + "\n");
  await fs.writeFile(path.join(proj, "storyboard.json"), JSON.stringify({ title: plan.title, kind: "story", scenes: lines.map((narration) => ({ narration, chapter: plan.title, onScreen: {}, visual: { description: "studio", mood: "calm" }, camera: "ken_burns", transition: "cut" })) }, null, 2));
  const project = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8"));
  await fs.writeFile(path.join(proj, "project.json"), JSON.stringify({ ...project, speakers: { [P.host.name]: ["huy"], [P.kid.name]: ["mai"] }, brandId: P.brandId, style: STYLE, thumbnail: { title: plan.thumbnail, subtitle: P.channel } }, null, 2));
  await fs.writeFile(path.join(anim, "cast.json"), JSON.stringify(LOOKS, null, 2));
  if (!(await exists(path.join(proj, "timeline.json")))) {
    log("  voices");
    await run(process.execPath, [path.join(ROOT, "src", "cli.ts"), "build", path.join(proj, "storyboard.json"), "--voice-only"], { cwd: ROOT, timeoutMs: 60 * 60_000 });
  }
  const timeline = JSON.parse(await fs.readFile(path.join(proj, "timeline.json"), "utf8"));
  const seconds: number[] = timeline.scenes.map((s: { durationFrames: number }) => s.durationFrames / timeline.fps);
  // The thumbnail's picture: the opening scene (Huy and Mai, the question asked), not a board.
  const pj = JSON.parse(await fs.readFile(path.join(proj, "project.json"), "utf8"));
  pj.thumbnail = { ...pj.thumbnail, at: Math.round((seconds[0] ?? 4) * 0.6 * 100) / 100 };
  await fs.writeFile(path.join(proj, "project.json"), JSON.stringify(pj, null, 2));
  // Direction in batches (the SVG pictures are long answers), each batch written as it comes.
  const BATCH = 6;
  for (let from = 0; from < plan.scenes.length; from += BATCH) {
    const to = Math.min(plan.scenes.length, from + BATCH);
    const names = Array.from({ length: to - from }, (_, k) => `s${String(from + k + 1).padStart(2, "0")}.json`);
    if ((await Promise.all(names.map((n) => exists(path.join(anim, n))))).every(Boolean)) continue;
    const { data } = await think<{ scenes: Directed[] }>({ job: slug, phase: "produce", step: "qa-direct", model: "sonnet", effort: "low", system: system(P), schema: SCHEMA, prompt: brief(P, plan, from, to, seconds, kind) }, log);
    for (const d of data.scenes) {
      const i = d.index - 1;
      if (i < from || i >= to) continue;
      await fs.writeFile(path.join(anim, `s${String(i + 1).padStart(2, "0")}.json`), JSON.stringify(sceneOf(P, d, plan, i, seconds[i] ?? 4, boardStyleOf(slug), log), null, 2));
    }
  }
  // The paintings (the studio and every place), so the night only renders.
  log("  paintings");
  for (const f of (await fs.readdir(anim)).filter((f) => /^s\d+\.json$/.test(f)).sort()) {
    const sc = JSON.parse(await fs.readFile(path.join(anim, f), "utf8"));
    if (sc.backdrop !== undefined) continue;
    const file = await backdropOfPlace(sc.place, sc.time, STYLE);
    // No painting (the image model is missing): a plain sky, never a story landscape.
    sc.backdrop = file ? { src: `file://${file}`, size: SIZES.landscape } : false;
    await fs.writeFile(path.join(anim, f), JSON.stringify(sc, null, 2));
  }
  return proj;
}

/** The film (heavy: nights and weekends), linked into the job folder as video.mp4. */
export async function renderQA(slug: string, log: (s: string) => void = console.log): Promise<string> {
  // The channel's own intro, outro, corner logo and thumbnail (assets/brand/ask-huy).
  const job = await loadJob(slug), P = profileOf(job.kind);
  // A "Did you know?" Short is made tall (9:16) and ends on the channel's short card.
  const out = await renderStory(qaProject(slug), { lang: P.lang === "en" ? "en" : undefined, onLog: log, ...(isFact(job.kind) ? { vertical: true, short: true } : {}) });
  for (const [from, to] of [[out, "video.mp4"]] as const) {
    const target = path.join(jobDir(slug), to);
    await fs.rm(target, { force: true });
    await fs.link(from, target).catch(() => fs.copyFile(from, target));
  }
  return out;
}

if (process.argv[1]?.endsWith("qaproduce.ts")) {
  const [slug, what] = process.argv.slice(2);
  if (!slug || !["prepare", "render"].includes(what ?? "")) {
    console.error("usage: node src/studio/qaproduce.ts <slug> prepare|render");
    process.exit(1);
  }
  console.log(what === "prepare" ? await prepareQA(slug) : await renderQA(slug));
}

/** For trying the direction on a few scenes without making a project (scratch tests). */
export const _direct = { brief, system, SCHEMA, sceneOf };
