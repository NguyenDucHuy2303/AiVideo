#!/usr/bin/env bash
# English voices for the English versions of the videos: Kokoro-82M (Apache-2.0), on the CPU
# with kokoro-onnx (MIT). kokoro-onnx needs Python < 3.14, so it gets its own Python 3.12
# (installed by uv into vendor/kokoro/python; the system Python is not touched). ~500 MB.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=vendor/kokoro
REL=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p "$DIR"
[[ -x "$DIR/tools/bin/uv" ]] || { python3 -m venv "$DIR/tools"; "$DIR/tools/bin/pip" install -q uv; }
export UV_PYTHON_INSTALL_DIR="$PWD/$DIR/python"
"$DIR/tools/bin/uv" python install 3.12
[[ -x "$DIR/venv/bin/python" ]] || "$DIR/tools/bin/uv" venv --python 3.12 "$DIR/venv"
VIRTUAL_ENV="$PWD/$DIR/venv" "$DIR/tools/bin/uv" pip install -q "kokoro-onnx==0.4.9" soundfile
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [[ ! -f "$DIR/$f" ]]; then
    curl -fSL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$DIR/$f.part" "$REL/$f"
    mv "$DIR/$f.part" "$DIR/$f"
  fi
done
"$DIR/venv/bin/python" - "$DIR" <<'PY'
import sys, soundfile as sf
from kokoro_onnx import Kokoro
d = sys.argv[1]
k = Kokoro(f"{d}/kokoro-v1.0.onnx", f"{d}/voices-v1.0.bin")
for v in ["af_heart", "am_michael", "bf_emma", "bm_george"]:
    audio, sr = k.create("Once upon a time, in the land of Van Lang, there lived a little boy named Giong.", voice=v, speed=1.0, lang="en-us" if v[0] == "a" else "en-gb")
    sf.write(f"{d}/sample-{v}.wav", audio, sr)
print("voices:", len(k.get_voices()), "→", ", ".join(k.get_voices()))
PY
echo "✔ kokoro ready"
