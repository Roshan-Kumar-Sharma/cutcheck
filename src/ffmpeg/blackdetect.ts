import type { BlackSegment } from '../types.js';

/** The filter spec for the video pass. `minSec` is the shortest run the filter will report at all. */
export const blackdetectFilter = (minSec: number): string => `blackdetect=d=${minSec}`;

/**
 * Parses blackdetect's log lines out of an ffmpeg stderr stream:
 *
 *   [Parsed_blackdetect_0 @ 0x…] black_start:0 black_end:0.3 black_duration:0.3
 *
 * Anchored on the field names, not on the `Parsed_blackdetect_N` tag: N is the filter's index in the
 * chain, and the video pass builds that chain from whichever measurements the selected rules need, so
 * the index moves. Real captured output lives in test/fixtures/*.blackdetect.stderr.txt.
 *
 * Returns [] when the filter ran and found nothing. That is a measurement — "no black" — and the caller
 * must not confuse it with the measurement being absent.
 */
export function parseBlackdetect(stderr: string): BlackSegment[] {
  const re = /black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g;
  const segments: BlackSegment[] = [];
  for (const m of stderr.matchAll(re)) {
    const startSec = Number(m[1]);
    const endSec = Number(m[2]);
    const durationSec = Number(m[3]);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || !Number.isFinite(durationSec)) {
      throw new Error(`blackdetect: unparseable segment ${JSON.stringify(m[0])}`);
    }
    segments.push({ startSec, endSec, durationSec });
  }
  return segments;
}
