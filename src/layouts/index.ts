import type { ProfileId } from "../schema/timeline.ts";

export interface TextStyle {
  size: number;
  /** Smallest size auto-fit may shrink to before the text is reported as too long. */
  minSize: number;
  bold: boolean;
  color: string;
  outlineColor: string;
  outline: number;
  shadow: number;
  maxLines: number;
  /** Extra space below this element when stacked, in px. */
  gapAfter: number;
}

export interface Layout {
  id: ProfileId;
  width: number;
  height: number;
  /**
   * Area that platform UI never covers. 9:16 reserves the bottom (description, buttons)
   * and the right rail (like/comment/share) used by TikTok, Shorts and Reels.
   */
  safe: { top: number; right: number; bottom: number; left: number };
  /** Vertical center of the stacked kicker/title/body block, in px. */
  textBlockCenterY: number;
  /** With a graphic, the heading starts this far below safe.top… */
  graphicTopPad: number;
  /** …and the graphic keeps this much space from the heading and the captions. */
  graphicGap: number;
  /** Story silhouettes: where their feet stand and their full height, in px. */
  actor: { baseY: number; maxHeight: number };
  text: { kicker: TextStyle; title: TextStyle; body: TextStyle };
  caption: TextStyle & {
    /** Baseline (bottom edge) of the caption block, in px. */
    bottomY: number;
  };
}

const WHITE = "#FFFFFF";
const BLACK = "#000000";
const ACCENT = "#FACC15";

const LAYOUTS: Record<ProfileId, Layout> = {
  "9x16": {
    id: "9x16",
    width: 1080,
    height: 1920,
    safe: { top: 160, right: 150, bottom: 420, left: 80 },
    textBlockCenterY: 760,
    graphicTopPad: 40,
    graphicGap: 60,
    actor: { baseY: 1390, maxHeight: 900 },
    text: {
      kicker: { size: 44, minSize: 36, bold: true, color: ACCENT, outlineColor: BLACK, outline: 3, shadow: 0, maxLines: 1, gapAfter: 24 },
      title: { size: 92, minSize: 64, bold: true, color: WHITE, outlineColor: BLACK, outline: 5, shadow: 2, maxLines: 4, gapAfter: 56 },
      body: { size: 52, minSize: 42, bold: false, color: WHITE, outlineColor: BLACK, outline: 3, shadow: 1, maxLines: 5, gapAfter: 0 },
    },
    caption: {
      size: 62, minSize: 50, bold: true, color: WHITE, outlineColor: BLACK, outline: 6, shadow: 0, maxLines: 2, gapAfter: 0,
      bottomY: 1500,
    },
  },
  "16x9": {
    id: "16x9",
    width: 1920,
    height: 1080,
    safe: { top: 90, right: 180, bottom: 80, left: 180 },
    textBlockCenterY: 450,
    graphicTopPad: 0,
    graphicGap: 40,
    actor: { baseY: 1010, maxHeight: 760 },
    text: {
      kicker: { size: 40, minSize: 32, bold: true, color: ACCENT, outlineColor: BLACK, outline: 3, shadow: 0, maxLines: 1, gapAfter: 20 },
      title: { size: 96, minSize: 64, bold: true, color: WHITE, outlineColor: BLACK, outline: 5, shadow: 2, maxLines: 3, gapAfter: 44 },
      body: { size: 48, minSize: 38, bold: false, color: WHITE, outlineColor: BLACK, outline: 3, shadow: 1, maxLines: 4, gapAfter: 0 },
    },
    caption: {
      size: 54, minSize: 44, bold: true, color: WHITE, outlineColor: BLACK, outline: 5, shadow: 0, maxLines: 2, gapAfter: 0,
      bottomY: 990,
    },
  },
};

export function getLayout(id: ProfileId): Layout {
  return LAYOUTS[id];
}

export function safeWidth(layout: Layout): number {
  return layout.width - layout.safe.left - layout.safe.right;
}

export function safeCenterX(layout: Layout): number {
  return Math.round((layout.safe.left + layout.width - layout.safe.right) / 2);
}
