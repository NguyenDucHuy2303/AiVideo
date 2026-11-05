import { FALLBACK_ICON, isIcon } from "../renderer/graphics/icons.ts";
import type { Narration } from "../tts/narrate.ts";
import { StoryboardGraphic } from "./schema.ts";

/**
 * Storyboard graphic → timeline graphic. Content comes from the storyboard; timing comes from
 * the narration, so each part appears when it is spoken: list item k with sentence k when
 * the counts match, the right side of a comparison with the second sentence.
 */
export function graphicFor(raw: unknown, n: Narration, fps: number, warnings: string[], where: string) {
  if (raw === undefined) return undefined;
  const parsed = StoryboardGraphic.safeParse(raw);
  if (!parsed.success) {
    warnings.push(`${where}.graphic is invalid and was skipped: ${parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`);
    return undefined;
  }
  const g = parsed.data;
  const icon = (name: string | undefined, fallback = FALLBACK_ICON) => {
    if (name && isIcon(name)) return name;
    if (name) warnings.push(`${where}.graphic: unknown icon "${name}", using "${fallback}"`);
    return fallback;
  };
  const appear = Math.round(fps * 0.2);
  const latest = Math.floor(n.durationFrames * 0.6);
  const cueStart = (k: number) => Math.max(appear, Math.min(latest, n.cues[k]?.startFrame ?? appear));

  switch (g.type) {
    case "none":
      return undefined;
    case "big_number":
      return { type: "big_number" as const, value: g.value, unit: g.unit, label: g.label, startFrame: appear };
    case "icon":
      return { type: "icon" as const, icon: icon(g.icon), label: g.label, startFrame: appear };
    case "list": {
      const count = g.items.length;
      const spacing = Math.max(1, Math.min(fps, Math.floor((n.durationFrames * 0.6) / count)));
      const items = g.items.map((it, k) => ({
        icon: icon(it.icon, "circle-check"),
        text: it.text,
        startFrame: n.cues.length >= count ? cueStart(Math.floor((k * n.cues.length) / count)) : Math.min(latest, appear + k * spacing),
      }));
      return { type: "list" as const, items };
    }
    case "compare": {
      const side = (s: (typeof g)["left"]) => ({ title: s.title, icon: icon(s.icon), points: s.points });
      const right = n.cues.length >= 2 ? cueStart(1) : Math.round(n.durationFrames * 0.4);
      return { type: "compare" as const, tone: g.tone ?? "neutral", left: side(g.left), right: side(g.right), startFrame: appear, rightStartFrame: right };
    }
  }
}
