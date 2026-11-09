#!/usr/bin/env bash
# English voices for the English versions of the videos: Kokoro-82M (Apache-2.0), run on the
# CPU with kokoro-onnx (MIT). A small venv of its own in vendor/kokoro (~400 MB in all).
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=vendor/kokoro
REL=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p "$DIR"
[[ -x "$DIR/venv/bin/python" ]] || python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q "kokoro-onnx==0.6.1" soundfile
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [[ -f "$DIR/$f" ]] || curl -fSL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$DIR/$f.part" "$REL/$f" && { [[ -f "$DIR/$f" ]] || mv "$DIR/$f.part" "$DIR/$f"; }
done
"$DIR/venv/bin/python" - "$DIR" <<'PY'
import sys, soundfile as sf
from kokoro_onnx import Kokoro
d = sys.argv[1]
k = Kokoro(f"{d}/kokoro-v1.0.onnx", f"{d}/voices-v1.0.bin")
for v in ["af_heart", "am_michael", "bf_emma", "bm_george"]:
    audio, sr = k.create("Once upon a time, in the land of Van Lang, there lived a little boy named Giong.", voice=v, speed=1.0, lang="en-us" if v[0] == "a" else "en-gb")
    sf.write(f"{d}/sample-{v}.wav", audio, sr)
print("voices:", len(k.get_voices()), "→", ", ".join(k.get_voices()[:12]), "…")
PY
echo "✔ kokoro ready"
