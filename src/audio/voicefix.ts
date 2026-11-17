/**
 * Voices made until their English is right (the user, 16–17/11/2026: "English must be read
 * exactly right"). The voice build, then every English sentence heard back by Whisper
 * (englishcheck.ts); a speaker read wrong gets the next English voice that reads right and only
 * its lines are made again (the rest is cached); three rounds, then the job stops with the
 * lines that are still wrong. Used by every film with English: Ask Huy, the English versions of
 * the stories, the English lessons. No brain, no tokens.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../config.ts";
import { run } from "../utils/process.ts";
import { checkEnglish, type EnglishCheck } from "./englishcheck.ts";

/**
 * Kokoro voices in the order they read children's words right (Whisper on 20 short words,
 * 16–17/11/2026): af_heart made no mistake; af_nova, am_liam and am_eric made many.
 */
export const GOOD_EN = {
  female: ["af_heart", "af_bella", "af_alloy", "af_nicole"],
  male: ["am_michael", "bm_lewis", "am_puck", "am_adam"],
};
const isMale = (voice?: string) => /^(am|bm)_/.test(voice ?? "");

/** The voice build of a project (storyboard.json), its English checked and set right. */
export async function voicesChecked(dir: string, log: (s: string) => void = () => {}, rounds = 3): Promise<EnglishCheck[]> {
  const tts = path.join(dir, "gen", "tts"), pjFile = path.join(dir, "project.json");
  let bad: EnglishCheck[] = [];
  for (let round = 1; round <= rounds; round++) {
    log(round === 1 ? "  voices" : `  voices again (round ${round})`);
    for (const f of await fs.readdir(tts).catch(() => [] as string[])) if (/\.en\.(json|txt)$/.test(f)) await fs.rm(path.join(tts, f));
    await run(process.execPath, [path.join(ROOT, "src", "cli.ts"), "build", path.join(dir, "storyboard.json"), "--voice-only"], { cwd: ROOT, timeoutMs: 60 * 60_000 });
    log("  English check (Whisper)");
    ({ bad } = await checkEnglish(dir));
    for (const b of bad) log(`  ✘ English (${b.who ?? "người dẫn"}): "${b.meant}" heard as "${b.heard}"`);
    if (!bad.length || round === rounds) break;
    // the next good voice for each speaker read wrong (its English voice, or its only voice in an English film)
    const pj = JSON.parse(await fs.readFile(pjFile, "utf8"));
    const english = pj.engine === "kokoro";
    for (const who of new Set(bad.map((b) => b.who ?? ""))) {
      const key = !who ? "" : pj.voices?.[`${who}@en`] ? `${who}@en` : english && pj.voices?.[who] ? who : `${who}@en`;
      const cur = key ? pj.voices?.[key] : pj.voice;
      const curVoice = typeof cur === "string" ? cur : cur?.voice;
      const list = GOOD_EN[isMale(curVoice) || who === "Huy" || who === "Hùng" ? "male" : "female"];
      const next = list[(list.indexOf(curVoice) + 1) % list.length]!;
      if (!key) pj.voice = next;
      else pj.voices[key] = { ...(typeof cur === "object" ? cur : {}), voice: next, ...(english && key === who ? {} : { engine: "kokoro" }) };
      log(`  ${who || "người dẫn"}: English voice ${curVoice} → ${next}`);
    }
    await fs.writeFile(pjFile, JSON.stringify(pj, null, 2));
  }
  if (bad.length) throw new Error(`tiếng Anh đọc sai sau ${rounds} lượt đổi giọng: ${bad.slice(0, 5).map((b) => `"${b.meant}" (${b.who ?? "người dẫn"}) nghe ra "${b.heard}"`).join("; ")}`);
  return bad;
}
