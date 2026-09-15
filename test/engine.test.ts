import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/rules/engine.js';
import type { EditBundle, RuleDef, Severity, ToolRun } from '../src/types.js';

const probeRun: ToolRun = { tool: 'ffprobe', toolVersion: '0', command: 'ffprobe x.mp4', durationMs: 0 };
const measureRun: ToolRun = { tool: 'ffmpeg:ebur128', toolVersion: '0', command: 'ffmpeg -i x.mp4 …', durationMs: 0 };

// Every synthetic rule reuses the CB-AUD-001 id: the engine resolves a check by id and throws on an
// unknown one, so a made-up id would test the wrong failure. Severity and `requires` are what vary here.
const rule = (severity: Severity, requires: RuleDef['requires']): RuleDef => ({
  id: 'CB-AUD-001',
  name: 'loudness_integrated_out_of_range',
  severity,
  applies_to: ['reels'],
  requires,
  threshold: { target_lufs: -14, tolerance_lu: 1 },
  source: { citation: 'c', measured_on: '2026-09-09', confidence: 'medium' },
  rationale: 'r',
});

const bundle = (integratedLufs?: number): EditBundle => ({
  target: 'reels',
  createdAt: '2026-09-15T00:00:00Z',
  media: {
    path: 'x.mp4', sha256: '0', container: 'mp4', durationSec: 4, probe: probeRun,
    measures: integratedLufs === undefined ? {} : { loudness: { integratedLufs, loudnessRangeLu: 0, truePeakDbtp: -5, run: measureRun } },
  },
});

const verdictOf = (b: EditBundle, rules: RuleDef[]) => evaluate(b, rules, performance.now());

describe('verdict', () => {
  it('ships when the S1 rule passes', () => {
    expect(verdictOf(bundle(-14), [rule('S1', ['loudness'])]).verdict).toBe('ship');
  });

  it('carries the measurement run in provenance when the rule did run', () => {
    const f = verdictOf(bundle(-14), [rule('S1', ['loudness'])]).findings[0]!;
    expect(f.provenance.runs.map((x) => x.tool)).toEqual(['ffprobe', 'ffmpeg:ebur128']);
  });

  it('blocks on an S1 failure', () => {
    expect(verdictOf(bundle(-8), [rule('S1', ['loudness'])]).verdict).toBe('block');
  });

  it('blocks when an S1 rule could not run — unverified is not the same as safe', () => {
    const r = verdictOf(bundle(undefined), [rule('S1', ['loudness'])]);
    expect(r.findings[0]!.status).toBe('skipped');
    expect(r.verdict).toBe('block');
    expect(r.summary).toMatchObject({ s1Fail: 0, s1Skipped: 1, pass: 0 });
  });

  it('does not block when a merely advisory S2 rule could not run', () => {
    const r = verdictOf(bundle(undefined), [rule('S2', ['loudness'])]);
    expect(r.findings[0]!.status).toBe('skipped');
    expect(r.summary).toMatchObject({ s1Skipped: 0, skipped: 1 });
    expect(r.verdict).toBe('ship');
  });

  it('never lets a skipped S1 be counted as a pass', () => {
    const r = verdictOf(bundle(undefined), [rule('S1', ['loudness'])]);
    expect(r.summary.pass).toBe(0);
    expect(r.findings.every((f) => f.status !== 'pass')).toBe(true);
  });

  it('keeps provenance on a skipped finding so the reader can see what was not run', () => {
    const f = verdictOf(bundle(undefined), [rule('S1', ['loudness'])]).findings[0]!;
    // Only the probe ran. The measurement run is absent precisely because it is what did not happen.
    expect(f.provenance.runs.map((x) => x.tool)).toEqual(['ffprobe']);
    expect(f.provenance.source.measured_on).toBe('2026-09-09');
    expect(f.repro).toContain('--only CB-AUD-001');
  });
});
