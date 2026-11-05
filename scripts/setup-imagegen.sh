#!/usr/bin/env bash
# Download stable-diffusion.cpp (CPU build) and the SD-Turbo model into vendor/sd, verifying SHA-256.
# ~2 GB. Usage: bash scripts/setup-imagegen.sh
#
# SD-Turbo is under the Stability AI Community License: free for research and personal use,
# and for commercial use under USD 1M annual revenue after a free registration at
# https://stability.ai/community-license. See vendor/sd/LICENSE-sd-turbo.md after install.
set -euo pipefail
cd "$(dirname "$0")/.."

SD_TAG="master-1050-58bb3c1"
SD_ZIP="sd-master-58bb3c1-bin-Linux-Ubuntu-26.04-x86_64.zip"
SD_SHA="35ba046d8da9d07f7d4ce4c9864594a291a994a82ce93fbae1222ac4709ce8f1"
MODEL_URL="https://huggingface.co/Green-Sky/SD-Turbo-GGUF/resolve/19a31586d02d64a73b4419bc193b3ecfaf38e1f0/sd_turbo-f16-q8_0.gguf"
MODEL_SHA="d50be7655f0a554cf8041c145d88b210bd5f3c545423119dee62ae08cae51580"
LICENSE_URL="https://huggingface.co/stabilityai/sd-turbo/raw/main/LICENSE.md"

verify() { echo "$2  $1" | sha256sum --check --status || { echo "✘ checksum mismatch: $1" >&2; rm -f "$1"; exit 1; }; }

mkdir -p vendor/sd/models
if [[ -z "$(find vendor/sd/bin -name sd-cli -type f 2>/dev/null | head -1)" ]]; then
  zip="vendor/sd/$SD_ZIP"
  [[ -f "$zip" ]] || curl -fSL -o "$zip" "https://github.com/leejet/stable-diffusion.cpp/releases/download/$SD_TAG/$SD_ZIP"
  verify "$zip" "$SD_SHA"
  rm -rf vendor/sd/bin && mkdir -p vendor/sd/bin
  unzip -q "$zip" -d vendor/sd/bin
  rm -f "$zip"
  cli="$(find vendor/sd/bin -name sd-cli -type f | head -1)"
  [[ -n "$cli" ]] || { echo "✘ sd-cli not found in $SD_ZIP" >&2; exit 1; }
  chmod +x "$cli"
  echo "✔ stable-diffusion.cpp installed: $cli"
fi

model="vendor/sd/models/sd_turbo-f16-q8_0.gguf"
if [[ ! -f "$model" ]]; then
  # Resumes a partial download (re-run the script after a dropped connection).
  curl -fSL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$model.part" "$MODEL_URL"
  mv "$model.part" "$model"
fi
verify "$model" "$MODEL_SHA"
[[ -f vendor/sd/LICENSE-sd-turbo.md ]] || curl -fsSL -o vendor/sd/LICENSE-sd-turbo.md "$LICENSE_URL"
echo "✔ model sd_turbo-f16-q8_0.gguf"

echo
echo "Test: npm run wata -- imagine \"a cozy bedroom at night, soft warm lamp light\" -o thu-anh.png"
