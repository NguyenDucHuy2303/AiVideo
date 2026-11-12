/**
 * The naturalness check: plays every scene of a film without filming it, measures each
 * character a few times a second (where the head is on screen, the arms, what the hand holds,
 * who is speaking) and lists what looks wrong to a viewer:
 *
 *   held          an arm held up or out, unmoving, too long (a pointing arm frozen for 3 s)
 *   still         a character on screen not moving at all (only the mouth) for long
 *   prop-face     what the hand holds covers the face
 *   talk-covered  speaking while what the hand holds covers the mouth
 *   head-cut      the frame cuts off a large part of a head
 *   faces-overlap two faces on top of each other
 *   speaker-off   a line spoken by someone the picture does not show
 *
 * No brain, no tokens: Chrome and arithmetic. `node src/animation/inspect.ts projects/<name>`
 * prints the report and writes build/inspect.json.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withPage } from "./capture.ts";
import { renderStory } from "./story.ts";

const PLAYER = path.join(path.dirname(fileURLToPath(import.meta.url)), "player.html");

type Box = [number, number, number, number];
export interface ActorSample {
  kind: string;
  /** Head centre and radius on screen (people), px. */
  head?: [number, number]; r?: number;
  /** The body's box on screen. */
  box?: Box;
  /** What the hand holds (shown), and its box on screen. */
  prop?: string; propBox?: Box;
  /** Share of the face the prop covers, and of the mouth (0–1). */
  cover?: number; mouthCover?: number;
  opacity: number;
  /** The motion playing (WA.motions). */
  act?: string;
  armF?: [number, number]; armB?: [number, number]; lean?: number; headTilt?: number; x: number; dy?: number;
}
export interface Sample { t: number; actors: Record<string, ActorSample> }
export type IssueKind = "held" | "still" | "prop-face" | "talk-covered" | "head-cut" | "faces-overlap" | "speaker-off";
export interface Issue { scene: string; kind: IssueKind; from: number; to: number; actor?: string; other?: string; act?: string }
export const ISSUE_VI: Record<IssueKind, string> = {
  held: "giữ tay cứng quá lâu",
  still: "đứng im, chỉ mấp máy miệng",
  "prop-face": "đồ cầm tay che mặt",
  "talk-covered": "nói khi miệng bị che",
  "head-cut": "khung hình cắt mất đầu",
  "faces-overlap": "hai khuôn mặt chồng lên nhau",
  "speaker-off": "người nói không có trong hình",
};

/** Runs in the page: every actor at every sample time. */
const MEASURE = (fps: number) => `(() => {
  const P = window.player, sc = window.params.scene, ts = sc.timeScale ?? 1, out = [];
  const rect = (n) => { const r = n.getBoundingClientRect(); return r.width * r.height > 0 ? [r.left, r.top, r.right, r.bottom] : undefined; };
  for (let k = 0; k * ${1 / fps} <= P.duration; k++) {
    const time = k * ${1 / fps}, t = time * ts;
    P.renderFrame(time);
    const m = P.actorLayer.getScreenCTM(), z = Math.hypot(m.a, m.b);
    const map = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    const row = { t: time, actors: {} };
    for (const id in P.actors) {
      const A = P.actors[id], p = P.poseAt(id, t), pts = P.pointsAt(id, t);
      const cur = A.acts.filter((x) => x.do && x.at <= t).at(-1);
      const a = { kind: A.kind, opacity: p.opacity ?? 1, x: p.x, act: cur ? cur.do : "idle" };
      if (pts.box) { const [x0, y0] = map(pts.box[0], pts.box[1]), [x1, y1] = map(pts.box[2], pts.box[3]); a.box = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]; }
      if (A.kind === "human") {
        a.head = map(pts.head[0], pts.head[1]); a.r = pts.headR * z;
        // The face as drawn (face.js: centre and radius in the head's own frame), when there is one.
        const F = A.rig.face;
        if (F && F.mouth && F.o) {
          const M = F.mouth.parentNode.getScreenCTM(), k = Math.hypot(M.a, M.b);
          a.head = [M.a * F.o.cx + M.c * F.o.cy + M.e, M.b * F.o.cx + M.d * F.o.cy + M.f]; a.r = F.o.R * k;
        }
        a.armF = p.armF; a.armB = p.armB; a.lean = p.lean || 0; a.headTilt = p.headTilt || 0; a.dy = p.dy || 0;
        const shown = p.prop !== undefined ? p.prop : A.rig.activeProp;
        if (shown && A.rig.props[shown]) {
          a.prop = shown; a.propBox = rect(A.rig.props[shown]);
          // How much of the face the prop's shapes really cover: a grid over the face, each point
          // tested against every shape's own (rotated) box.
          const leaves = [...A.rig.props[shown].querySelectorAll("path,rect,circle,ellipse,polygon,polyline,line")].map((n) => { try { return { b: n.getBBox(), inv: n.getScreenCTM().inverse() }; } catch (e) { return null; } }).filter((x) => x && x.b.width * x.b.height > 0);
          const hit = (x, y) => leaves.some(({ b, inv }) => { const u = inv.a * x + inv.c * y + inv.e, v = inv.b * x + inv.d * y + inv.f; return u >= b.x && u <= b.x + b.width && v >= b.y && v <= b.y + b.height; });
          let n = 0, c = 0;
          for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { if (i * i + j * j > 9) continue; n++; if (hit(a.head[0] + (i / 3) * a.r * 0.8, a.head[1] + (j / 3) * a.r * 0.8)) c++; }
          a.cover = c / n;
          const mb = F && F.mouthLine ? F.mouthLine.getBoundingClientRect() : null;
          if (mb && mb.width) { const mx = (mb.left + mb.right) / 2, my = (mb.top + mb.bottom) / 2, w = Math.max(6, mb.width / 2);
            a.mouthCover = [[0, 0], [-w, 0], [w, 0], [0, -w * 0.5], [0, w * 0.5]].filter(([dx, dy]) => hit(mx + dx, my + dy)).length / 5; }
        }
      }
      row.actors[id] = a;
    }
    out.push(row);
  }
  return out;
})()`;

/** Measure a scene (as story.ts films it) in an open page. */
export async function measure(page: { open: (p: string, params?: unknown) => Promise<void>; evaluate: <R>(e: string) => Promise<R> }, scene: Record<string, unknown>, W: number, H: number, fps = 4): Promise<Sample[]> {
  await page.open(PLAYER, { scene, width: W, height: H });
  return page.evaluate<Sample[]>(MEASURE(fps));
}

const area = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const inter = (a: Box, b: Box): Box => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
const circleBox = (c: [number, number], r: number): Box => [c[0] - r, c[1] - r, c[0] + r, c[1] + r];

/** Spans of consecutive samples where `on` holds, at least `min` seconds long. */
function runs(samples: Sample[], on: (s: Sample, i: number) => boolean, min: number, step: number): [number, number][] {
  const out: [number, number][] = [];
  let start: number | undefined;
  samples.forEach((s, i) => {
    if (on(s, i)) { start ??= s.t; return; }
    if (start !== undefined && samples[i - 1]!.t + step - start >= min) out.push([start, samples[i - 1]!.t + step]);
    start = undefined;
  });
  if (start !== undefined && samples.at(-1)!.t + step - start >= min) out.push([start, samples.at(-1)!.t + step]);
  return out;
}

/** Motions a person does standing (runtime/acting.js STANDING); lying ones. */
const STANDING = new Set(["idle", "still", "talk", "point", "give", "raise", "heroic", "wave", "worry", "hold_bowl"]);
// (sitting, kneeling, bowing count as still too: acting.js gives them life)
const LYING = new Set(["fall", "lie"]);

export const LIMITS = { held: 2.5, still: 5, propFace: 0.25, headCut: 0.35, overlap: 0.35, speakerSeen: 0.3 };

/** What is wrong in one scene, from its samples. */
export function issuesOf(name: string, scene: { speech?: { actor: string; from: number; to: number }[] }, samples: Sample[], W: number, H: number): Issue[] {
  if (samples.length < 2) return [];
  const step = samples[1]!.t - samples[0]!.t, issues: Issue[] = [];
  const frame: Box = [0, 0, W, H];
  const ids = Object.keys(samples[0]!.actors);
  const seen = (a: ActorSample | undefined) => !!a && a.opacity > 0.5 && !!a.box && area(inter(a.box, frame)) > 0.01 * W * H;
  /** A face big enough to matter, its centre in the frame. */
  const face = (a: ActorSample | undefined) => seen(a) && !!a!.head && a!.r! >= H * 0.025 && a!.head![0] > 0 && a!.head![0] < W && a!.head![1] > -a!.r! && a!.head![1] < H;
  const actAt = (id: string, t: number) => samples.find((s) => s.t >= t - 1e-6)?.actors[id]?.act;
  const talking = (id: string, t: number) => (scene.speech ?? []).some((sp) => sp.actor === id && t >= sp.from && t < sp.to);
  for (const id of ids) {
    const A = (s: Sample) => s.actors[id]!;
    if (A(samples[0]!).kind !== "human") continue;
    // An arm up or out (shoulder angle past 50°), unmoving: the start of the run is the reference.
    for (const arm of ["armF", "armB"] as const) {
      let ref: [number, number] | undefined;
      for (const [from, to] of runs(samples, (s, i) => {
        const a = A(s), q = a[arm];
        // (only standing gestures: walking, carrying, riding, lying hold their arms by nature)
        if (!seen(a) || !q || Math.abs(q[0]) < 50 || !STANDING.has(a.act ?? "idle")) { ref = undefined; return false; }
        if (!ref || i === 0) ref = q;
        const moved = Math.abs(q[0] - ref[0]) > 10 || Math.abs(q[1] - ref[1]) > 14;
        if (moved) ref = q;
        return !moved;
      }, LIMITS.held, step)) issues.push({ scene: name, kind: "held", from, to, actor: id, act: actAt(id, from) });
    }
    // Still: over a sliding window, everything but the mouth stays within a few degrees.
    const win = Math.round(LIMITS.still / step);
    const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    for (const [from, to] of runs(samples, (_, i) => {
      const w = samples.slice(Math.max(0, i - win + 1), i + 1).map(A);
      if (w.length < win || !w.every(seen) || w.some((a) => LYING.has(a.act ?? ""))) return false;
      const deg = Math.max(range(w.map((a) => a.armF?.[0] ?? 0)), range(w.map((a) => a.armF?.[1] ?? 0)), range(w.map((a) => a.armB?.[0] ?? 0)), range(w.map((a) => a.headTilt ?? 0)), range(w.map((a) => a.lean ?? 0)));
      return deg < 4 && range(w.map((a) => a.x)) < 8;
    }, step, step)) issues.push({ scene: name, kind: "still", from: Math.max(0, from - LIMITS.still + step), to, actor: id, act: actAt(id, to - step) });
    // The prop over the face; speaking behind it.
    const covered = (s: Sample, part: "face" | "mouth") => {
      const a = A(s);
      if (!face(a) || !a.propBox) return 0;
      if (a.cover !== undefined) return part === "face" ? a.cover : a.mouthCover ?? 0;
      const c: [number, number] = part === "face" ? a.head! : [a.head![0], a.head![1] + a.r! * 0.4], r = part === "face" ? a.r! * 0.8 : a.r! * 0.3;
      return area(inter(a.propBox, circleBox(c, r))) / area(circleBox(c, r));
    };
    for (const [from, to] of runs(samples, (s) => covered(s, "face") > LIMITS.propFace, 0.5, step)) issues.push({ scene: name, kind: "prop-face", from, to, actor: id });
    for (const [from, to] of runs(samples, (s) => talking(id, s.t) && covered(s, "mouth") > 0.3, 0.4, step)) issues.push({ scene: name, kind: "talk-covered", from, to, actor: id });
    // The frame cuts off a large part of a head (the body is in the picture).
    for (const [from, to] of runs(samples, (s) => {
      const a = A(s);
      if (!seen(a) || !a.head || a.r! < H * 0.04) return false;
      // Half a head at the edge; or no head at all while the body fills much of the frame (a
      // headless torso). A head wholly out with a hand or a shoulder in is a normal framing.
      const b = circleBox(a.head, a.r!), shown = area(inter(b, frame)) / area(b);
      return (shown > 0.05 && 1 - shown > LIMITS.headCut) || (shown <= 0.05 && area(inter(a.box!, frame)) > 0.15 * W * H);
    }, 0.5, step)) issues.push({ scene: name, kind: "head-cut", from, to, actor: id });
    // Faces on top of each other.
    for (const other of ids.filter((o) => o > id)) {
      for (const [from, to] of runs(samples, (s) => {
        const a = A(s), b = s.actors[other];
        if (!face(a) || !face(b) || b!.kind !== "human") return false;
        const d = Math.hypot(a.head![0] - b!.head![0], a.head![1] - b!.head![1]);
        return d < (1 - LIMITS.overlap) * (a.r! + b!.r!);
      }, 0.5, step)) issues.push({ scene: name, kind: "faces-overlap", from, to, actor: id, other });
    }
  }
  // Lines whose speaker the picture hardly shows.
  for (const sp of scene.speech ?? []) {
    if (sp.to - sp.from < 1) continue;
    const during = samples.filter((s) => s.t >= sp.from && s.t < sp.to);
    if (during.length && during.filter((s) => face(s.actors[sp.actor])).length / during.length < LIMITS.speakerSeen) issues.push({ scene: name, kind: "speaker-off", from: sp.from, to: sp.to, actor: sp.actor });
  }
  return issues;
}

export interface Report { film: string; seconds: number; issues: Issue[]; byKind: Partial<Record<IssueKind, { count: number; seconds: number }>>; perMinute: number }

export function summarise(film: string, seconds: number, issues: Issue[]): Report {
  const byKind: Report["byKind"] = {};
  for (const i of issues) { const k = (byKind[i.kind] ??= { count: 0, seconds: 0 }); k.count++; k.seconds += i.to - i.from; }
  for (const k of Object.values(byKind)) k!.seconds = Math.round(k!.seconds * 10) / 10;
  return { film, seconds: Math.round(seconds), issues, byKind, perMinute: Math.round((issues.length / Math.max(1, seconds / 60)) * 10) / 10 };
}

/** The check of a whole film (its scenes as story.ts would film them, nothing rendered). */
export async function inspectFilm(projectDir: string, o: { lang?: string; vertical?: boolean; fps?: number; log?: (s: string) => void } = {}): Promise<Report> {
  const W = o.vertical ? 1080 : 1920, H = o.vertical ? 1920 : 1080, log = o.log ?? (() => {});
  let scenes: { name: string; scene: Record<string, unknown> }[] = [];
  await renderStory(projectDir, { lang: o.lang, vertical: o.vertical, onLog: () => {}, onScenes: async (s) => { scenes = s; return "stop"; } });
  const issues: Issue[] = [];
  let seconds = 0;
  await withPage(W, H, async (page) => {
    for (const { name, scene } of scenes) {
      const samples = await measure(page, scene, W, H, o.fps ?? 4);
      const found = issuesOf(name, scene as { speech?: { actor: string; from: number; to: number }[] }, samples, W, H);
      // Film time, for finding the moment in the video.
      for (const i of found) issues.push({ ...i, from: Math.round((i.from + seconds) * 10) / 10, to: Math.round((i.to + seconds) * 10) / 10 });
      seconds += Number(scene.duration);
      log(`  ${name}: ${found.length ? found.map((i) => i.kind).join(", ") : "ok"}`);
    }
  });
  const report = summarise(path.basename(path.resolve(projectDir)), seconds, issues);
  await fs.mkdir(path.join(projectDir, "build"), { recursive: true });
  await fs.writeFile(path.join(projectDir, "build", "inspect.json"), JSON.stringify(report, null, 2));
  return report;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export function printReport(r: Report): string {
  const lines = [`${r.film}: ${r.seconds} s, ${r.issues.length} lỗi (${r.perMinute}/phút)`];
  for (const [k, v] of Object.entries(r.byKind)) lines.push(`  ${ISSUE_VI[k as IssueKind]}: ${v!.count} lần, ${v!.seconds} s`);
  for (const i of r.issues) lines.push(`    ${mmss(i.from)}–${mmss(i.to)} ${i.scene} ${ISSUE_VI[i.kind]}${i.actor ? ` (${i.actor}${i.other ? ` / ${i.other}` : ""})` : ""}`);
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2), dir = args.find((a) => !a.startsWith("--"));
  if (!dir) { console.error("usage: node src/animation/inspect.ts projects/<name> [--lang en] [--vertical]"); process.exit(2); }
  const lang = args.includes("--lang") ? args[args.indexOf("--lang") + 1] : undefined;
  const r = await inspectFilm(dir, { lang, vertical: args.includes("--vertical"), log: (s) => console.log(s) });
  console.log(printReport(r));
}
