import { FONT_FAMILY } from "../config.ts";
import { safeCenterX, safeWidth, type Layout, type TextStyle } from "../layouts/index.ts";
import { TEXT_ROLES, type Scene, type TextLayer } from "../schema/timeline.ts";
import { measureFor } from "./fontMetrics.ts";
import { fitText, splitCaptions } from "./text.ts";
import { graphicEvents } from "./graphics/layout.ts";
import { effectEvents } from "./graphics/fx.ts";

/** libass sizes fonts so ascender + descender equals the font size, i.e. one line = one font size. */
const LINE_HEIGHT = 1.0;
const SLIDE_PX = 60;

export function assColor(hex: string, alpha = 0): string {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  const a = alpha.toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`.toUpperCase();
}

export function assTime(frame: number, fps: number): string {
  const cs = Math.round((frame / fps) * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

function styleLine(name: string, st: TextStyle, alignment: number): string {
  return [
    `Style: ${name}`, FONT_FAMILY, st.size,
    assColor(st.color), assColor(st.color), assColor(st.outlineColor), assColor("#000000", 0x80),
    st.bold ? -1 : 0, 0, 0, 0, 100, 100, 0, 0,
    1, st.outline, st.shadow, alignment, 0, 0, 0, 1,
  ].join(",");
}

/** Layers: 0 effects, 1–3 graphics, 4 texts and captions (always on top). */
const TEXT_LAYER = 4;

function dialogue(style: string, start: string, end: string, text: string): string {
  return `Dialogue: ${TEXT_LAYER},${start},${end},${style},,0,0,0,,${text}`;
}

interface Placed {
  layer: TextLayer;
  size: number;
  lines: string[];
  y: number;
}

/**
 * Stack kicker → title → body as one block centered on layout.textBlockCenterY, or at the
 * top of the safe area when a graphic needs the middle of the frame.
 */
function placeTexts(texts: TextLayer[], layout: Layout, warnings: string[], atTop = false): Placed[] {
  const ordered = [...texts].sort((a, b) => TEXT_ROLES.indexOf(a.role) - TEXT_ROLES.indexOf(b.role));
  const fitted = ordered.map((layer) => {
    const style = layout.text[layer.role];
    const fit = fitText(layer.text, style, layout);
    if (fit.overflow) {
      warnings.push(`[${layout.id}] ${layer.role} "${layer.text.slice(0, 30)}…" needs ${fit.lines.length} lines (max ${style.maxLines}); shorten it`);
    }
    return { layer, ...fit, height: fit.lines.length * fit.size * LINE_HEIGHT };
  });
  const total = fitted.reduce((sum, f, i) => sum + f.height + (i < fitted.length - 1 ? layout.text[f.layer.role].gapAfter : 0), 0);
  let y = atTop ? layout.safe.top + layout.graphicTopPad : Math.max(layout.safe.top, Math.round(layout.textBlockCenterY - total / 2));
  return fitted.map((f) => {
    const placed = { layer: f.layer, size: f.size, lines: f.lines, y };
    y += Math.round(f.height + layout.text[f.layer.role].gapAfter);
    return placed;
  });
}

function textEvents(p: Placed, x: number, clipFrames: number, fps: number): string[] {
  const { layer } = p;
  const startFrame = Math.min(layer.startFrame, clipFrames - 1);
  const endFrame = Math.min(layer.endFrame ?? clipFrames, clipFrames);
  const start = assTime(startFrame, fps);
  const end = assTime(endFrame, fps);
  const base = `\\an8\\pos(${x},${p.y})\\fs${p.size}`;
  const body = p.lines.join("\\N");

  switch (layer.animation) {
    case "none":
      return [dialogue(layer.role, start, end, `{${base}}${body}`)];
    case "fade":
      return [dialogue(layer.role, start, end, `{${base}\\fad(300,200)}${body}`)];
    case "slide_up":
      return [
        dialogue(layer.role, start, end, `{\\an8\\move(${x},${p.y + SLIDE_PX},${x},${p.y},0,400)\\fs${p.size}\\fad(250,200)}${body}`),
      ];
    case "typewriter": {
      // Reveal word by word. The hidden rest is still drawn (fully transparent) so line breaks never jump.
      const words = p.lines.flatMap((line, li) => line.split(" ").map((w, wi) => ({ w, newLine: li > 0 && wi === 0 })));
      const visibleFrames = endFrame - startFrame;
      const step = Math.max(1, Math.min(Math.round(fps * 0.15), Math.floor((visibleFrames * 0.6) / words.length)));
      const events: string[] = [];
      for (let k = 1; k <= words.length; k++) {
        let text = "";
        words.forEach((word, i) => {
          if (i > 0) text += word.newLine ? "\\N" : " ";
          if (i === k) text += "{\\alpha&HFF&}";
          text += word.w;
        });
        const evStart = startFrame + (k - 1) * step;
        const isLast = k === words.length;
        const evEnd = isLast ? endFrame : Math.min(endFrame, startFrame + k * step);
        if (evStart >= evEnd) continue;
        events.push(dialogue(layer.role, assTime(evStart, fps), assTime(evEnd, fps), `{${base}${isLast ? "\\fad(0,200)" : ""}}${text}`));
      }
      return events;
    }
  }
}

/**
 * Build the .ass subtitle file holding every text element of one scene clip.
 * `clipFrames` includes the outgoing transition tail.
 */
export function buildSceneAss(scene: Scene, layout: Layout, fps: number, clipFrames: number): { ass: string; warnings: string[] } {
  const warnings: string[] = [];
  const x = safeCenterX(layout);
  const cap = layout.caption;

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${layout.width}`,
    `PlayResY: ${layout.height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    styleLine("kicker", layout.text.kicker, 8),
    styleLine("title", layout.text.title, 8),
    styleLine("body", layout.text.body, 8),
    styleLine("caption", cap, 2),
    // Graphics set size, colours and position per event; these only pick the font weight.
    styleLine("gfx", { ...layout.text.body, outline: 0, shadow: 0 }, 5),
    styleLine("gfxb", { ...layout.text.body, bold: true, outline: 0, shadow: 0 }, 5),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = effectEvents(scene.effects, layout, fps, clipFrames, scene.id);
  const placed = placeTexts(scene.texts, layout, warnings, scene.graphic !== undefined || scene.actor !== undefined);
  for (const p of placed) events.push(...textEvents(p, x, clipFrames, fps));

  if (scene.graphic) {
    const last = placed.at(-1);
    const textBottom = last ? last.y + last.lines.length * last.size * LINE_HEIGHT : layout.safe.top;
    const region = {
      x0: layout.safe.left,
      x1: layout.width - layout.safe.right,
      y0: textBottom + layout.graphicGap,
      y1: cap.bottomY - cap.maxLines * cap.size - layout.graphicGap,
    };
    events.push(...graphicEvents(scene.graphic, region, layout, fps, clipFrames));
  }

  const cues = scene.captionCues ?? (scene.caption ? [{ text: scene.caption, startFrame: 0, endFrame: scene.durationFrames }] : []);
  const measure = measureFor(cap.bold, cap.size, cap.outline);
  for (const cue of cues) {
    for (const c of splitCaptions(cue.text, safeWidth(layout), measure, cap.maxLines, cue.endFrame - cue.startFrame)) {
      const start = assTime(cue.startFrame + c.startFrame, fps);
      const end = assTime(cue.startFrame + c.endFrame, fps);
      events.push(dialogue("caption", start, end, `{\\an2\\pos(${x},${cap.bottomY})\\fad(80,60)}${c.lines.join("\\N")}`));
    }
  }

  return { ass: `${[...header, ...events].join("\n")}\n`, warnings };
}
