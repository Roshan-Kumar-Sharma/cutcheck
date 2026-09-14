#!/usr/bin/env bash
# Regenerates the synthetic test clips deterministically. 4s, 1080x1920, colour bars + 440Hz sine.
# ok.mp4  -> ~-13.8 LUFS integrated (inside -14 ±1)     -> CB-AUD-001 passes
# hot.mp4 -> ~-7.8  LUFS integrated, true peak ~-1.6    -> CB-AUD-001 fails, true peak still under -1.0
set -euo pipefail
cd "$(dirname "$0")/../test/fixtures"
gen() {
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=duration=4:size=1080x1920:rate=30" \
    -f lavfi -i "sine=frequency=440:duration=4:sample_rate=48000" \
    -af "volume=$2" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "$1"
}
gen ok.mp4  "+8dB"
gen hot.mp4 "+14dB"
for f in ok hot; do
  ffmpeg -hide_banner -nostats -i "$f.mp4" -filter_complex "ebur128=peak=true" -f null - 2> "$f.ebur128.stderr.txt"
  printf "%-4s  I=%s LUFS  TP=%s dBTP\n" "$f" \
    "$(grep -E '^\s+I:' "$f.ebur128.stderr.txt" | awk '{print $2}')" \
    "$(grep -E '^\s+Peak:' "$f.ebur128.stderr.txt" | awk '{print $2}')"
done
