#!/usr/bin/env bash
# Download Piper (offline TTS) and the Vietnamese voices into vendor/, verifying SHA-256.
# Usage: bash scripts/setup-tts.sh [voice-id ...]   (default: all three Vietnamese voices)
set -euo pipefail
cd "$(dirname "$0")/.."

PIPER_URL="https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
PIPER_SHA="a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992"
VOICE_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN"
declare -A VOICE_PATH=(
  [vi_VN-vais1000-medium]="vais1000/medium"
  [vi_VN-25hours_single-low]="25hours_single/low"
  [vi_VN-vivos-x_low]="vivos/x_low"
)
declare -A VOICE_SHA=(
  [vi_VN-vais1000-medium]="ec7c89e2c85f4d1edc24b6120c18aaf1bda614f06b511567eb9c7c0de15e2dab"
  [vi_VN-25hours_single-low]="266945c4a80cb3301450c8ba6fcf6ba3542c56cf952a08a8ff3d2d4ff0ab5609"
  [vi_VN-vivos-x_low]="6ab13374eb0862021a545befe7727aef59e16117f1c075aa9e0362237ecc98ae"
)

verify() { echo "$2  $1" | sha256sum --check --status || { echo "✘ checksum mismatch: $1" >&2; rm -f "$1"; exit 1; }; }

mkdir -p vendor/voices
if [[ ! -x vendor/piper/piper ]]; then
  tarball="vendor/piper_linux_x86_64.tar.gz"
  [[ -f "$tarball" ]] || curl -fSL -o "$tarball" "$PIPER_URL"
  verify "$tarball" "$PIPER_SHA"
  tar -xzf "$tarball" -C vendor
  rm -f "$tarball"
  echo "✔ piper installed in vendor/piper"
fi

voices=("$@")
[[ ${#voices[@]} -gt 0 ]] || voices=("${!VOICE_PATH[@]}")
for id in "${voices[@]}"; do
  [[ -n "${VOICE_PATH[$id]:-}" ]] || { echo "✘ unknown voice $id" >&2; exit 1; }
  model="vendor/voices/$id.onnx"
  if [[ ! -f "$model" ]]; then
    curl -fSL -o "$model" "$VOICE_BASE/${VOICE_PATH[$id]}/$id.onnx"
  fi
  verify "$model" "${VOICE_SHA[$id]}"
  [[ -f "$model.json" ]] || curl -fSL -o "$model.json" "$VOICE_BASE/${VOICE_PATH[$id]}/$id.onnx.json"
  echo "✔ voice $id"
done

echo
echo "Test: npm run wata -- say \"Xin chào, đây là giọng đọc thử.\""
