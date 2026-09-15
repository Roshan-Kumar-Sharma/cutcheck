import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBlackdetect } from '../src/ffmpeg/blackdetect.js';

// REAL ffmpeg 8.1.2 stderr, captured by scripts/make-fixtures.sh. Not hand-typed.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.blackdetect.stderr.txt`, import.meta.url), 'utf8');

describe('parseBlackdetect', () => {
  it('parses a black run at the head', () => {
    expect(parseBlackdetect(fixture('blackhead'))).toEqual([
      { startSec: 0, endSec: 0.133333, durationSec: 0.133333 },
    ]);
  });

  it('parses a black run that reaches end of file', () => {
    // black_end is the LAST BLACK FRAME's timestamp, not the file duration — a tail run reads one frame
    // short. blacktail.mp4 is 2.2s long and ends black from 2.0.
    expect(parseBlackdetect(fixture('blacktail'))).toEqual([
      { startSec: 2, endSec: 2.166667, durationSec: 0.166667 },
    ]);
  });

  it('parses a mid-timeline run', () => {
    expect(parseBlackdetect(fixture('blackmid'))).toEqual([
      { startSec: 1, endSec: 1.333333, durationSec: 0.333333 },
    ]);
  });

  it('returns an empty array when the filter ran and found nothing', () => {
    // A real measurement meaning "no black" — the caller must not confuse it with an absent measurement.
    expect(parseBlackdetect(fixture('ok'))).toEqual([]);
  });

  it('finds every run when there are several', () => {
    const two = `${fixture('blackhead')}\n${fixture('blacktail')}`;
    expect(parseBlackdetect(two).map((s) => s.startSec)).toEqual([0, 2]);
  });

  it('is not fooled by the filter index moving as the chain grows', () => {
    // The video pass composes its chain from whichever measurements are needed, so blackdetect is
    // Parsed_blackdetect_0 alone but Parsed_blackdetect_1 behind another filter.
    const shifted = fixture('blackhead').replace('Parsed_blackdetect_0', 'Parsed_blackdetect_3');
    expect(parseBlackdetect(shifted)).toEqual(parseBlackdetect(fixture('blackhead')));
  });
});
