#!/bin/bash
# Re-encode bundled videos small enough for the repo / CDN (H.264, no audio, faststart).
set -e
cd "$(dirname "$0")/../apps/web/public"
for f in landing/hero.mp4 studio/tour/360.mp4; do
  [ -f "$f" ] || continue
  ffmpeg -v error -y -i "$f" -an -vf "scale='min(1280,iw)':-2" -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart "${f%.mp4}.tmp.mp4"
  mv "${f%.mp4}.tmp.mp4" "$f"
  ls -la "$f"
done
