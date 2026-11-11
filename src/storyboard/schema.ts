import { z } from "zod";
import { COMPARE_TONES, PROFILE_IDS } from "../schema/timeline.ts";

const SbIcon = z.string().min(1).max(40);
const SbSide = z.object({
  title: z.string().min(1).max(40),
  icon: SbIcon.optional(),
  points: z.array(z.string().min(1).max(60)).max(3).default([]),
});

/**
 * Infographic for a scene, as written by the LLM (or a person). Icons are free strings here;
 * the builder maps unknown ones to a default with a warning. "none" = a photo scene.
 */
export const StoryboardGraphic = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("big_number"), value: z.string().min(1).max(12), unit: z.string().max(20).optional(), label: z.string().max(80).optional() }),
  z.object({ type: z.literal("list"), items: z.array(z.object({ icon: SbIcon.optional(), text: z.string().min(1).max(60) })).min(1).max(4) }),
  z.object({ type: z.literal("compare"), tone: z.enum(COMPARE_TONES).optional(), left: SbSide, right: SbSide }),
  z.object({ type: z.literal("icon"), icon: SbIcon, label: z.string().max(60).optional() }),
]);
export type StoryboardGraphic = z.output<typeof StoryboardGraphic>;

/**
 * storyboard.json — what the LLM writes. Deliberately loose: unknown fields are dropped and
 * style hints (camera, transition, mood) are free strings that the builder maps onto known
 * presets, falling back to defaults with a warning. Durations are never taken from here:
 * they come from the measured narration audio.
 */
export const StoryboardScene = z.object({
  narration: z.string().min(1).max(600),
  onScreen: z
    .object({
      kicker: z.string().max(30).optional(),
      title: z.string().max(90).optional(),
      body: z.string().max(180).optional(),
    })
    .default({}),
  visual: z
    .object({
      /** English keywords for image search, e.g. "tired person desk night". */
      query: z.string().max(120).optional(),
      description: z.string().max(300).optional(),
      mood: z.string().max(30).optional(),
    })
    .default({}),
  camera: z.string().max(30).optional(),
  transition: z.string().max(30).optional(),
  /** Checked against StoryboardGraphic by the builder, so one bad graphic only drops itself. */
  graphic: z.unknown().optional(),
  /** Story videos: the chapter this scene belongs to (drives title cards and music sections). */
  chapter: z.string().max(80).optional(),
  /** Story videos: a character silhouette and how it moves (free strings, mapped by the builder). */
  actor: z.object({ id: z.string().min(1).max(40), silhouette: z.string().min(1).max(240), action: z.string().max(20).optional() }).optional(),
  effects: z.array(z.string().max(20)).max(4).optional(),
});

export const Storyboard = z.object({
  title: z.string().min(1).max(120),
  /** "story": painted scenes, silhouettes, effects, music. Default: explainer (photos, graphics). */
  kind: z.enum(["explainer", "story"]).optional(),
  scenes: z.array(StoryboardScene).min(1).max(40),
});

export type Storyboard = z.output<typeof Storyboard>;
export type StoryboardScene = z.output<typeof StoryboardScene>;

/** project.json — settings chosen by a person, never by the LLM. All optional; CLI flags override. */
export const ProjectSettings = z.object({
  engine: z.enum(["piper", "vieneu", "kokoro", "dummy"]).default("piper"),
  voice: z.string().optional(),
  /** Characters' voices, by the name used in `Tên: "…"` lines: a voice, or { voice, pitch, speed }. */
  voices: z.record(z.string(), z.union([z.string(), z.object({ voice: z.string(), pitch: z.number().min(-12).max(12).optional(), speed: z.number().min(0.5).max(2).optional(), engine: z.string().optional() })])).default({}),
  speed: z.number().min(0.5).max(2).default(1),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  profiles: z.array(z.enum(PROFILE_IDS)).min(1).default(["9x16", "16x9"]),
  /** Search Pexels/Openverse for scenes the local library can't illustrate. */
  onlineImages: z.boolean().default(true),
  /**
   * Local AI pictures (scripts/setup-imagegen.sh): "fallback" when nothing fits in the
   * library or online, "prefer" before searching online, "off" never.
   */
  imageGen: z.enum(["fallback", "prefer", "off"]).default("fallback"),
});

export type ProjectSettings = z.output<typeof ProjectSettings>;
