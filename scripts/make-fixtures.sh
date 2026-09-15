#!/usr/bin/env bash
# Regenerates the synthetic test clips deterministically. 4s, 1080x1920, colour bars + a tone.
#
# ok.mp4      -> ~-13.8 LUFS integrated, true peak ~-7.6 dBTP  -> CB-AUD-001 passes, CB-AUD-002 passes
# hot.mp4     -> ~-7.8  LUFS integrated, true peak ~-1.6 dBTP  -> CB-AUD-001 fails,  CB-AUD-002 passes
# clipped.mp4 -> a hard-clipped sine, ~-0.6 LUFS integrated, true peak ~+1.6 dBTP
#                -> CB-AUD-001 fails (13 LU hot), CB-AUD-002 fails (over the -1 dBTP ceiling)
set -euo pipefail
cd "$(dirname "$0")/../test/fixtures"

gen() {  # $1 = output file, $2 = audio lavfi source
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "testsrc2=duration=4:size=1080x1920:rate=30" \
    -f lavfi -i "$2" \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "$1"
}
gen ok.mp4      "sine=frequency=440:duration=4:sample_rate=48000,volume=+8dB"
gen hot.mp4     "sine=frequency=440:duration=4:sample_rate=48000,volume=+14dB"
gen clipped.mp4 "aevalsrc='max(-0.99\,min(0.99\,4*sin(2*PI*997*t)))':s=48000:d=4"

# These args must match src/ffmpeg/ebur128.ts exactly — the captured stderr IS the parser test.
for f in ok hot clipped; do
  ffmpeg -hide_banner -nostats -i "$f.mp4" -vn -filter_complex "ebur128=peak=true" -f null - 2> "$f.ebur128.stderr.txt"
  printf "%-8s  I=%s LUFS  TP=%s dBTP\n" "$f" \
    "$(grep -E '^\s+I:' "$f.ebur128.stderr.txt" | awk '{print $2}')" \
    "$(sed -n '/True peak:/,$p' "$f.ebur128.stderr.txt" | grep -E '^\s+Peak:' | awk '{print $2}')"
done

# Hostile fixture. With peak=sample+true, ebur128 prints a "Sample peak:" section BEFORE "True peak:"
# and labels both value lines "Peak:", so a parser that grabs the first "Peak:" silently stores the wrong
# number in a field named truePeakDbtp. This capture pins parseEbur128Summary to the True peak heading.
# cutcheck itself never invokes ebur128 this way; the fixture exists only to hold the parser honest.
#
# The two readings here differ by only ~0.1 dB, which is enough for an exact-value test to tell them
# apart but is not the whole story: after a lossy encode the decoded samples already carry most of the
# inter-sample content, so sample and true peak converge. Large divergence lives in the PCM domain
# before encoding (a clipped sine reads -0.1 dBFS sample / +0.3 dBTP true as raw float). Don't "fix"
# this fixture by hunting for a bigger gap through an AAC file — there isn't one.
ffmpeg -hide_banner -nostats -i clipped.mp4 -vn -filter_complex "ebur128=peak=sample+true" -f null - \
  2> clipped.sample-and-true.ebur128.stderr.txt
printf "clipped (sample+true capture)  sample=%s  true=%s\n" \
  "$(sed -n '/Sample peak:/,/True peak:/p' clipped.sample-and-true.ebur128.stderr.txt | grep -E '^\s+Peak:' | awk '{print $2}')" \
  "$(sed -n '/True peak:/,$p'  clipped.sample-and-true.ebur128.stderr.txt | grep -E '^\s+Peak:' | awk '{print $2}')"
