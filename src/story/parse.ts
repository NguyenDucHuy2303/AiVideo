import { splitSentences } from "../tts/normalize-vi.ts";

/**
 * A story script written by a person: chapter headings on their own lines, then paragraphs.
 * The narration is kept word for word; only the split into scenes is decided here.
 */
export interface StoryScene {
  chapter: number;
  narration: string;
}

export interface ParsedStory {
  chapters: string[];
  scenes: StoryScene[];
  /** Lines that were left out, with the reason. */
  dropped: string[];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** A heading: short and without sentence-ending punctuation. */
function isHeading(line: string): boolean {
  return words(line) <= 12 && !/[.!?…:;,"”)]$/.test(line);
}

/** Scenes of about one or two sentences, so the picture changes every 5–12 seconds. */
const SCENE_MIN_WORDS = 16;
const SCENE_MAX_WORDS = 36;

export function parseStory(text: string): ParsedStory {
  const lines = text.normalize("NFC").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const dropped: string[] = [];
  const count = new Map<string, number>();
  for (const l of lines) count.set(l, (count.get(l) ?? 0) + 1);

  const chapters: string[] = [];
  const paragraphs: { chapter: number; text: string }[] = [];
  for (const line of lines) {
    if (isHeading(line)) {
      // Text copied from web pages carries image captions ("… 1") and repeated lines; a real
      // chapter heading appears once and isn't numbered like a figure.
      if ((count.get(line) ?? 0) > 1) {
        if (!dropped.includes(`${line} (repeated)`)) dropped.push(`${line} (repeated)`);
        continue;
      }
      if (/\s\d+$/.test(line)) {
        dropped.push(`${line} (looks like an image caption)`);
        continue;
      }
      chapters.push(line);
      continue;
    }
    if (!chapters.length) chapters.push("");
    paragraphs.push({ chapter: chapters.length - 1, text: line });
  }

  const scenes: StoryScene[] = [];
  for (const p of paragraphs) {
    let current: string[] = [];
    const flush = () => {
      if (current.length) scenes.push({ chapter: p.chapter, narration: current.join(" ") });
      current = [];
    };
    for (const sentence of splitSentences(p.text, 400)) {
      const n = words(current.join(" "));
      if (current.length && (n >= SCENE_MIN_WORDS || n + words(sentence) > SCENE_MAX_WORDS)) flush();
      current.push(sentence);
    }
    flush();
  }
  return { chapters, scenes, dropped };
}
