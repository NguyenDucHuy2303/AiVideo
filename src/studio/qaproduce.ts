/**
 * The film of a question (the "Ask Huy" channel, qa.ts): the approved script voiced in English
 * (Kokoro), every scene directed by the brain into one of three layouts, then rendered by the
 * story renderer like the other films:
 *
 *   board  Huy, Hùng, Bối and Beo on the left of the studio, an explainer picture on a card on the right:
 *          an SVG the brain draws, its parts appearing in time with the words (runtime/board.js)
 *   host   Huy (with Hùng, Bối and Beo) in the studio, talking to the viewer
 *   place  the four somewhere else (a beach, a rooftop at sunset, Mars), painted once by FLUX
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
import { voicesChecked } from "../audio/voicefix.ts";
import { styleOf } from "../animation/styles.ts";
import { jobDir } from "./jobs.ts";
import { isFact, OLD_KID, profileOf, type QAPlan, type QAProfile } from "./qa.ts";
import { loadJob } from "./jobs.ts";
import { formatOf } from "./formats.ts";

export const qaProject = (slug: string) => path.join(ROOT, "projects", slug);
const STYLE = "hien_dai";
/** The channel's home: one painting for every studio scene. */
const STUDIO = "a bright, cheerful children's TV studio: pastel walls with simple shapes of stars, planets and question marks, a wooden floor, soft lights";

/** Huy, Hùng, Bối and Beo, always the same (the human rig: modern clothes made of parts). Hùng,
 *  Huy's brother of 21, is slimmer, with a squarer face; Bối wears what Mai wore (the same girl,
 *  renamed 2026-11-12); Beo, her brother of 5, is smaller. */
export const LOOKS = {
  huy: { body: "man", build: "slim", skin: "#e0a878", outfit: { type: "parts", top: { cut: "chui", color: "#2f7fd0", trim: "#1d5a9a", length: "hip", sleeves: "short" }, lower: { type: "pants", color: "#3b4a63", length: "ankle" } }, hair: { style: "short", color: "#1a1410" }, shoes: "#2f3440", face: { shape: "oval", eyes: "round", nose: "button", brows: "thick", iris: "#2b1a0e", eyeScale: 1.15 } },
  hung: { body: "man", build: "slim", skin: "#e4ad7c", outfit: { type: "parts", top: { cut: "chui", color: "#7b52c4", trim: "#583a94", length: "hip", sleeves: "short" }, lower: { type: "pants", color: "#c8b48a", length: "ankle" } }, hair: { style: "short", color: "#231a14" }, shoes: "#f2f2f2", face: { shape: "square", eyes: "almond", nose: "round", brows: "thin", iris: "#2b1a0e", eyeScale: 1.1 } },
  boi: { body: "child", skin: "#f0c08e", outfit: { type: "parts", top: { cut: "chui", color: "#f4a62a", length: "hip", sleeves: "short" }, lower: { type: "skirt", color: "#d9435a", length: "knee" } }, hair: { style: "long", color: "#1a1410" }, shoes: "#e05a6e", face: { shape: "round", eyes: "round", nose: "button", brows: "thin", iris: "#2b1a0e" } },
  beo: { body: "small", skin: "#eebb88", outfit: { type: "parts", top: { cut: "chui", color: "#4caf62", trim: "#2f8040", length: "hip", sleeves: "short" }, lower: { type: "pants", color: "#e2a93b", length: "knee" } }, hair: { style: "short", color: "#1a1410" }, shoes: "#3a6fc4", face: { shape: "round", eyes: "round", nose: "button", brows: "thin", iris: "#2b1a0e", eyeScale: 1.1 } },
};
/** Outfits for places that need them (space, the Moon, Mars…): the same faces, other clothes. */
const SUIT = { type: "parts", top: { cut: "chui", color: "#f2f4f7", trim: "#9aa8b6", length: "hip", sleeves: "long" }, lower: { type: "pants", color: "#e6e9ee", length: "ankle" }, belt: { color: "#7d8b99", ends: false } };
Object.assign(LOOKS, {
  huy_space: { ...LOOKS.huy, outfit: SUIT, headwear: "space_helmet", gloves: "#e9edf2", shoes: "#aeb9c4" },
  // Long hair is tied up inside the helmet.
  hung_space: { ...LOOKS.hung, outfit: SUIT, headwear: "space_helmet", gloves: "#e9edf2", shoes: "#aeb9c4" },
  boi_space: { ...LOOKS.boi, outfit: SUIT, headwear: "space_helmet", gloves: "#e9edf2", shoes: "#aeb9c4", hair: { style: "bun", color: "#1a1410" } },
  beo_space: { ...LOOKS.beo, outfit: SUIT, headwear: "space_helmet", gloves: "#e9edf2", shoes: "#aeb9c4" },
});
// Scenes directed before the rename say "mai" (videos in the making then).
Object.assign(LOOKS, { mai: LOOKS.boi, mai_space: (LOOKS as Record<string, unknown>).boi_space });
/** Seen from the front: Huy talking to the viewer (host scenes). */
for (const k of Object.keys(LOOKS) as (keyof typeof LOOKS)[]) (LOOKS as Record<string, unknown>)[`${k}_front`] = { ...LOOKS[k], view: "front" };
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
          layout: { enum: ["board", "host", "place", "tag"] },
          place: { type: "string" },
          time: { enum: ["day", "dawn", "dusk", "night"] },
          huy: WHO,
          hung: WHO,
          boi: WHO,
          beo: WHO,
          outfit: { enum: [...OUTFITS] },
          board: { type: "string" },
        },
        required: ["index", "layout", "place", "time", "outfit", "huy", "hung", "boi", "beo", "board"],
      },
    },
  },
  required: ["scenes"],
};
interface Directed { index: number; layout: "board" | "host" | "place" | "tag"; place: string; time: string; outfit?: (typeof OUTFITS)[number]; huy: { do: string; face: string }; hung: { do: string; face: string }; boi: { do: string; face: string }; beo: { do: string; face: string }; board: string }

const system = (P: QAProfile) => `You direct the scenes of "${P.channel}"${P.lang === "vi" ? " (in Vietnamese)" : ""}, a 2D cartoon for children aged 6–12 that answers one question per video. Huy (the host, a young man of 25) explains; his younger brother Hùng (21), his hands-on assistant, shows and runs the experiments and demos; Bối (a girl of 8) asks and guesses; her little brother Beo (5) is curious and reacts. All four are always there. You also draw the explainer pictures, as SVG, in a clean, bright, friendly flat style: thick dark outlines (#3a2a20, stroke-width 4–6), flat fills, rounded shapes, big readable labels.`;

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
    ...(kind === "lesson" ? [
      `An English lesson for Vietnamese children, format "${formatOf((plan as { format?: string }).format).name}": a word card shows the picture, the English word big (it is what the child learns) and the Vietnamese meaning smaller under it. Emma is only a voice (the card's): never on screen. Board text in English or Vietnamese (with its diacritics). A picture keeps the colour it is drawn in (a "cat" is orange, a "bear" brown): when a card names a colour, name a thing of that colour ("black cat", "white snowman", "red apple") or draw a circle filled with it. Name one thing per icon, the thing itself ("rabbit", not "rabbit eating carrot").`,
      "Layout by beat:", ...formatOf((plan as { format?: string }).format).direct.map((x) => `- ${x}`),
      "- Layout tag (only where said above): the scene at its painted place (place = that place, as for layout place) with a small word card in the corner; board = \"english | nghĩa tiếng Việt | icon name\", no SVG.",
      "- hook and next: host. A \"[3s]\" in the lines is a pause for the viewers: the studio shows a clock then.",
    ]
      : P.lang === "vi" ? ["All text on the boards is in Vietnamese (with its diacritics), short and simple."] : []),
    "Choosing the layout: place only for a real place that can be painted (a park, a beach, a rooftop, Mars); anything imagined, impossible or abstract (\"Bối imagines the sky as a pinball machine\", inside a molecule) is a board picture instead.",
    "Moves: point = at the board or at something in front; raise = pointing up at the sky or above; wave = hello or goodbye; cheer = delight; worry = puzzled.",
    "outfit: spacesuit in space, on the Moon or on another planet; everyday otherwise.",
    `Direct scenes ${from + 1}–${to} of "${plan.title}". For each: layout (board for every scene whose visual is diagram, labels, arrows, map, compare, zoom, count or experiment; host when only the host talks to camera; place when the visual is somewhere else: then place = that place in a few words, e.g. "a sandy beach with gentle waves", the same words every time the same place comes back; for board and host, place = "studio"), time (of the place: day unless the visual says sunset/night/dawn), what Huy, Hùng, Bối and Beo do and their faces (all four are on screen in every scene; Hùng gives (give) or points at the board when he shows something; talk while speaking; point at the board when explaining it; the one not speaking listens and reacts: a happy, surprised or puzzled face, now and then a cheer or a worry), and the board SVG (empty string unless layout is board).`,
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
/** Where the presenters stand beside the board (shares of the frame width; the card starts at 0.40). */
export const BOARD_REGION = [0.02, 0.36];
export const BOARD_STYLES = ["card", "grid", "chalk", "sketch"] as const;
export function boardStyleOf(slug: string): (typeof BOARD_STYLES)[number] {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BOARD_STYLES[h % BOARD_STYLES.length]!;
}

/** The scene script for the player (anim/sNN.json). */
/** What a scene of a game lesson adds: the viewers' pauses (clocks; the answer after the last
 *  one) and the score before it (formats.ts "gameshow"). */
export interface SceneGame { pauses?: { at: number; seconds: number }[]; score?: { "Bối": number; "Beo": number; gain?: string } }

function sceneOf(P: QAProfile, d: Directed, plan: QAPlan, i: number, seconds: number, style: (typeof BOARD_STYLES)[number] = "card", log: (s: string) => void = () => {}, game: SceneGame = {}): Record<string, unknown> {
  const suit = d.outfit === "spacesuit" ? "_space" : "";
  const board = d.layout === "board", tag = d.layout === "tag" && !!d.board.trim();
  // All four in every scene. Before the board they stand in a row on its left (Beo, Bối, Hùng,
  // Huy nearest the board), turned to it; elsewhere Huy is in the middle (from the front when he
  // talks to the viewer), Hùng on his left, Bối and Beo on his right, all turned to him. Never
  // closer than 120 apart: the player spreads people standing on one spot.
  const cast: Record<string, unknown>[] = [
    { id: "huy", type: "human", look: `huy${suit}${d.layout === "host" ? "_front" : ""}`, x: 0 },
    { id: "hung", type: "human", look: `hung${suit}`, x: board ? -135 : -250, facing: 1 },
    { id: "boi", type: "human", look: `boi${suit}`, x: board ? -265 : 240, facing: board ? 1 : -1 },
    { id: "beo", type: "human", look: `beo${suit}`, x: board ? -390 : 415, facing: board ? 1 : -1 },
  ];
  const actions: Record<string, unknown>[] = [...gestures("huy", d.huy, seconds), ...gestures("hung", d.hung, seconds), ...gestures("boi", d.boi, seconds), ...gestures("beo", d.beo, seconds)];
  const on = ["huy", "hung", "boi", "beo"];
  // (beside the board: all four inside the left of the frame, never under the card; board.js)
  const shot = board ? { at: 0, type: "full", on, region: BOARD_REGION, share: 0.5, gy: 0.9, push: 0.05 }
    : d.layout === "host" ? { at: 0, type: "full", on, push: 0.06 }
    : tag ? { at: 0, type: "full", on, region: TAG_REGION, share: 0.6, push: 0.04 }
    : { at: 0, type: "full", on, share: 0.62 };
  // The answer is given when the viewers' last pause is over (or past the middle of the scene).
  const pauses = game.pauses ?? [], last = pauses.at(-1), reveal = Math.round((last ? last.at + last.seconds : seconds * 0.6) * 100) / 100;
  const overlay = { ...(pauses.length ? { countdowns: pauses } : {}), ...(game.score ? { score: { ...game.score, at: reveal } } : {}) };
  return {
    castFile: "cast.json", duration: Math.max(1, Math.round(seconds * 100) / 100), time: d.time, style: STYLE, styleLook: styleOf(STYLE).look,
    set: { name: "plain" }, place: d.layout === "place" || d.layout === "tag" ? d.place : STUDIO, cast, actions, shots: [shot], mood: "playful",
    // In a place (a park, a kitchen) the speaker is shown whole, the place around them: a face
    // close-up filled the frame and the painting behind was a blur (the user, 16/11/2026).
    // Under a corner word card all four stay left of it the whole scene (a cut to one of them put
    // another under the card).
    ...(d.layout === "place" ? { speakerShot: PLACE_SPEAKER_SHOT } : tag ? { speakerShots: false } : {}),
    ...(d.layout === "board" && d.board.trim() ? { board: { ...boardOf(d.board, style, i, log), reveal }, speakerShots: false } : {}),
    ...(tag ? { board: { ...boardOf(tagSvg(d.board), style === "chalk" ? "card" : style, i, log), corner: true, reveal } } : {}),
    ...(Object.keys(overlay).length ? { overlay } : {}),
  };
}

/** Where the presenters stand under a corner word card (it covers the top right). */
export const TAG_REGION = [0.03, 0.58];
/** A speaker in a place: whole (about 60 % of the height), the place around them. */
export const PLACE_SPEAKER_SHOT = { type: "full", share: 0.6, push: 0.03 };

/** The corner word card from "english | nghĩa | icon": the picture on the left, the words on the right. */
export function tagSvg(spec: string): string {
  const [en = "", vi = "", icon = ""] = spec.split("|").map((x) => x.trim().replace(/[<>&"]/g, ""));
  // One line, or two (three) of about the same length, cut at spaces.
  const lines = (t: string, max: number): string[] => {
    if (t.length <= max) return [t];
    const n = Math.min(3, Math.ceil(t.length / max)), words = t.split(" "), out: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur && (cur + " " + w).length > t.length / n + 2 && out.length < n - 1) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    return [...out, cur];
  };
  const enL = lines(en, 11), viL = lines(vi, 18);
  const big = Math.round(Math.min(160, 600 / (0.56 * Math.max(...enL.map((l) => l.length), 3)))), small = Math.round(Math.min(80, 600 / (0.52 * Math.max(...viL.map((l) => l.length), 4))));
  const h = enL.length * big * 1.1 + 18 + viL.length * small * 1.15, top = 300 - h / 2 + big * 0.85;
  const text = [
    ...enL.map((l, k) => `<text x="660" y="${Math.round(top + k * big * 1.1)}" font-size="${big}" font-weight="bold" text-anchor="middle" font-family="sans-serif" fill="#2a2a40">${l}</text>`),
    ...viL.map((l, k) => `<text x="660" y="${Math.round(top + (enL.length - 1) * big * 1.1 + 18 + (k + 1) * small * 1.15)}" font-size="${small}" text-anchor="middle" font-family="sans-serif" fill="#6a5a50">${l}</text>`),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">${icon ? `<icon name="${icon}" x="30" y="150" size="300" class="float"/>` : ""}${text.join("")}</svg>`;
}

/** The viewers' pauses of a scene, from its captions: a silence of more than a second between
 *  two lines (or after the last), where the line before was taken off when said (narrate.ts). */
export function pausesOf(cues: { startFrame: number; endFrame: number }[], durationFrames: number, fps: number): { at: number; seconds: number }[] {
  const out: { at: number; seconds: number }[] = [];
  cues.forEach((c, k) => {
    const next = cues[k + 1]?.startFrame ?? durationFrames, gap = (next - c.endFrame) / fps;
    // (the gap holds the pause plus a breath before the next line, or the scene's tail)
    if (gap > 1.2) out.push({ at: Math.round((c.endFrame / fps) * 100) / 100, seconds: Math.max(1, Math.round(gap - (cues[k + 1] ? 0.45 : 0.75))) });
  });
  return out;
}

/** The score before each scene of a game lesson, and who wins the scene's point. */
export function scoresOf(plan: QAPlan): (SceneGame["score"] | undefined)[] {
  if (!plan.scenes.some((s) => s.point)) return plan.scenes.map(() => undefined);
  const now = { "Bối": 0, "Beo": 0 };
  let started = false;
  return plan.scenes.map((s) => {
    const gain = s.point?.trim() || undefined;
    started ||= !!gain || ["round", "final", "result"].includes(s.beat as string);
    const before = started ? { ...now, ...(gain ? { gain } : {}) } : undefined;
    if (gain === "Bối" || gain === "both") now["Bối"]++;
    if (gain === "Beo" || gain === "both") now["Beo"]++;
    return before;
  });
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
  // A script written again after the film was made (a rewrite): the old voice timing and the
  // old direction belong to the old lines, so both are made anew (unchanged lines keep their
  // voice from the cache). Without this the "new" film is the old one.
  // (what the voices and direction were last made for: written when the preparation is whole;
  // older projects have only their script.txt, written at the start)
  const text = [plan.title, ...lines].join("\n") + "\n", made = path.join(proj, ".prepared-script.txt");
  const before = await fs.readFile(made, "utf8").catch(() => fs.readFile(path.join(proj, "script.txt"), "utf8").catch(() => undefined));
  if (before !== undefined && before !== text) {
    log("  the script changed: voices and direction made again");
    await fs.rm(path.join(proj, "timeline.json"), { force: true });
    for (const f of await fs.readdir(anim)) if (/^s\d+\.json$/.test(f)) await fs.rm(path.join(anim, f));
  }
  await fs.writeFile(path.join(proj, "script.txt"), text);
  await fs.writeFile(path.join(proj, "storyboard.json"), JSON.stringify({ title: plan.title, kind: "story", scenes: lines.map((narration) => ({ narration, chapter: plan.title, onScreen: {}, visual: { description: "studio", mood: "calm" }, camera: "ken_burns", transition: "cut" })) }, null, 2));
  const project = JSON.parse(await fs.readFile(path.join(dir, "project.json"), "utf8"));
  await fs.writeFile(path.join(proj, "project.json"), JSON.stringify({ ...project, speakers: { [P.host.name]: ["huy"], [P.helper.name]: ["hung"], [P.kid.name]: ["boi"], [P.little.name]: ["beo"], [OLD_KID]: ["boi", "mai"] }, brandId: P.brandId, style: STYLE, thumbnail: { title: plan.thumbnail, subtitle: P.channel } }, null, 2));
  await fs.writeFile(path.join(anim, "cast.json"), JSON.stringify(LOOKS, null, 2));
  // (the voices, their English heard back and set right: voicefix.ts)
  if (!(await exists(path.join(proj, "timeline.json")))) await voicesChecked(proj, log);
  const timeline = JSON.parse(await fs.readFile(path.join(proj, "timeline.json"), "utf8"));
  const seconds: number[] = timeline.scenes.map((s: { durationFrames: number }) => s.durationFrames / timeline.fps);
  // The thumbnail's picture: the opening scene (the four, the question asked), not a board.
  const pj = JSON.parse(await fs.readFile(path.join(proj, "project.json"), "utf8"));
  pj.thumbnail = { ...pj.thumbnail, at: Math.round((seconds[0] ?? 4) * 0.6 * 100) / 100 };
  await fs.writeFile(path.join(proj, "project.json"), JSON.stringify(pj, null, 2));
  // Direction in batches (the SVG pictures are long answers), each batch written as it comes.
  const BATCH = 6, scores = scoresOf(plan);
  for (let from = 0; from < plan.scenes.length; from += BATCH) {
    const to = Math.min(plan.scenes.length, from + BATCH);
    const names = Array.from({ length: to - from }, (_, k) => `s${String(from + k + 1).padStart(2, "0")}.json`);
    if ((await Promise.all(names.map((n) => exists(path.join(anim, n))))).every(Boolean)) continue;
    const { data } = await think<{ scenes: Directed[] }>({ job: slug, phase: "produce", step: "qa-direct", model: "sonnet", effort: "low", system: system(P), schema: SCHEMA, prompt: brief(P, plan, from, to, seconds, kind) }, log);
    for (const d of data.scenes) {
      const i = d.index - 1;
      if (i < from || i >= to) continue;
      const ts = timeline.scenes[i], game: SceneGame = { pauses: ts ? pausesOf(ts.captionCues ?? [], ts.durationFrames, timeline.fps) : [], score: scores[i] };
      const look = boardStyleOf(slug), dark = look === "chalk" && formatOf((plan as { format?: string }).format).id === "shadow";
      await fs.writeFile(path.join(anim, `s${String(i + 1).padStart(2, "0")}.json`), JSON.stringify(sceneOf(P, d, plan, i, seconds[i] ?? 4, dark ? "card" : look, log, game), null, 2));
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
  await fs.writeFile(made, text);
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
