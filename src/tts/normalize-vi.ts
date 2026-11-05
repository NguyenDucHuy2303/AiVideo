/**
 * Turn Vietnamese text into what a TTS engine should *say*: numbers, percentages,
 * ranges and common units spelled out. Captions keep the original text.
 */

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"] as const;
const SCALES = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"] as const;

function readTriple(n: number, full: boolean): string {
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  const words: string[] = [];

  if (full || h > 0) words.push(DIGITS[h]!, "trăm");
  if (t === 0) {
    if (u > 0) words.push(...(full || h > 0 ? ["linh", DIGITS[u]!] : [DIGITS[u]!]));
  } else if (t === 1) {
    words.push("mười");
    if (u === 5) words.push("lăm");
    else if (u > 0) words.push(DIGITS[u]!);
  } else {
    words.push(DIGITS[t]!, "mươi");
    if (u === 1) words.push("mốt");
    else if (u === 4) words.push("tư");
    else if (u === 5) words.push("lăm");
    else if (u > 0) words.push(DIGITS[u]!);
  }
  return words.join(" ");
}

/** Read a non-negative integer the way a Vietnamese narrator would. */
export function readInteger(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, "");
  if (clean.length > SCALES.length * 3) return clean.split("").map((d) => DIGITS[Number(d)]).join(" ");
  if (/^0+$/.test(clean)) return DIGITS[0];

  const groups: number[] = [];
  for (let end = clean.length; end > 0; end -= 3) groups.unshift(Number(clean.slice(Math.max(0, end - 3), end)));

  const words: string[] = [];
  groups.forEach((g, i) => {
    if (g === 0) return;
    const scale = SCALES[groups.length - 1 - i]!;
    // After the leading group, a group below 100 is read in full: 1005 → "một nghìn không trăm linh năm".
    words.push(readTriple(g, words.length > 0));
    if (scale) words.push(scale);
  });
  return words.join(" ");
}

function readDecimal(intPart: string, frac: string): string {
  const fracWords = frac.length <= 2 && !frac.startsWith("0") ? readInteger(frac) : frac.split("").map((d) => DIGITS[Number(d)]).join(" ");
  return `${readInteger(intPart)} phẩy ${fracWords}`;
}

const UNITS: Record<string, string> = {
  "%": "phần trăm",
  km: "ki lô mét",
  kg: "ki lô gam",
  cm: "xen ti mét",
  mm: "mi li mét",
  ml: "mi li lít",
  "°C": "độ C",
};

// 1.000.000 | 3,5 | 3.5 | 42 — followed by an optional unit.
const NUMBER = /(\d{1,3}(?:\.\d{3})+(?!\d)|\d+(?:[.,]\d+)?)(\s?(?:%|°C|km|kg|cm|mm|ml)(?![\p{L}\d]))?/gu;

function readNumberToken(token: string): string {
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) return readInteger(token.replace(/\./g, ""));
  const m = /^(\d+)[.,](\d+)$/.exec(token);
  if (m) return readDecimal(m[1]!, m[2]!);
  return readInteger(token);
}

export function normalizeForSpeech(text: string): string {
  return text
    .normalize("NFC")
    // Ranges: "6-8 tiếng" → "6 đến 8 tiếng"
    .replace(/(\d)\s?[-–]\s?(\d)/g, "$1 đến $2")
    .replace(NUMBER, (_, num: string, unit?: string) => {
      const spoken = readNumberToken(num);
      const u = unit?.trim();
      return u ? `${spoken} ${UNITS[u]}` : spoken;
    })
    .replace(/&/g, " và ")
    .replace(/[*_#"“”«»()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split narration into sentences; very long sentences are split again at commas/semicolons. */
export function splitSentences(text: string, maxChars = 180): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)) {
    if (sentence.length <= maxChars) {
      out.push(sentence);
      continue;
    }
    let current = "";
    for (const part of sentence.split(/(?<=[,;:])\s+/)) {
      if (current && current.length + 1 + part.length > maxChars) {
        out.push(current);
        current = part;
      } else current = current ? `${current} ${part}` : part;
    }
    if (current) out.push(current);
  }
  return out;
}
