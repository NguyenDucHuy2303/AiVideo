import { z } from "zod";
import { ICON_NAMES } from "../renderer/graphics/icons.ts";

/**
 * timeline.json — the fully resolved render input. Produced by code (or by hand),
 * never directly by an LLM. The renderer reads nothing else.
 */

export const PROFILE_IDS = ["9x16", "16x9"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #RRGGBB");
const unit = z.number().min(0).max(1);

/** Relative path inside the project folder: no absolute paths, no "..". */
const relPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.split(/[\\/]/).includes(".."), {
    message: "path must be relative to the timeline file and must not contain '..'",
  });

export const MOTIONS = [
  "none",
  "ken_burns",
  "zoom_in",
  "zoom_out",
  "pan_left",
  "pan_right",
  "pan_up",
  "pan_down",
] as const;

export const TRANSITIONS = [
  "cut",
  "fade",
  "fadeblack",
  "dissolve",
  "slide_left",
  "slide_up",
  "wipe_left",
  "circle_open",
] as const;

export const TEXT_ROLES = ["kicker", "title", "body"] as const;
export const TEXT_ANIMATIONS = ["none", "fade", "slide_up", "typewriter"] as const;

const ImageBackground = z.object({
  type: z.literal("image"),
  src: relPath,
  motion: z.enum(MOTIONS).default("ken_burns"),
  /** Point of interest (0..1) kept in frame when cropping to either aspect ratio. */
  focus: z.object({ x: unit, y: unit }).default({ x: 0.5, y: 0.5 }),
  /** Darken the image so text stays readable. */
  dim: unit.default(0),
  /**
   * cover: fill the frame (crops). contain: whole image over a blurred copy of itself.
   * auto: per output size, cover unless that would upscale the image too much.
   */
  fit: z.enum(["auto", "cover", "contain"]).default("auto"),
  /** A picture made for one output shape (e.g. a portrait painting for 9x16); falls back to src. */
  variants: z.object({ "9x16": relPath.optional(), "16x9": relPath.optional() }).optional(),
});

const ColorBackground = z.object({
  type: z.literal("color"),
  color: hexColor,
});

const GradientBackground = z.object({
  type: z.literal("gradient"),
  from: hexColor,
  to: hexColor,
  direction: z.enum(["vertical", "horizontal", "diagonal"]).default("diagonal"),
});

export const Background = z.discriminatedUnion("type", [
  ImageBackground,
  ColorBackground,
  GradientBackground,
]);

export const TextLayer = z.object({
  role: z.enum(TEXT_ROLES),
  text: z.string().min(1).max(300),
  animation: z.enum(TEXT_ANIMATIONS).default("fade"),
  startFrame: z.int().min(0).default(0),
  /** Defaults to the end of the scene (including the outgoing transition). */
  endFrame: z.int().min(1).optional(),
});

const Icon = z.enum(ICON_NAMES);
const frame = z.int().min(0);

/**
 * Animated infographic drawn by the renderer itself (vector shapes + text, no image files).
 * Start frames say when each part appears, so parts can follow the narration.
 */
export const GRAPHIC_TYPES = ["big_number", "list", "compare", "icon"] as const;
export const COMPARE_TONES = ["neutral", "bad_good"] as const;
const CompareSide = z.object({
  title: z.string().min(1).max(40),
  icon: Icon,
  points: z.array(z.string().min(1).max(60)).max(3).default([]),
});
export const Graphic = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("big_number"),
    /** "7–9", "30%", "1.500" — counts up when it is a single number. */
    value: z.string().min(1).max(12),
    unit: z.string().max(20).optional(),
    label: z.string().max(80).optional(),
    startFrame: frame.default(0),
  }),
  z.object({
    type: z.literal("list"),
    items: z.array(z.object({ icon: Icon, text: z.string().min(1).max(60), startFrame: frame.default(0) })).min(1).max(4),
  }),
  z.object({
    type: z.literal("compare"),
    /** bad_good: the left side is the bad one (red), the right the good one (green). */
    tone: z.enum(COMPARE_TONES).default("neutral"),
    left: CompareSide,
    right: CompareSide,
    startFrame: frame.default(0),
    rightStartFrame: frame.default(0),
  }),
  z.object({
    type: z.literal("icon"),
    icon: Icon,
    label: z.string().max(60).optional(),
    startFrame: frame.default(0),
  }),
]);

/** Animated character silhouette over the background (a transparent PNG made at build time). */
export const ACTOR_ACTIONS = ["appear", "enter_left", "enter_right", "grow", "charge", "rise", "fly_up"] as const;
export const Actor = z.object({
  src: relPath,
  action: z.enum(ACTOR_ACTIONS).default("appear"),
  startFrame: frame.default(0),
  /** Height as a share of the frame height once fully grown. */
  height: z.number().min(0.1).max(1.2).default(0.55),
  /** Horizontal center (0..1) where the actor ends up. */
  x: unit.default(0.5),
});

/** Particles and lighting drawn over the picture; shake moves the whole frame. */
export const EFFECT_TYPES = ["embers", "dust", "stars", "mist", "light_rays", "leaves", "rain", "flash", "shake"] as const;
export const Effect = z.object({
  type: z.enum(EFFECT_TYPES),
  startFrame: frame.default(0),
  intensity: z.number().min(0.2).max(2).default(1),
});

export const Scene = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/, "id: lowercase letters, digits, _ or -"),
  durationFrames: z.int().min(15).max(30 * 120),
  audio: z
    .object({
      src: relPath,
      offsetFrames: z.int().min(0).default(0),
      volume: z.number().min(0).max(4).default(1),
    })
    .optional(),
  background: Background,
  texts: z.array(TextLayer).max(4).default([]),
  /** Infographic in the middle of the frame; texts move to the top to make room. */
  graphic: Graphic.optional(),
  actor: Actor.optional(),
  effects: z.array(Effect).max(4).default([]),
  /** Narration subtitles over the whole scene; split into readable chunks automatically. */
  caption: z.string().min(1).max(1000).optional(),
  /** Timed subtitles (one per spoken sentence, from TTS). Each is split into chunks within its window. */
  captionCues: z
    .array(z.object({ text: z.string().min(1).max(500), startFrame: z.int().min(0), endFrame: z.int().min(1) }))
    .max(60)
    .optional(),
  transitionOut: z
    .object({
      type: z.enum(TRANSITIONS),
      frames: z.int().min(0).max(60),
    })
    .default({ type: "cut", frames: 0 }),
});

export const Timeline = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().min(1).max(200),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
    profiles: z.array(z.enum(PROFILE_IDS)).min(1).default(["9x16", "16x9"]),
    loudnessLufs: z.number().min(-30).max(-8).default(-14),
    /** Music + sound effects bed for the whole video, mixed under the narration (ducked while it speaks). */
    soundtrack: z.object({ src: relPath, volume: z.number().min(0).max(2).default(1) }).optional(),
    /** Darken the frame edges (cinematic look). */
    vignette: z.boolean().default(false),
    scenes: z.array(Scene).min(1).max(200),
  })
  .superRefine((tl, ctx) => {
    const ids = new Set<string>();
    tl.scenes.forEach((scene, i) => {
      if (ids.has(scene.id)) {
        ctx.addIssue({ code: "custom", message: `duplicate scene id "${scene.id}"`, path: ["scenes", i, "id"] });
      }
      ids.add(scene.id);

      const next = tl.scenes[i + 1];
      const t = scene.transitionOut;
      if (next && t.type !== "cut" && t.frames > 0) {
        const limit = Math.min(scene.durationFrames, next.durationFrames) - 1;
        if (t.frames > limit) {
          ctx.addIssue({
            code: "custom",
            message: `transition (${t.frames} frames) must be shorter than both adjacent scenes (max ${limit})`,
            path: ["scenes", i, "transitionOut", "frames"],
          });
        }
      }
      if (scene.caption !== undefined && scene.captionCues !== undefined) {
        ctx.addIssue({ code: "custom", message: "use either caption or captionCues, not both", path: ["scenes", i, "captionCues"] });
      }
      let prevEnd = 0;
      scene.captionCues?.forEach((cue, j) => {
        const where = ["scenes", i, "captionCues", j];
        if (cue.endFrame <= cue.startFrame) ctx.addIssue({ code: "custom", message: "endFrame must be greater than startFrame", path: where });
        if (cue.startFrame < prevEnd) ctx.addIssue({ code: "custom", message: "cues must be in order and must not overlap", path: where });
        if (cue.endFrame > scene.durationFrames) ctx.addIssue({ code: "custom", message: `cue ends after the scene (${scene.durationFrames} frames)`, path: where });
        prevEnd = cue.endFrame;
      });
      scene.texts.forEach((text, j) => {
        if (text.endFrame !== undefined && text.endFrame <= text.startFrame) {
          ctx.addIssue({
            code: "custom",
            message: "endFrame must be greater than startFrame",
            path: ["scenes", i, "texts", j, "endFrame"],
          });
        }
      });
    });
  });

export type Timeline = z.output<typeof Timeline>;
export type Scene = z.output<typeof Scene>;
export type TextLayer = z.output<typeof TextLayer>;
export type Graphic = z.output<typeof Graphic>;
export type Actor = z.output<typeof Actor>;
export type Effect = z.output<typeof Effect>;
export type Background = z.output<typeof Background>;
export type Motion = (typeof MOTIONS)[number];
export type Transition = (typeof TRANSITIONS)[number];
