import { describe, expect, it } from 'vitest';
import { renderText } from '../src/report.js';
import type { Finding, FindingStatus, Report, Severity } from '../src/types.js';

const run = { tool: 'ffprobe', toolVersion: '0', command: 'ffprobe x.mp4', durationMs: 1 };

const finding = (severity: Severity, status: FindingStatus, ruleId = 'CB-AUD-001'): Finding => ({
  ruleId,
  ruleName: 'loudness_integrated_out_of_range',
  severity,
  status,
  message: 'm',
  measured: {},
  threshold: {},
  provenance: {
    source: { citation: 'Practical short-form convention. Rest of sentence.', measured_on: '2026-09-09', confidence: 'medium' },
    runs: [run],
    cutcheckVersion: '0.0.1',
    evaluatedAt: '2026-09-15T00:00:00Z',
  },
  repro: 'cutcheck run "x.mp4" --target reels --only CB-AUD-001',
});

const report = (findings: Finding[]): Report => ({
  cutcheckVersion: '0.0.1',
  target: 'reels',
  input: { path: 'x.mp4', sha256: 'a'.repeat(64), durationSec: 4 },
  verdict: findings.some((f) => f.severity === 'S1' && f.status !== 'pass') ? 'block' : 'ship',
  summary: {
    s1Fail: findings.filter((f) => f.severity === 'S1' && f.status === 'fail').length,
    s1Skipped: findings.filter((f) => f.severity === 'S1' && f.status === 'skipped').length,
    s2Fail: findings.filter((f) => f.severity === 'S2' && f.status === 'fail').length,
    pass: findings.filter((f) => f.status === 'pass').length,
    skipped: findings.filter((f) => f.status === 'skipped').length,
  },
  findings,
  timing: { totalMs: 10 },
  evaluatedAt: '2026-09-15T00:00:00Z',
});

describe('renderText', () => {
  it('says why a block happened when a rule failed', () => {
    expect(renderText(report([finding('S1', 'fail')]))).toContain('VERDICT: BLOCK — do not publish');
  });

  it('says a block was caused by an unverified check, not a defect', () => {
    const out = renderText(report([finding('S1', 'skipped')]));
    expect(out).toContain('VERDICT: BLOCK — an S1 check could not run — unverified is not the same as safe');
  });

  it('distinguishes both causes when a run has each', () => {
    const out = renderText(report([finding('S1', 'fail'), finding('S1', 'skipped', 'CB-AUD-002')]));
    expect(out).toContain('VERDICT: BLOCK — ship-blocking defects found, and other S1 checks could not run');
    expect(out).toContain('1 S1 fail · 1 S1 unverified');
  });

  it('marks a skipped S1 differently from a skipped S2, because only one of them blocks', () => {
    expect(renderText(report([finding('S1', 'skipped')]))).toContain('! S1 CB-AUD-001');
    expect(renderText(report([finding('S2', 'skipped')]))).toContain('– S2 CB-AUD-001');
  });

  it('ships and stays quiet when everything passed', () => {
    const out = renderText(report([finding('S1', 'pass')]));
    expect(out).toContain('VERDICT: SHIP');
    expect(out).toContain('✔ S1 CB-AUD-001');
  });
});
