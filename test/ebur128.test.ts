import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEbur128Summary } from '../src/ffmpeg/ebur128.js';

// These fixtures are REAL ffmpeg 8.1.2 stderr, captured by scripts/make-fixtures.sh. Not hand-typed.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.ebur128.stderr.txt`, import.meta.url), 'utf8');

describe('parseEbur128Summary', () => {
  it('parses the compliant fixture', () => {
    expect(parseEbur128Summary(fixture('ok'))).toEqual({ integratedLufs: -13.8, loudnessRangeLu: 0, truePeakDbtp: -7.6 });
  });
  it('parses the hot fixture', () => {
    expect(parseEbur128Summary(fixture('hot'))).toEqual({ integratedLufs: -7.8, loudnessRangeLu: 0, truePeakDbtp: -1.6 });
  });
  it('reads the LAST Summary block, not a per-frame line', () => {
    // Per-frame lines also contain "I:" — the parser must anchor on the Summary block.
    const s = fixture('ok');
    expect(s.indexOf('I:')).toBeLessThan(s.lastIndexOf('Summary:'));
    expect(parseEbur128Summary(s).integratedLufs).toBe(-13.8);
  });
  it('maps -inf to -Infinity (digital silence)', () => {
    const silent = 'Summary:\n\n  Integrated loudness:\n    I:         -inf LUFS\n  Loudness range:\n    LRA:         0.0 LU\n  True peak:\n    Peak:      -inf dBFS\n';
    expect(parseEbur128Summary(silent)).toEqual({ integratedLufs: -Infinity, loudnessRangeLu: 0, truePeakDbtp: -Infinity });
  });
  it('parses the clipped fixture, whose true peak is above 0 dBTP', () => {
    expect(parseEbur128Summary(fixture('clipped'))).toEqual({ integratedLufs: -0.6, loudnessRangeLu: 0, truePeakDbtp: 1.6 });
  });

  it('reads the True peak section, not the Sample peak section that prints before it', () => {
    // Real capture with peak=sample+true: sample peak 1.5 dBFS, true peak 1.6 dBTP, both on a line
    // labelled "Peak:". A parser anchored on the first match would return 1.5 as the true peak.
    const s = readFileSync(new URL('./fixtures/clipped.sample-and-true.ebur128.stderr.txt', import.meta.url), 'utf8');
    expect(s.indexOf('Sample peak:')).toBeLessThan(s.indexOf('True peak:'));
    expect(parseEbur128Summary(s).truePeakDbtp).toBe(1.6);
  });

  it('refuses to guess when there is no True peak section at all', () => {
    const sampleOnly = 'Summary:\n\n  Integrated loudness:\n    I:  -7.8 LUFS\n  Loudness range:\n    LRA:  0.0 LU\n  Sample peak:\n    Peak:  -1.6 dBFS\n';
    expect(() => parseEbur128Summary(sampleOnly)).toThrow(/True peak/);
  });

  it('throws a clear error if the Summary block is missing', () => {
    expect(() => parseEbur128Summary('frame=1 fps=0')).toThrow(/no Summary block/);
  });
});
