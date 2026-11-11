#!/usr/bin/env bash
# Pictures for the explainer boards (MIT): Microsoft Fluent Emoji (color + flat, via the
# @iconify-json packages) and Rough.js (hand-drawn look). Into vendor/js (not in git).
set -euo pipefail
cd "$(dirname "$0")/../vendor" && mkdir -p js/icons && cd js
tmp=$(mktemp -d)
for p in @iconify-json/fluent-emoji @iconify-json/fluent-emoji-flat roughjs; do (cd "$tmp" && npm pack --silent "$p" >/dev/null); done
for t in "$tmp"/*.tgz; do mkdir -p "$t.d" && tar -xzf "$t" -C "$t.d"; done
cp "$tmp"/iconify-json-fluent-emoji-[0-9]*.tgz.d/package/icons.json icons/fluent-emoji.json
cp "$tmp"/iconify-json-fluent-emoji-flat-*.tgz.d/package/icons.json icons/fluent-emoji-flat.json
cp "$tmp"/roughjs-*.tgz.d/package/bundled/rough.js rough.js
cp "$tmp"/roughjs-*.tgz.d/package/LICENSE rough.LICENSE
printf 'Fluent Emoji: MIT, (c) Microsoft Corporation, https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE\nRough.js: MIT, see rough.LICENSE\n' > LICENSES.txt
rm -rf "$tmp"
echo "✔ vendor/js: $(ls icons) rough.js"
