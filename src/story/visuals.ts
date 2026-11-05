import type { MusicMood, MusicSection, SfxEvent } from "../audio/soundtrack.ts";
import { ACTOR_ACTIONS, EFFECT_TYPES, type ProfileId } from "../schema/timeline.ts";

/**
 * Story-video decisions that turn the storyboard's loose hints into exact timeline values:
 * how big and where a silhouette stands, when an effect fires, which music plays where and
 * which sound goes with which action. Pure functions, so they are easy to test.
 */

export type ActorAction = (typeof ACTOR_ACTIONS)[number];
export type EffectType = (typeof EFFECT_TYPES)[number];

/** Painted backgrounds: one style for the whole video, people left to the silhouettes. */
export const BACKGROUND_STYLE =
  "traditional Vietnamese folk painting, ancient Vietnam, soft watercolor illustration, warm cinematic light, detailed scenery, wide shot, no people, no text";
export const BACKGROUND_NEGATIVE =
  "people, person, man, woman, child, crowd, figure, animal, horse, text, letters, watermark, signature, frame, border, modern buildings, cars, blurry, deformed";

export const SHAPE_FOR: Record<ProfileId, "landscape" | "portrait"> = { "16x9": "landscape", "9x16": "portrait" };

/** When the actor appears, and how long its entrance takes (s): effects key off the end. */
export const ACTOR_START_S = 0.3;
const ENTRANCE_S: Record<ActorAction, number> = { appear: 0.8, enter_left: 1.6, enter_right: 1.6, grow: 1.4, charge: 0.4, rise: 1.6, fly_up: 0.5 };

export function actorPlacement(action: ActorAction, fps: number): { startFrame: number; height: number; x: number } {
  const height = { grow: 1.0, charge: 0.75, fly_up: 0.7 }[action as string] ?? 0.8;
  const x = action === "enter_left" ? 0.42 : action === "enter_right" ? 0.58 : 0.5;
  return { startFrame: Math.round(ACTOR_START_S * fps), height, x };
}

/** The dramatic moment of a scene (s): when the giant has grown, when the hero lands… */
export function climax(action: ActorAction | undefined): number {
  return action ? ACTOR_START_S + ENTRANCE_S[action] : 0.3;
}

/** Effects with start frames: flashes and shakes hit at the climax, ambient ones run all along. */
export function effectsFor(types: EffectType[], action: ActorAction | undefined, fps: number) {
  const hit = Math.round(climax(action) * fps);
  return [...new Set(types)].slice(0, 4).map((type) => ({ type, startFrame: type === "flash" || type === "shake" ? hit : 0, intensity: 1 }));
}

export interface StorySceneInfo {
  start: number;
  duration: number;
  chapterStart: boolean;
  mood?: string;
  action?: ActorAction;
  effects: EffectType[];
}

/** Music mood of a scene, from what happens in it rather than from the hint alone. */
export function musicMood(s: StorySceneInfo): MusicMood {
  if (s.action === "charge" || s.effects.includes("embers")) return "battle";
  if (s.action === "fly_up" || s.action === "grow" || s.effects.includes("light_rays")) return "majestic";
  if (s.mood === "dark" || s.mood === "serious") return "tense";
  return "calm";
}

/** Consecutive scenes with the same mood share one section; sections under 6 s join the previous. */
export function musicSections(scenes: StorySceneInfo[]): MusicSection[] {
  const sections: MusicSection[] = [];
  for (const s of scenes) {
    const mood = musicMood(s);
    const last = sections.at(-1);
    if (last && (last.mood === mood || s.duration < 6)) last.duration = s.start + s.duration - last.start;
    else sections.push({ start: s.start, duration: s.duration, mood });
  }
  return sections;
}

/** Sounds that go with what happens on screen. */
export function sfxEvents(scenes: StorySceneInfo[]): SfxEvent[] {
  const out: SfxEvent[] = [];
  for (const s of scenes) {
    if (s.chapterStart) out.push({ type: "chime", at: s.start + 0.1 });
    const at = (dt: number) => s.start + Math.min(dt, Math.max(0, s.duration - 0.5));
    switch (s.action) {
      case "grow":
        out.push({ type: "boom", at: at(climax("grow") - 0.2) }, { type: "shimmer", at: at(climax("grow")) });
        break;
      case "charge":
        out.push({ type: "drums", at: at(0.2) }, { type: "whoosh", at: at(0.6) });
        break;
      case "fly_up":
        out.push({ type: "wind", at: at(s.duration * 0.25) }, { type: "shimmer", at: at(s.duration * 0.3) });
        break;
      case "enter_left":
      case "enter_right":
      case "rise":
        out.push({ type: "whoosh", at: at(0.2) });
        break;
    }
    if (s.action !== "grow" && s.effects.includes("flash")) out.push({ type: "boom", at: at(climax(s.action)) });
  }
  return out.sort((a, b) => a.at - b.at);
}
