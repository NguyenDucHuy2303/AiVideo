#!/usr/bin/env bash
# Two newer image models for the backdrop painter, both Apache-2.0 (commercial use, no
# registration), run by the same stable-diffusion.cpp as SD-Turbo:
#   FLUX.2 [klein] 4B   vendor/sd/models/flux2-klein/   (~7 GB)
#   Z-Image Turbo 6B    vendor/sd/models/z-image/       (~6.7 GB)
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
get "$HF/leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q8_0.gguf" "$K/flux-2-klein-4b-Q8_0.gguf"
get "$HF/black-forest-labs/FLUX.2-small-decoder/resolve/main/full_encoder_small_decoder.safetensors" "$K/vae.safetensors"
get "$HF/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf" "$K/Qwen3-4B-Q4_K_M.gguf"
Z=vendor/sd/models/z-image
get "$HF/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q4_K.gguf" "$Z/z_image_turbo-Q4_K.gguf"
get "$HF/Comfy-Org/Z-Image-Turbo/resolve/main/split_files/vae/ae.safetensors" "$Z/ae.safetensors"
get "$HF/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf" "$Z/Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
echo "✔ models ready"
