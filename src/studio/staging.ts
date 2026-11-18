/**
 * Staging: an English lesson told as a story (16/11/2026: "each lesson its own script, like a
 * film"). The writer (episode.ts) gives every scene its place, its lines and a few beats in
 * plain words — "Hùng comes in from the right carrying the gift", "the cat pops out of it" —
 * timed on the lines; this turns them into the player's scene scripts: who stands where, who
 * walks, carries, kneels, falls, which things shake, burst, appear, the word cards, the clocks
 * of the viewers' pauses, and one camera that always keeps the four in the frame (the user's
 * rule). No brain, no tokens: the same beats always give the same scenes.
 */
import { resolveIcon } from "../animation/icons.ts";
import { splitPauses, splitSpeakers, unmark } from "../tts/narrate.ts";

export const KIDS = ["huy", "hung", "boi", "beo"] as const;
export const NAME_OF: Record<string, string> = { huy: "Huy", hung: "Hùng", boi: "Bối", beo: "Beo" };
const ID_OF: Record<string, string> = { Huy: "huy", "Hùng": "hung", "Bối": "boi", Beo: "beo" };

/** A thing of the story: an emoji item (a gift, an apple) or an animal with its own rig. */
export interface Thing {
  id: string; kind: "item" | "animal";
  /** item: the picture's name ("wrapped gift"); animal: the species (animals.js, critters.js). */
  icon?: string; species?: string; color?: string;
  /** It talks: its name in the lines ("Hộp quà", "Mèo"). */
  speaker?: string;
  size?: number;
}
export type Do = "enter" | "exit" | "walk_to" | "carry" | "put" | "give" | "crouch" | "stand" | "open" | "pop_out" | "shake" | "appear" | "vanish"
  | "fall" | "get_up" | "jump" | "cheer" | "wave" | "point" | "worry" | "laugh" | "talk" | "idle" | "run_around" | "look"
  | "clap" | "dance" | "kick" | "hop" | "peek" | "knock" | "hug" | "pick_up" | "nod" | "search" | "startle" | "run_off";
/** One thing that happens, as a line of the scene starts (line 0: the scene's start; `after`: as it ends). */
export interface Beat { line: number; after?: boolean; do: Do; who?: string; what?: string; to?: string; from?: "left" | "right"; face?: string }
export interface EpisodeScene { place: string; time?: string; say: string; beats: Beat[] }
export interface Word { en: string; vi: string; thing?: string }
export interface Episode { title: string; words: Word[]; things: Thing[]; places: Record<string, string>; scenes: EpisodeScene[] }
export interface Mark { at: number; end: number; pause?: boolean; who?: string }

/** Where the four stand by default (rig units along the ground) and where things are put. */
export const SLOT: Record<string, number> = { beo: -420, boi: -260, hung: 300, huy: 500 };
export const SPOT = { left: -90, center: 60, right: 190 };
const OFF = 760; // just outside the frame: someone coming in is seen at once
// Walking speed (rig units a second) by leg length (18/11/2026: the feet now stay planted, so the
// pace sets the steps): the men stride, the children patter a little faster than their legs.
const LEG: Record<string, number> = { huy: 124, hung: 124, boi: 90, beo: 71 };
const walkSpeed = (who: string) => Math.max(260, 2.6 * (LEG[who] ?? 110));
/** Seconds a one-off move takes: the same one's next beat waits for it (a laugh no longer cuts a pick-up off). */
const TAKES: Partial<Record<Do, number>> = { pick_up: 0.9, hug: 0.6, put: 0.7, give: 0.7, kick: 0.7, jump: 0.9, get_up: 1.05, startle: 0.6 };
/** Lines said like this make the others jump (a scream, a shout). */
const LOUD = new Set(["shout", "shock"]);
const FACE: Partial<Record<Do, string>> = { cheer: "joy", laugh: "laugh", worry: "worried", fall: "surprised", jump: "surprised", wave: "happy", point: "happy", talk: "happy" };

/** The parts of a scene's lines in order (as narrate.ts reads them): who says it, the words. */
export function partsOf(say: string): { who?: string; text: string; pause?: number; mood?: string }[] {
  return splitSpeakers(say).flatMap((seg): { who?: string; text: string; pause?: number; mood?: string }[] => seg.who ? [{ who: seg.who, text: seg.text, ...(seg.mood ? { mood: seg.mood } : {}) }]
    : splitPauses(seg.text).map((x) => (typeof x === "number" ? { text: "", pause: x } : { text: x })));
}

interface State { x: Record<string, number>; facing: Record<string, number>; gone: Set<string>; placeOf: string; carried: Record<string, string>; down?: Set<string> }

/** One scene of the episode as the player's script (the backdrop is added by the caller). */
export function stageScene(ep: Episode, i: number, marks: Mark[], duration: number, st: State): Record<string, unknown> {
  const sc = ep.scenes[i]!;
  if (sc.place !== st.placeOf) {
    // a new place: everyone back at their spot, things where the story puts them
    for (const k of KIDS) { st.x[k] = SLOT[k]!; st.facing[k] = SLOT[k]! < 0 ? 1 : -1; }
    st.placeOf = sc.place; st.carried = {}; st.down = new Set();
  }
  const down = (st.down ??= new Set());
  const things = new Map(ep.things.map((t) => [t.id, t]));
  const tOf = (b: Beat) => b.line <= 0 ? 0.15 : (b.after ? marks[b.line - 1]?.end : marks[b.line - 1]?.at) ?? 0.15;
  const endOf = (b: Beat) => b.line <= 0 ? Math.min(duration, 1.5) : marks[b.line - 1]?.end ?? duration;
  const actions: Record<string, unknown>[] = [];
  const startX: Record<string, number> = {}, startFacing: Record<string, number> = {};
  const items = new Map<string, Record<string, unknown>>(), animals = new Map<string, Record<string, unknown>>();
  const startOf = (id: string) => { if (!(id in startX)) { startX[id] = st.x[id] ?? SPOT.center; startFacing[id] = st.facing[id] ?? -1; } };
  for (const k of KIDS) startOf(k);
  const thingX = (id: string) => st.x[id] ?? SPOT.center;
  const item = (id: string) => {
    let it = items.get(id);
    if (!it) {
      const t = things.get(id), ic = resolveIcon(t?.icon ?? id);
      it = { id, icon: ic ? { body: ic.body, width: ic.width, height: ic.height } : { body: "", width: 32, height: 32 }, x: thingX(id), size: t?.size ?? 130, ...(t?.speaker ? { face: { y: 0.62, eyes: 0.085 } } : {}) };
      if (st.carried[id]) it.carry = { by: st.carried[id], from: 0, until: duration + 1, dy: 0.42 };
      items.set(id, it);
    }
    return it;
  };
  const animal = (id: string) => {
    let a = animals.get(id);
    if (!a) {
      const t = things.get(id);
      a = { id, type: "animal", look: { species: t?.species ?? "cat", ...(t?.color ? { color: t.color } : {}) }, x: thingX(id), facing: st.facing[id] ?? -1, scale: (t?.size ?? 100) / 180 };
      animals.set(id, a);
    }
    return a;
  };
  /** Somewhere to stand beside a target, on the side one comes from. */
  const beside = (who: string, target: string) => {
    const tx = st.x[target] ?? (target in SPOT ? SPOT[target as keyof typeof SPOT] : SPOT.center);
    return tx + ((st.x[who] ?? 0) < tx ? -125 : 125);
  };
  const walk = (who: string, to: number, at: number, carrying = false) => {
    const from = st.x[who] ?? 0, dur = Math.max(0.5, Math.abs(to - from) / walkSpeed(who)), facing = to >= from ? 1 : -1;
    actions.push({ actor: who, at, do: carrying ? "carry_front" : "walk", set: { facing }, move: { to }, dur });
    st.x[who] = to; st.facing[who] = facing; busy[who] = at + dur;
    return at + dur;
  };
  const settle = (who: string, at: number, face = "happy") => {
    // after walking, turn back to the group (the side the middle is on)
    const facing = (st.x[who] ?? 0) < 80 ? 1 : -1;
    actions.push({ actor: who, at, do: "idle", set: { facing }, face });
    st.facing[who] = facing;
  };

  const fx: Record<string, unknown>[] = [];
  // Until when each one is still walking: what they do next waits till they get there (they
  // bent to pick a thing up while still sliding towards it, 18/11/2026).
  const busy: Record<string, number> = {};
  // The sounds of what happens (soundtrack.ts, synthesized): a boing, a thud, a slide whistle…
  const sounds: { type: string; at: number; gain?: number; dur?: number }[] = [];
  const sound = (type: string, at: number, gain?: number, dur?: number) => sounds.push({ type, at: Math.round(at * 100) / 100, ...(gain !== undefined ? { gain } : {}), ...(dur !== undefined ? { dur: Math.round(dur * 100) / 100 } : {}) });
  const beats = [...sc.beats].sort((a, b) => tOf(a) - tOf(b));
  // Who fell in the scene before is still on the floor as this one starts (18/11/2026: they
  // stood up for a few frames and dropped again): lying there, then up (as written, or at once).
  for (const k of KIDS) {
    if (!down.has(k)) { actions.push({ actor: k, at: 0, do: "idle", face: "happy" }); continue; }
    actions.push({ actor: k, at: -10, do: "fall", face: "worried" });
    if (!beats.some((b) => b.do === "get_up" && b.who && (ID_OF[b.who] ?? b.who) === k)) {
      actions.push({ actor: k, at: 0.3, do: "get_up", face: "worried" }, { actor: k, at: 1.35, do: "idle", face: "worried" });
      down.delete(k);
    }
  }
  for (const b of beats) {
    const who = b.who ? ID_OF[b.who] ?? b.who : undefined, what = b.what;
    const at = who && busy[who] && b.do !== "walk_to" && b.do !== "exit" ? Math.min(Math.max(tOf(b), busy[who]!), Math.max(tOf(b), duration - 0.4)) : tOf(b);
    switch (b.do) {
      case "enter": {
        if (!who) break;
        const side = b.from === "left" ? -1 : 1;
        startX[who] = side * OFF; st.x[who] = side * OFF; startFacing[who] = -side;
        const carrying = !!what;
        if (what) { item(what).carry = { by: who, from: 0, until: duration + 1, dy: 0.42 }; st.carried[what] = who; }
        const end = walk(who, b.to ? beside(who, b.to) : SLOT[who] ?? 0, at, carrying);
        if (!carrying) settle(who, end); else actions.push({ actor: who, at: end, do: "idle", face: "happy" });
        break;
      }
      case "exit": { if (who) walk(who, (st.x[who] ?? 0) < 0 ? -OFF - 200 : OFF + 200, at); break; }
      case "run_off": {
        // a cartoon dash: a dip to spring, then off at speed, stretched, kicking up dust
        if (!who) break;
        const from = st.x[who] ?? 0, to = from < 0 ? -OFF - 300 : OFF + 300, facing = to > from ? 1 : -1;
        const dur = Math.max(0.45, Math.abs(to - from) / (walkSpeed(who) * 3.2));
        actions.push({ actor: who, at, do: "crouch", set: { facing }, face: b.face ?? "scared" }, { actor: who, at: at + 0.18, do: "dash", move: { to, ease: "in" }, dur, face: b.face ?? "scared" });
        fx.push({ fx: "dust", on: who, at: Math.round((at + 0.2) * 100) / 100, dur: Math.round(Math.min(dur, 1.2) * 100) / 100, rate: 14 });
        sound("zip", at + 0.18, 0.8);
        st.x[who] = to; st.facing[who] = facing; busy[who] = at + 0.18 + dur;
        break;
      }
      case "walk_to": { if (!who || !b.to) break; const carrying = Object.values(st.carried).includes(who); const end = walk(who, b.to === "home" ? SLOT[who]! : beside(who, ID_OF[b.to] ?? b.to), at, carrying); if (!carrying) settle(who, end); break; }
      case "carry": {
        if (!who || !what) break;
        const it = item(what); it.carry = { by: who, from: at, until: duration + 1, dy: 0.42 }; st.carried[what] = who;
        actions.push({ actor: who, at, do: "give", face: "happy" });
        break;
      }
      case "put": case "give": {
        if (!who || !what) break;
        const it = item(what), c = it.carry as { until: number } | undefined;
        const dest = b.do === "give" && b.to ? (ID_OF[b.to] ?? b.to) : undefined;
        actions.push({ actor: who, at, do: "crouch", face: "happy" }, { actor: who, at: at + 0.7, do: "idle", face: "happy" });
        const x = dest ? (st.x[dest] ?? 0) + ((st.x[who] ?? 0) < (st.x[dest] ?? 0) ? -70 : 70) : (st.x[who] ?? 0) + (st.facing[who] ?? 1) * 115;
        if (c) c.until = at + 0.45;
        it.x = x; st.x[what] = x; delete st.carried[what];
        if (dest) { it.carry = { by: dest, from: at + 0.45, until: duration + 1, dy: 0.42 }; st.carried[what] = dest; }
        break;
      }
      case "crouch": if (who) actions.push({ actor: who, at, do: "crouch", face: b.face ?? "happy" }); break;
      case "stand": if (who) actions.push({ actor: who, at, do: "idle", face: b.face ?? "happy" }); break;
      case "open": {
        if (!what) break;
        // it opens and stays (a box may give again); "vanish" takes it away
        ((item(what).pops ??= []) as number[]).push(at);
        sound("pop", at);
        break;
      }
      case "pop_out": {
        // an animal (or a thing) jumps out of another at its place, lands in front of the group
        if (!what) break;
        sound("boing", at, 0.7);
        const fromX = b.to && st.x[b.to] !== undefined ? st.x[b.to]! : thingX(what), land = fromX > 0 ? fromX - 260 : fromX + 260;
        if (things.get(what)?.kind === "animal") {
          const a = animal(what); a.x = fromX; a.opacity = 0;
          actions.push({ actor: what, at, set: { opacity: 1 }, dur: 0.08 },
            { actor: what, at, do: "run", move: { to: (fromX + land) / 2, toY: -170, easeY: "out" }, dur: 0.4 },
            { actor: what, at: at + 0.4, do: "run", move: { to: land, toY: 0, easeY: "in" }, dur: 0.35 },
            { actor: what, at: at + 0.75, do: "stand", set: { facing: land < fromX ? 1 : -1 } });
          st.facing[what] = land < fromX ? 1 : -1;
        } else {
          const it = item(what); it.x = fromX; it.from = at; it.moves = [{ at, dur: 0.6, to: [land, 0], arc: 220 }];
        }
        st.x[what] = land;
        break;
      }
      case "shake": { if (what) { const dur = Math.max(0.6, endOf(b) - at); ((item(what).shakes ??= []) as unknown[]).push({ at, dur, amp: 12, hop: 12 }); sound("rattle", at, 0.5, Math.min(2, dur)); } break; }
      case "appear": {
        if (!what) break;
        if (things.get(what)?.kind === "animal") { const a = animal(what); a.opacity = 0; actions.push({ actor: what, at, set: { opacity: 1 }, dur: 0.3 }, { actor: what, at, do: "stand" }); }
        else item(what).from = at;
        sound("pop", at, 0.6);
        if (b.to) st.x[what] = SPOT[b.to as keyof typeof SPOT] ?? st.x[what];
        break;
      }
      case "vanish": { if (!what) break; if (things.get(what)?.kind === "animal") actions.push({ actor: what, at, set: { opacity: 0 }, dur: 0.3 }); else item(what).until = at; st.gone.add(what); break; }
      case "run_around": {
        if (!what) break;
        const x0 = st.x[what] ?? 0, far = x0 < 60 ? 330 : -330;
        actions.push({ actor: what, at, do: "run", set: { facing: far > x0 ? 1 : -1 }, move: { to: far }, dur: 1.1 },
          { actor: what, at: at + 1.1, do: "run", set: { facing: far > x0 ? -1 : 1 }, move: { to: x0 }, dur: 1.1 },
          { actor: what, at: at + 2.2, do: "stand" });
        break;
      }
      case "pick_up": case "hug": {
        // down to it (or arms round it), then it is held before the chest
        if (!who) break;
        actions.push({ actor: who, at, do: b.do, face: b.face ?? "happy" });
        if (what) { const it = item(what); it.carry = { by: who, from: at + (b.do === "pick_up" ? 0.6 : 0.4), until: duration + 1, dy: 0.45 }; st.carried[what] = who; }
        break;
      }
      case "kick": {
        // a kick sends the thing (a ball) flying off in front, bouncing to a stop
        if (!who) break;
        actions.push({ actor: who, at, do: "kick", face: b.face ?? "determined" }, { actor: who, at: at + 0.7, do: "idle", face: "happy" });
        sound("thud", at + 0.25, 0.5);
        if (what) {
          const it = item(what), dir = st.facing[who] ?? 1, x0 = (st.x[who] ?? 0) + dir * 80, x1 = x0 + dir * 420;
          it.x = x0; it.moves = [...((it.moves as unknown[]) ?? []), { at: at + 0.25, dur: 0.7, to: [x0 + dir * 300, 0], arc: 260 }, { at: at + 0.95, dur: 0.45, to: [x1, 0], arc: 70 }];
          st.x[what] = x1;
        }
        break;
      }
      case "fall": {
        // the floor is hit about 0.6 s in: a ring of dust and a jolt there
        if (!who) break;
        actions.push({ actor: who, at, do: "fall", face: b.face ?? "surprised" });
        fx.push({ fx: "impact", on: who, at: Math.round((at + 0.6) * 100) / 100, power: 0.35 });
        sound("slide_down", at + 0.05, 0.45); sound("thud", at + 0.6);
        down.add(who);
        break;
      }
      case "get_up": {
        if (!who) break;
        const t0 = b.line <= 0 && down.has(who) ? 0 : at;
        actions.push({ actor: who, at: t0, do: "get_up", face: b.face ?? "worried" }, { actor: who, at: t0 + 1.05, do: "idle", face: b.face ?? "happy" });
        down.delete(who);
        break;
      }
      case "jump": {
        // a real jump (dip, up, land) and back to standing, not a pose held in the air
        if (!who) break;
        actions.push({ actor: who, at, do: "jump", face: b.face ?? "surprised" }, { actor: who, at: at + 0.9, do: "idle", face: b.face ?? "surprised" });
        sound("slide_up", at + 0.05, 0.4); sound("thud", at + 0.62, 0.35);
        break;
      }
      case "startle": {
        if (!who) break;
        actions.push({ actor: who, at, do: "startle", face: b.face ?? "surprised" }, { actor: who, at: at + 0.6, do: "idle", face: b.face ?? "surprised" });
        break;
      }
      case "look": if (who && b.to) actions.push({ actor: who, at, do: "idle", lookAt: ID_OF[b.to] ?? b.to, face: b.face ?? "happy" }); break;
      default: {
        if (!who) break;
        actions.push({ actor: who, at, do: b.do === "laugh" ? "cheer" : b.do, face: b.face ?? FACE[b.do] ?? "happy" });
        if (b.do === "knock") sound("knock", at); else if (b.do === "clap") sound("clap", at, 0.6); else if (b.do === "hop") sound("boing", at, 0.3);
      }
    }
    if (who && TAKES[b.do]) busy[who] = Math.max(busy[who] ?? 0, at + TAKES[b.do]!);
  }
  // A scream or a shout makes the others jump (unless they are busy with something of their own
  // just then, gone, or on the floor): the room reacts, it does not stand there.
  partsOf(sc.say).forEach((p, k) => {
    const m = marks[k];
    if (!m || !p.who || !LOUD.has(p.mood ?? "")) return;
    const speaker = ID_OF[p.who] ?? p.who, t0 = m.at + 0.12;
    for (const id of KIDS) {
      if (id === speaker || down.has(id) || Math.abs(st.x[id] ?? 0) >= OFF || (busy[id] ?? 0) > t0) continue;
      if (actions.some((a) => a.actor === id && (a.at as number) > 0.01 && Math.abs((a.at as number) - t0) < 0.8)) continue;
      actions.push({ actor: id, at: t0, do: "startle", face: "surprised" }, { actor: id, at: t0 + 0.6, do: "idle", face: "surprised" });
    }
  });
  // In time order (the player plays the last one begun; reactions were added at the end).
  actions.sort((a, b) => (a.at as number) - (b.at as number));
  // Things that stay from scenes before (not opened, not gone) are where they were left.
  for (const t of ep.things) {
    if (st.gone.has(t.id) && !items.has(t.id) && !animals.has(t.id)) continue;
    if (items.has(t.id) || animals.has(t.id) || (st.x[t.id] === undefined && !st.carried[t.id])) continue;
    if (t.kind === "animal") animal(t.id); else item(t.id);
  }
  // The English words: a card over the thing as its word is first said in the scene.
  const parts = partsOf(sc.say);
  for (const w of ep.words) {
    if (!w.thing || (!items.has(w.thing) && !animals.has(w.thing))) continue;
    const re = new RegExp(`\\b${w.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const k = parts.findIndex((p) => !p.pause && re.test(unmark(p.text)));
    if (k < 0 || !marks[k]) continue;
    const label = { at: marks[k]!.at, text: w.en, sub: w.vi, ...(animals.has(w.thing) ? { on: w.thing } : {}) };
    if (items.has(w.thing) && !(items.get(w.thing)!.burst !== undefined)) items.get(w.thing)!.label = label;
    else items.set(`word-${w.thing}`, { id: `word-${w.thing}`, icon: { body: "", width: 32, height: 32 }, x: st.x[w.thing] ?? 0, size: 1, label: { ...label, on: animals.has(w.thing) ? w.thing : undefined } });
  }
  // The viewers' pauses: a clock while they answer.
  const countdowns = marks.filter((m) => m.pause && m.end - m.at >= 2.5).map((m) => ({ at: Math.round(m.at * 100) / 100, seconds: Math.round(m.end - m.at) }));
  // One camera on the four (and the animals on stage), a slow push; never a cut that leaves one out.
  const on = [...KIDS, ...[...animals.keys()].filter((a) => !st.gone.has(a))];
  const shots = [{ at: 0, type: "full", on, share: 0.56, push: i % 2 ? 0.035 : 0.025 }];
  const cast = [
    ...KIDS.map((k) => ({ id: k, type: "human", look: k, x: startX[k], facing: startFacing[k] })),
    ...[...animals.values()].map((a) => ({ ...a, facing: (a.facing as number) ?? -1 })),
  ];
  // where everyone ends up, for the next scene
  for (const a of animals.values()) if (st.x[a.id as string] === undefined) st.x[a.id as string] = a.x as number;
  // things seen here stay for the next scene (one that appeared without a place was lost:
  // the toy cockroach picked up in one scene was gone from the hands in the next)
  for (const it of items.values()) if (!String(it.id).startsWith("word-") && st.x[it.id as string] === undefined && !st.gone.has(it.id as string)) st.x[it.id as string] = it.x as number;
  return {
    castFile: "cast.json", duration: Math.round(duration * 100) / 100, time: sc.time ?? "day", place: ep.places[sc.place] ?? sc.place,
    set: { name: "plain" }, mood: "playful", speakerShots: false, cast, actions, items: [...items.values()],
    ...(countdowns.length ? { overlay: { countdowns } } : {}), ...(fx.length ? { fx } : {}), ...(sounds.length ? { audio: { sfx: sounds.sort((a, b) => a.at - b.at) } } : {}), shots,
  };
}

/** Every scene of the episode, in order (positions carried from one to the next). */
export function stageEpisode(ep: Episode, timeline: { fps: number; scenes: { durationFrames: number; marks?: Mark[] }[] }): Record<string, unknown>[] {
  const st: State = { x: {}, facing: {}, gone: new Set(), placeOf: "", carried: {} };
  return ep.scenes.map((_, i) => stageScene(ep, i, timeline.scenes[i]?.marks ?? [], (timeline.scenes[i]?.durationFrames ?? 150) / timeline.fps, st));
}

/** project.json "speakers" and "voices" for the episode's talking things (their English voices too). */
export function thingVoices(ep: Episode): { speakers: Record<string, string[]>; voices: Record<string, unknown> } {
  const speakers: Record<string, string[]> = {}, voices: Record<string, unknown> = {};
  // voices that read English right (englishcheck.ts) and sound unlike the four
  const EN = ["af_bella", "af_alloy", "am_puck", "af_nicole"], VI = ["Thùy Dung", "Ngọc Huyền", "Hải Đăng", "Đoan Trang"];
  ep.things.filter((t) => t.speaker).forEach((t, k) => {
    (speakers[t.speaker!] ??= []).push(t.id);
    voices[t.speaker!] ??= { voice: VI[k % VI.length], pitch: 3 };
    voices[`${t.speaker!}@en`] ??= { voice: EN[k % EN.length], engine: "kokoro", pitch: 3, speed: 0.88 };
  });
  return { speakers, voices };
}
