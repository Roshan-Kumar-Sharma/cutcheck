import { describe, expect, it } from 'vitest';
import { check } from '../src/rules/checks/CB-AUD-001.js';
import type { EditBundle, RuleDef, ToolRun } from '../src/types.js';

const run: ToolRun = { tool: 'test', toolVersion: '0', command: 'n/a', durationMs: 0 };
const rule: RuleDef = {
  id: 'CB-AUD-001', name: 'loudness_integrated_out_of_range', severity: 'S1', applies_to: ['reels', 'shorts'], requires: ['loudness'],
  threshold: { target_lufs: -14, tolerance_lu: 1 },
  source: { citation: 't', measured_on: '2026-09-09', confidence: 'medium' }, rationale: 't',
};
const bundle = (integratedLufs?: number): EditBundle => ({
  target: 'reels',
  createdAt: '2026-09-15T00:00:00Z',
  media: {
    path: 'x.mp4', sha256: '0', container: 'mp4', durationSec: 4, probe: run,
    measures: integratedLufs === undefined ? {} : { loudness: { integratedLufs, loudnessRangeLu: 0, truePeakDbtp: -5, run } },
  },
});

describe('CB-AUD-001 loudness_integrated_out_of_range', () => {
  it('passes at the target', () => expect(check(bundle(-14), rule).status).toBe('pass'));
  it('passes at the tolerance boundary (inclusive)', () => {
    expect(check(bundle(-13), rule).status).toBe('pass');
    expect(check(bundle(-15), rule).status).toBe('pass');
  });
  it('fails just outside the boundary, both directions', () => {
    expect(check(bundle(-12.9), rule)).toMatchObject({ status: 'fail', message: expect.stringContaining('hot') });
    expect(check(bundle(-15.1), rule)).toMatchObject({ status: 'fail', message: expect.stringContaining('quiet') });
  });
  it('fails on digital silence rather than treating -Infinity as "very quiet but fine"', () => {
    expect(check(bundle(-Infinity), rule)).toMatchObject({ status: 'fail', measured: { integrated_lufs: null } });
  });
  it('reports skipped — never pass — when the measurement is absent', () => {
    expect(check(bundle(undefined), rule).status).toBe('skipped');
  });
  it('rejects a malformed threshold loudly', () => {
    expect(() => check(bundle(-14), { ...rule, threshold: { target_lufs: 'loud' } })).toThrow(/target_lufs/);
  });
});
