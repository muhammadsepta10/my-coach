#!/usr/bin/env bash
# Pecah ilustrasi Canva 1200×600 (kiri = posisi awal, kanan = posisi akhir)
# menjadi public/exercises/<id>-a.webp dan <id>-b.webp.
# Pakai: scripts/split-illustration.sh <id> <file-atau-url-png>
set -euo pipefail
id="$1"; src="$2"
out="$(cd "$(dirname "$0")/.." && pwd)/public/exercises"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if [[ "$src" == http* ]]; then curl -sSfL -o "$tmp/full.png" "$src"; else cp "$src" "$tmp/full.png"; fi
convert "$tmp/full.png" -resize 1200x600! "$tmp/full.png"
for side in a b; do
  off=$([[ $side == a ]] && echo 0 || echo 600)
  convert "$tmp/full.png" -crop 600x600+${off}+0 +repage \
    -resize 480x480 \
    -quality 72 "$out/$id-$side.webp"
done
identify "$out/$id-a.webp" "$out/$id-b.webp"
