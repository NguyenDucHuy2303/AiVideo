#!/usr/bin/env bash
# VieNeu-TTS v3 Turbo: a natural, expressive Vietnamese voice that runs on the CPU.
# Model and code Apache-2.0; the bundled preset voices may be used in commercial, monetized
# content (model card: huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo).
# Installs into vendor/vieneu (private Python env), downloads the model, and reads one line
# of Thánh Gióng in several voices into vendor/vieneu/samples/ so you can choose one.
# Usage: bash scripts/setup-vieneu.sh
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="3.8.3"
dir="vendor/vieneu"
mkdir -p "$dir/samples"

if [[ ! -x "$dir/venv/bin/python" ]]; then
  if command -v uv >/dev/null; then uv venv --python 3.12 "$dir/venv"; else python3 -m venv "$dir/venv"; fi
fi
if command -v uv >/dev/null; then
  uv pip install --python "$dir/venv/bin/python" "vieneu==$VERSION"
else
  "$dir/venv/bin/pip" install --disable-pip-version-check "vieneu==$VERSION" || {
    echo "✘ install failed with $(python3 --version). Install uv (curl -LsSf https://astral.sh/uv/install.sh | sh) and run this again: it will use Python 3.12." >&2
    exit 1
  }
fi
echo "$VERSION" > "$dir/VERSION"
echo "✔ vieneu $VERSION"

# Download the model, then turn the Hugging Face cache symlinks into real files: onnxruntime
# ≥ 1.2x refuses external weight files that resolve outside the model's own folder.
"$dir/venv/bin/python" -c "from vieneu import Vieneu; Vieneu()" >/dev/null 2>&1 || true
hub="${HF_HUB_CACHE:-${HF_HOME:-$HOME/.cache/huggingface}/hub}"
for repo in "$hub"/models--pnnbao-ump--VieNeu-TTS-v3-Turbo "$hub"/models--OpenMOSS-Team--MOSS-Audio-Tokenizer-Nano-ONNX; do
  [[ -d "$repo/snapshots" ]] || continue
  find "$repo/snapshots" -type l | while read -r f; do t="$(readlink -f "$f")"; mv "$t" "$f.tmp" && mv "$f.tmp" "$f"; done
done

# Read the same line in each voice.
"$dir/venv/bin/python" - "$dir/samples" <<'PY'
import sys, time
from vieneu import Vieneu
out = sys.argv[1]
tts = Vieneu()
line = "Cậu bé Gióng vươn vai một cái, bỗng chốc trở thành một tráng sĩ khổng lồ, oai phong lẫm liệt."
voices = ["Ngọc Huyền", "Thùy Dung", "Mai Anh", "Ngọc Linh", "Đoan Trang", "Hải Đăng", "Thiện Minh", "Minh Đức", "Quốc Tuấn", "Thanh Bình"]
for v in voices:
    t = time.time()
    try:
        tts.save(tts.infer(line, voice=v), f"{out}/{v}.wav")
        print(f"  {v}: {time.time() - t:.1f}s", flush=True)
    except Exception as e:
        print(f"  {v}: failed ({e})", flush=True)
PY
echo "✔ samples in $dir/samples/ — listen and tell Claude which voice you like"
