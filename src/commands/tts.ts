import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_VOICE, ENGINES, VIENEU_DEFAULT_VOICE, VOICES, VOICES_DIR } from "../tts/engines.ts";
import { normalizeForSpeech } from "../tts/normalize-vi.ts";
import { sanitizeText } from "../schema/load.ts";
import { exists, slugify } from "../utils/fs.ts";
import { probe } from "../utils/probe.ts";

export async function listVoices(): Promise<void> {
  for (const v of VOICES) {
    const installed = await exists(path.join(VOICES_DIR, `${v.id}.onnx`));
    const commercial = v.commercial === true ? "commercial OK" : v.commercial === false ? "NON-commercial" : "license unknown";
    console.log(`${installed ? "✔" : "·"} ${v.id.padEnd(26)} ${v.quality.padEnd(7)} ${commercial.padEnd(16)} ${v.license}${v.id === DEFAULT_VOICE ? "  (default)" : ""}`);
  }
  console.log(`\n✔ = installed in ${VOICES_DIR}. Install with: bash scripts/setup-tts.sh`);
}

export async function say(text: string, opts: { voice?: string; speed?: number; engine?: "piper" | "vieneu" | "dummy"; output?: string }): Promise<void> {
  const engine = ENGINES[opts.engine ?? "piper"]!;
  const voice = opts.voice ?? (opts.engine === "vieneu" ? VIENEU_DEFAULT_VOICE : DEFAULT_VOICE);
  const spoken = normalizeForSpeech(sanitizeText(text).text);
  const out = path.resolve(opts.output ?? `say-${voice}-${slugify(text).slice(0, 30)}.wav`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  console.log(`spoken text: ${spoken}`);
  await engine.synthesize(spoken, out, { voice, speed: opts.speed ?? 1 });
  console.log(`✔ ${out} (${(await probe(out)).durationSec.toFixed(2)}s)`);
}
