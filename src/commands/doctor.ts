import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FFMPEG, FFPROBE, FONTS_DIR, ROOT } from "../config.ts";
import { DEFAULT_OLLAMA_MODEL, OLLAMA_HOST, ollama } from "../script/providers.ts";
import { pexels, pixabay, type ImageSource } from "../library/online.ts";
import { sdTurbo } from "../imagegen/sd.ts";
import { DEFAULT_VOICE, PIPER_DIR, VOICES, VOICES_DIR } from "../tts/engines.ts";
import { exists } from "../utils/fs.ts";
import { run } from "../utils/process.ts";

type Status = "ok" | "warn" | "fail";
interface Check {
  name: string;
  status: Status;
  detail: string;
}

const REQUIRED_FILTERS = ["zoompan", "xfade", "subtitles", "gradients", "loudnorm", "drawbox", "anullsrc", "apad", "atrim"];
const REQUIRED_ENCODERS = ["libx264", "aac"];
const FONT_FILES = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"];

async function tool(cmd: string): Promise<Check> {
  try {
    const { stdout } = await run(cmd, ["-hide_banner", "-version"], { timeoutMs: 10_000 });
    return { name: cmd, status: "ok", detail: stdout.split("\n")[0] ?? "" };
  } catch (err) {
    return { name: cmd, status: "fail", detail: `${(err as Error).message} — install with: sudo apt install ffmpeg` };
  }
}

export async function doctor(): Promise<boolean> {
  const checks: Check[] = [];

  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 18);
  checks.push({ name: "node", status: nodeOk ? "ok" : "fail", detail: `v${process.versions.node}${nodeOk ? "" : " (need >= 22.18 to run .ts directly)"}` });

  const ff = await tool(FFMPEG);
  checks.push(ff, await tool(FFPROBE));

  if (ff.status === "ok") {
    const filters = (await run(FFMPEG, ["-hide_banner", "-filters"], { timeoutMs: 10_000 })).stdout;
    const missing = REQUIRED_FILTERS.filter((f) => !new RegExp(`\\s${f}\\s`).test(filters));
    checks.push({ name: "ffmpeg filters", status: missing.length ? "fail" : "ok", detail: missing.length ? `missing: ${missing.join(", ")}` : REQUIRED_FILTERS.join(", ") });

    const encoders = (await run(FFMPEG, ["-hide_banner", "-encoders"], { timeoutMs: 10_000 })).stdout;
    const missingEnc = REQUIRED_ENCODERS.filter((e) => !new RegExp(`\\s${e}\\s`).test(encoders));
    checks.push({ name: "ffmpeg encoders", status: missingEnc.length ? "fail" : "ok", detail: missingEnc.length ? `missing: ${missingEnc.join(", ")}` : REQUIRED_ENCODERS.join(", ") });

    // Listing h264_qsv doesn't prove the GPU works, so encode a few frames.
    let qsv: Check = { name: "Intel Quick Sync", status: "warn", detail: "not available — rendering uses libx264 (CPU)" };
    if (/\sh264_qsv\s/.test(encoders)) {
      try {
        await run(FFMPEG, ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=s=320x240:d=0.2", "-c:v", "h264_qsv", "-f", "null", "-"], { timeoutMs: 20_000 });
        qsv = { name: "Intel Quick Sync", status: "ok", detail: "h264_qsv works — use --encoder qsv for faster final encodes" };
      } catch {
        qsv.detail = "h264_qsv is built in but failed to encode (driver missing? try: sudo apt install intel-media-va-driver-non-free) — using libx264";
      }
    }
    checks.push(qsv);
  }

  const missingFonts: string[] = [];
  for (const f of FONT_FILES) if (!(await exists(path.join(FONTS_DIR, f)))) missingFonts.push(f);
  checks.push({ name: "fonts", status: missingFonts.length ? "fail" : "ok", detail: missingFonts.length ? `missing in assets/fonts: ${missingFonts.join(", ")}` : "Noto Sans bundled" });

  const piperOk = await exists(path.join(PIPER_DIR, "piper"));
  const voices: string[] = [];
  for (const v of VOICES) if (await exists(path.join(VOICES_DIR, `${v.id}.onnx`))) voices.push(v.id);
  checks.push({
    name: "TTS (piper)",
    status: piperOk && voices.length ? "ok" : "warn",
    detail: !piperOk
      ? "not installed — run: bash scripts/setup-tts.sh (until then use --engine dummy)"
      : voices.length
        ? `${voices.length} voice(s): ${voices.join(", ")}${voices.includes(DEFAULT_VOICE) ? "" : ` — default ${DEFAULT_VOICE} missing`}`
        : "no voices installed — run: bash scripts/setup-tts.sh",
  });

  try {
    await ollama().check();
    checks.push({ name: "LLM (ollama)", status: "ok", detail: `${OLLAMA_HOST}, model ${DEFAULT_OLLAMA_MODEL} ready` });
  } catch (err) {
    checks.push({ name: "LLM (ollama)", status: "warn", detail: `${(err as Error).message} — needed only for "script"` });
  }

  // A real search proves a key works; listing it as "set" would not.
  const photoKeys: [string, string, (key: string) => ImageSource][] = [["PIXABAY_API_KEY", "pixabay", pixabay], ["PEXELS_API_KEY", "pexels", pexels]];
  let anyKey = false;
  for (const [env, name, make] of photoKeys) {
    const key = process.env[env]?.trim();
    if (!key) continue;
    anyKey = true;
    try {
      const found = await make(key).search("sleep", { orientation: "landscape" });
      checks.push({ name: `photos (${name})`, status: found.length ? "ok" : "warn", detail: found.length ? `key works (${found.length} results for a test search)` : "key accepted but the test search found nothing" });
    } catch (err) {
      checks.push({ name: `photos (${name})`, status: "warn", detail: `${(err as Error).message}: ${env} in .env` });
    }
  }
  if (!anyKey) checks.push({ name: "photos", status: "warn", detail: "no PIXABAY_API_KEY in .env — using Openverse only (slower, weaker photos)" });

  checks.push(
    (await sdTurbo())
      ? { name: "image generator", status: "ok", detail: "SD-Turbo installed — try: npm run wata -- imagine \"a cozy bedroom at night\"" }
      : { name: "image generator", status: "warn", detail: "not installed — run: bash scripts/setup-imagegen.sh (scenes without a photo use a gradient)" },
  );

  const st = await fs.statfs(ROOT);
  const freeGb = (st.bavail * st.bsize) / 1024 ** 3;
  checks.push({ name: "disk", status: freeGb < 2 ? "fail" : freeGb < 10 ? "warn" : "ok", detail: `${freeGb.toFixed(1)} GB free` });

  const memGb = os.freemem() / 1024 ** 3;
  checks.push({ name: "memory", status: memGb < 1.5 ? "warn" : "ok", detail: `${memGb.toFixed(1)} of ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB available${memGb < 1.5 ? " — close other apps before rendering" : ""}` });

  const icon: Record<Status, string> = { ok: "✔", warn: "⚠", fail: "✘" };
  for (const c of checks) console.log(`${icon[c.status]} ${c.name.padEnd(17)} ${c.detail}`);
  const ok = !checks.some((c) => c.status === "fail");
  console.log(ok ? "\nReady to render." : "\nFix the ✘ items above before rendering.");
  return ok;
}
