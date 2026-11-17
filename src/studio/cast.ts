/**
 * Voices for a story's characters, from the VieNeu preset voices: each character gets a voice
 * that fits (sex, age, hero or villain) and differs from the others; when the voices run out
 * they are reused at another pitch. Children are women's voices raised in pitch.
 */
export interface CastMember { name: string; gender: "male" | "female"; age: "child" | "young" | "adult" | "elder"; role: string; villain: boolean }
export type Voice = string | { voice: string; pitch?: number; speed?: number };

const POOLS = {
  male: { young: ["Thiện Minh", "Thanh Bình", "Hải Đăng", "Quốc Tuấn"], adult: ["Quốc Tuấn", "Thanh Bình", "Thiện Minh", "Hải Đăng"], elder: ["Quốc Tuấn", "Thanh Bình", "Hải Đăng"], villain: ["Hải Đăng", "Thanh Bình", "Quốc Tuấn"] },
  female: { young: ["Thùy Dung", "Đoan Trang", "Ngọc Linh", "Ngọc Huyền"], adult: ["Ngọc Huyền", "Đoan Trang", "Thùy Dung", "Ngọc Linh"], elder: ["Ngọc Huyền", "Đoan Trang", "Thùy Dung"], villain: ["Đoan Trang", "Ngọc Linh", "Thùy Dung"] },
  child: { male: ["Mai Anh", "Ngọc Linh"], female: ["Ngọc Linh", "Mai Anh"] },
};

export function castVoices(cast: CastMember[], narrator: string): Record<string, Voice> {
  const used = new Map<string, number>([[narrator, 1]]);
  const out: Record<string, Voice> = {};
  for (const c of cast) {
    const pool = c.age === "child" ? POOLS.child[c.gender] : POOLS[c.gender][c.villain ? "villain" : c.age === "elder" ? "elder" : c.age === "young" ? "young" : "adult"];
    const voice = pool.find((v) => !used.has(v)) ?? pool.reduce((a, b) => ((used.get(a) ?? 0) <= (used.get(b) ?? 0) ? a : b));
    const n = used.get(voice) ?? 0;
    used.set(voice, n + 1);
    // Children up, elders and villains a little down; a reused voice moves pitch to differ.
    const pitch = (c.age === "child" ? 4 : c.age === "elder" ? -1 : c.villain ? -1 : 0) + (n ? (n % 2 ? -2 : 2) : 0);
    out[c.name] = pitch ? { voice, pitch } : voice;
  }
  return out;
}

/** Kokoro voices for the English version (American and British), by the same rules. */
const EN = {
  // (ordered by how right they read children's English words, Whisper and IPA, 16–17/11/2026:
  // am_liam, am_eric, af_nova, af_sky read many wrong; voicefix.ts still checks every film)
  male: { young: ["am_michael", "bm_lewis", "am_puck", "am_adam"], adult: ["am_michael", "bm_lewis", "am_adam", "am_puck"], elder: ["am_michael", "bm_lewis", "bm_george"], villain: ["am_fenrir", "am_onyx", "bm_lewis"] },
  female: { young: ["af_heart", "af_bella", "af_alloy", "af_nicole"], adult: ["af_heart", "af_bella", "af_nicole", "af_alloy"], elder: ["af_heart", "af_bella", "bf_alice"], villain: ["af_nicole", "af_alloy", "af_kore"] },
  child: { male: ["af_heart", "af_bella"], female: ["af_heart", "af_bella"] },
};

export function castVoicesEn(cast: CastMember[], narrator: string): Record<string, Voice> {
  const used = new Map<string, number>([[narrator, 1]]);
  const out: Record<string, Voice> = {};
  for (const c of cast) {
    const pool = c.age === "child" ? EN.child[c.gender] : EN[c.gender][c.villain ? "villain" : c.age === "elder" ? "elder" : c.age === "young" ? "young" : "adult"];
    const voice = pool.find((v) => !used.has(v)) ?? pool.reduce((a, b) => ((used.get(a) ?? 0) <= (used.get(b) ?? 0) ? a : b));
    const n = used.get(voice) ?? 0;
    used.set(voice, n + 1);
    const pitch = (c.age === "child" ? 3 : 0) + (n ? (n % 2 ? -2 : 2) : 0);
    out[c.name] = pitch ? { voice, pitch } : voice;
  }
  return out;
}
