import { describe, expect, it } from 'vitest';
import { check } from '../src/rules/checks/CB-AUD-002.js';
import type { EditBundle, RuleDef, ToolRun } from '../src/types.js';

const run: ToolRun = { tool: 'test', toolVersion: '0', command: 'n/a', durationMs: 0 };
const rule: RuleDef = {
  id: 'CB-AUD-002', name: 'true_peak_over_ceiling', severity: 'S1', applies_to: ['reels', 'shorts'], requires: ['loudness'],
  threshold: { max_true_peak_dbtp: -1.0 },
  source: { citation: 't', measured_on: '2026-09-15', confidence: 'high' }, rationale: 't',
};
const bundle = (truePeakDbtp?: number, integratedLufs = -14): EditBundle => ({
  target: 'reels',
  createdAt: '2026-09-15T00:00:00Z',
  media: {
    path: 'x.mp4', sha256: '0', container: 'mp4', durationSec: 4, probe: run,
    measures: truePeakDbtp === undefined ? {} : { loudness: { integratedLufs, loudnessRangeLu: 0, truePeakDbtp, run } },
  },
});

describe('CB-AUD-002 true_peak_over_ceiling', () => {
  it('passes exactly at the ceiling — R128 says maximum *permitted*', () => {
    expect(check(bundle(-1.0), rule).status).toBe('pass');
  });
  it('passes just inside the ceiling', () => {
    expect(check(bundle(-1.1), rule).status).toBe('pass');
  });
  it('fails just outside the ceiling', () => {
    expect(check(bundle(-0.9), rule)).toMatchObject({ status: 'fail', message: expect.stringContaining('0.1 dB over') });
  });
  it('fails a clipped export and says how far over it is', () => {
    expect(check(bundle(1.6), rule)).toMatchObject({ status: 'fail', message: expect.stringContaining('2.6 dB over') });
  });
  it('honours a tightened ceiling from YAML without a code change', () => {
    const strict = { ...rule, threshold: { max_true_peak_dbtp: -2.0 } };
    expect(check(bundle(-1.5), rule).status).toBe('pass');
    expect(check(bundle(-1.5), strict).status).toBe('fail');
  });
  it('passes digital silence, because CB-AUD-001 owns that defect', () => {
    // Not an oversight: silence has no peak to clip. Failing here too would report one defect under
    // two rule ids and inflate the per-defect counts Phase 2 computes miss rate from.
    expect(check(bundle(-Infinity, -Infinity), rule)).toMatchObject({ status: 'pass', measured: { true_peak_dbtp: null } });
  });
  it('fails an unusable reading rather than letting NaN fall through as a pass', () => {
    // NaN > max is false, so a naive comparison would report `pass` on a number we do not have.
    expect(check(bundle(NaN), rule)).toMatchObject({ status: 'fail', message: expect.stringContaining('unusable') });
  });
  it('reports skipped — never pass — when the measurement is absent', () => {
    expect(check(bundle(undefined), rule).status).toBe('skipped');
  });
  it('rejects a malformed threshold loudly', () => {
    expect(() => check(bundle(-3), { ...rule, threshold: { max_true_peak_dbtp: 'loud' } })).toThrow(/max_true_peak_dbtp/);
    expect(() => check(bundle(-3), { ...rule, threshold: {} })).toThrow(/max_true_peak_dbtp/);
  });
});
