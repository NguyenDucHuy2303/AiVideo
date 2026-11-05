import { z } from "zod";
import { ICON_NAMES } from "../renderer/graphics/icons.ts";
import { COMPARE_TONES, MOTIONS, TRANSITIONS } from "../schema/timeline.ts";

export const MOODS = ["calm", "dark", "warm", "energetic", "nature", "serious"] as const;

/** Vietnamese is read at roughly this many syllables (words) per second by our TTS, pauses included. */
export const WORDS_PER_SECOND = 3.7;

export interface ScriptRequest {
  topic: string;
  /** Target length of the finished video, in seconds. */
  durationSec: number;
  scenes: number;
  /** Optional extra direction from the user: audience, tone, angle… */
  notes?: string;
}

/**
 * Schema sent to the model. Stricter than the Storyboard schema the builder accepts: every
 * field is required and style hints are enums, because small local models follow a tight
 * grammar far better than prose instructions. Anything valid here is valid there.
 */
export function llmSchema(req: ScriptRequest) {
  const min = Math.max(1, req.scenes - 1);
  const max = req.scenes + 1;
  const icon = z.enum(ICON_NAMES);
  const side = z.object({ title: z.string().min(1).max(24), icon, points: z.array(z.string().min(2).max(36)).max(3) });
  const graphic = z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("big_number"), value: z.string().min(1).max(10), unit: z.string().max(16), label: z.string().max(60) }),
    z.object({ type: z.literal("list"), items: z.array(z.object({ icon, text: z.string().min(2).max(40) })).min(2).max(4) }),
    z.object({ type: z.literal("compare"), tone: z.enum(COMPARE_TONES), left: side, right: side }),
    z.object({ type: z.literal("icon"), icon, label: z.string().max(40) }),
  ]);
  const scene = z.object({
    narration: z.string().min(10).max(400),
    onScreen: z.object({
      kicker: z.string().max(24),
      title: z.string().min(2).max(70),
      body: z.string().max(140),
    }),
    visual: z.object({
      query: z.string().min(3).max(80),
      description: z.string().max(200),
      mood: z.enum(MOODS),
    }),
    camera: z.enum(MOTIONS.filter((m) => m !== "none")),
    transition: z.enum(TRANSITIONS),
    graphic,
  });
  return z.toJSONSchema(z.object({ title: z.string().min(3).max(100), scenes: z.array(scene).min(min).max(max) }));
}

export function systemPrompt(): string {
  return [
    "You are the scriptwriter of a Vietnamese educational short-video channel.",
    "You write the storyboard only; software turns it into narration audio, visuals and video.",
    "",
    "Language: write `title`, `narration`, `kicker`, `title` and `body` in natural, correct Vietnamese with full diacritics.",
    "Write `visual.query` in English (it is used to search a photo library).",
    "",
    "Rules:",
    "- Scene 1 is a hook: a question or surprising fact that makes people keep watching.",
    "- The last scene gives a takeaway or a simple action the viewer can do.",
    "- Each `narration` is 1–3 short spoken sentences. Plain text: no emoji, no markdown, no lists, no quotes.",
    "- Capitalize Vietnamese like a normal sentence: only the first word and proper names. Never Title Case (write \"Vì sao ta cần ngủ đủ giấc?\", not \"Vì Sao Ta Cần Ngủ Đủ Giấc?\").",
    "- `onScreen.title` is a short headline (max ~8 words) that summarizes the scene; do not copy the narration.",
    "- `onScreen.kicker` is an optional 1–3 word label, or an empty string.",
    "- `onScreen.body` is usually an empty string. Fill it only when it adds something the narration does not say aloud, such as a key number or a short list (max ~20 words). Never repeat the narration.",
    "- `visual.query`: 3–6 concrete English keywords for a photo, e.g. \"tired man desk night laptop\".",
    "- `visual.description`: one English sentence describing the picture, used to paint it when no photo is found (e.g. \"a tired man at a desk at night, lit by a laptop screen\"). No text or words in the picture.",
    "",
    "Graphics: `graphic` turns a scene into an animated infographic drawn by the software instead of a photo.",
    "Use one in about half of the scenes, where it explains better than a photo; the others use `{\"type\": \"none\"}` and get a photo from `visual.query`.",
    "- big_number: a key number that the narration says aloud (value \"7–9\", unit \"tiếng\", label \"mỗi đêm cho người lớn\").",
    "- list: 2–4 parallel points from the narration, each with an icon and at most 6 words.",
    "- compare: two sides, e.g. \"Thiếu ngủ\" vs \"Ngủ đủ\", each with a title, an icon and up to 3 short points. tone bad_good when the left side is the bad one.",
    "- icon: one concept, one icon and a short label.",
    "- Graphic texts are short Vietnamese. Never put a number in a graphic that the narration does not say.",
    "",
    "- Only state facts you are confident are true. Do not invent statistics, studies or quotes; if unsure, leave numbers out.",
    "- Output only the JSON object.",
  ].join("\n");
}

export function userPrompt(req: ScriptRequest): string {
  const words = Math.round(req.durationSec * WORDS_PER_SECOND);
  return [
    `Topic: ${req.topic}`,
    `Length: about ${req.durationSec} seconds, ${req.scenes} scenes, about ${words} Vietnamese words of narration in total`,
    `(about ${Math.round(words / req.scenes)} words, ${Math.max(1, Math.round(words / req.scenes / 15))}–${Math.max(2, Math.round(words / req.scenes / 11))} short sentences, in each scene's narration).`,
    "A Vietnamese word here is one syllable: \"giấc ngủ\" is 2 words. The length matters because the narration is read aloud.",
    req.notes ? `Direction: ${req.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function repairPrompt(problems: string[]): string {
  return [
    "Your JSON has problems. Fix all of them and return the complete corrected JSON object only:",
    ...problems.map((p) => `- ${p}`),
  ].join("\n");
}
