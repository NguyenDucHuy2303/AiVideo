#!/usr/bin/env bash
# Level-1 "paper theatre" look: checks Blender, installs a depth model (Depth Anything V2
# Small, Apache-2.0, ~100 MB) with its ONNX runtime in a private Python venv under vendor/depth.
# Usage: bash scripts/setup-3d.sh
set -euo pipefail
cd "$(dirname "$0")/.."

command -v blender >/dev/null || { echo "✘ Blender not found: sudo snap install blender --classic" >&2; exit 1; }
echo "✔ $(blender --version 2>/dev/null | head -1)"

MODEL_URL="https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx"
MODEL_SHA="afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c"
dir="vendor/depth"
mkdir -p "$dir"

if [[ ! -x "$dir/venv/bin/python" ]]; then
  python3 -m venv "$dir/venv"
fi
"$dir/venv/bin/pip" install --quiet --disable-pip-version-check "onnxruntime>=1.20,<2" "numpy>=2,<3"
echo "✔ onnxruntime $("$dir/venv/bin/python" -c 'import onnxruntime; print(onnxruntime.__version__)')"

model="$dir/depth-anything-v2-small.onnx"
if [[ ! -f "$model" ]]; then
  curl -fSL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$model.part" "$MODEL_URL"
  mv "$model.part" "$model"
fi
echo "$MODEL_SHA  $model" | sha256sum --check --status || { echo "✘ checksum mismatch: $model" >&2; rm -f "$model"; exit 1; }
echo "✔ depth model (Depth Anything V2 Small, Apache-2.0)"
