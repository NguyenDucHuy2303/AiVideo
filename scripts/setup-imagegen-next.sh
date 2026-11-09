#!/usr/bin/env bash
# The backdrop painter: FLUX.2 [klein] 4B, Apache-2.0 (commercial use, no registration), run by
# the same stable-diffusion.cpp as SD-Turbo. Q4_K_M + small decoder + Qwen3-4B, ~5.3 GB on disk,
# ~4.8 GB RAM with --vae-tiling --mmap. (Q8 was OOM-killed at decode; Z-Image Turbo was tried
# and was slower and weaker at Đông Hồ style.)
#   vendor/sd/models/flux2-klein/
# Resumable: run it again after a broken download.
set -euo pipefail
cd "$(dirname "$0")/.."
HF=https://huggingface.co
get() { # url file
  local url=$1 out=$2
  [[ -f "$out" ]] && { echo "✔ $out"; return; }
  mkdir -p "$(dirname "$out")"
  echo "↓ $out"
  curl -fSL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$out.part" "$url"
  mv "$out.part" "$out"
}
K=vendor/sd/models/flux2-klein
get "$HF/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q4_K_M.gguf" "$K/flux-2-klein-4b-Q4_K_M.gguf"
get "$HF/black-forest-labs/FLUX.2-small-decoder/resolve/main/full_encoder_small_decoder.safetensors" "$K/vae.safetensors"
get "$HF/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf" "$K/Qwen3-4B-Q4_K_M.gguf"
echo "✔ models ready"
