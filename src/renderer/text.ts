import { safeWidth, type Layout, type TextStyle } from "../layouts/index.ts";
import { measureFor, type Measure } from "./fontMetrics.ts";

/** Greedy word wrap to `maxWidth` (in the units of `measure`). Words wider than a line are hard-split. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = "";
  for (let word of text.split(" ").filter(Boolean)) {
    while (measure(word) > maxWidth && word.length > 1) {
      if (line) {
        lines.push(line);
        line = "";
      }
      let cut = word.length - 1;
      while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut--;
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Same number of lines as greedy wrapping, but with lines as even as possible —
 * avoids a lone word on the last line ("…khi bạn thiếu / ngủ?").
 */
export function wrapBalanced(text: string, maxWidth: number, measure: Measure): string[] {
  const greedy = wrapText(text, maxWidth, measure);
  if (greedy.length <= 1) return greedy;
  let lo = Math.max(...text.split(" ").map(measure)) - 1;
  let hi = maxWidth;
  for (let i = 0; i < 14 && hi - lo > 1; i++) {
    const mid = (lo + hi) / 2;
    if (wrapText(text, mid, measure).length <= greedy.length) hi = mid;
    else lo = mid;
  }
  return wrapText(text, hi, measure);
}

export interface FittedText {
  size: number;
  lines: string[];
  /** True when the text needs more than maxLines even at minSize. */
  overflow: boolean;
}

/** Shrink the font step by step until the text fits in maxLines. */
export function fitText(text: string, style: TextStyle, layout: Layout): FittedText {
  const width = safeWidth(layout);
  for (let size = style.size; size >= style.minSize; size -= 4) {
    const measure = measureFor(style.bold, size, style.outline);
    const lines = wrapBalanced(text, width, measure);
    if (lines.length <= style.maxLines) return { size, lines, overflow: false };
  }
  const lines = wrapBalanced(text, width, measureFor(style.bold, style.minSize, style.outline));
  return { size: style.minSize, lines, overflow: true };
}

export interface CaptionChunk {
  startFrame: number;
  endFrame: number;
  lines: string[];
}

/** Split at punctuation, keeping it attached to the phrase. */
function phrases(text: string): string[] {
  return text
    .split(/(?<=[.!?;:,…])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Turn narration into subtitle pages of at most `maxLines` lines, preferring to break
 * at punctuation, and spread them over the scene proportionally to their length.
 */
export function splitCaptions(
  text: string,
  maxWidth: number,
  measure: Measure,
  maxLines: number,
  totalFrames: number,
): CaptionChunk[] {
  const fits = (t: string) => wrapText(t, maxWidth, measure).length <= maxLines;
  const pages: string[] = [];
  let current = "";

  for (const phrase of phrases(text)) {
    const candidate = current ? `${current} ${phrase}` : phrase;
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) pages.push(current);
    current = "";
    if (fits(phrase)) {
      current = phrase;
      continue;
    }
    // Phrase too long for one page: split it into evenly sized pages.
    const parts = wrapBalanced(phrase, maxWidth * maxLines * 0.92, measure);
    if (parts.every(fits)) {
      pages.push(...parts.slice(0, -1));
      current = parts.at(-1)!;
    } else {
      for (const word of phrase.split(" ")) {
        const next = current ? `${current} ${word}` : word;
        if (fits(next)) current = next;
        else {
          if (current) pages.push(current);
          current = word;
        }
      }
    }
  }
  if (current) pages.push(current);

  // Short pauses count as a few characters so tiny pages don't flash by.
  const weights = pages.map((p) => p.length + 4);
  const total = weights.reduce((a, b) => a + b, 0);
  const chunks: CaptionChunk[] = [];
  let acc = 0;
  let start = 0;
  pages.forEach((page, i) => {
    acc += weights[i]!;
    const end = i === pages.length - 1 ? totalFrames : Math.max(start + 1, Math.round((acc / total) * totalFrames));
    chunks.push({ startFrame: start, endFrame: end, lines: wrapBalanced(page, maxWidth, measure) });
    start = end;
  });
  return chunks;
}
