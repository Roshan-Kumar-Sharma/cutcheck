import { describe, expect, it } from 'vitest';
import { check } from '../src/rules/checks/CB-VID-001.js';
import type { BlackSegment, EditBundle, RuleDef, ToolRun } from '../src/types.js';

const run: ToolRun = { tool: 'test', toolVersion: '0', command: 'n/a', durationMs: 0 };
const rule: RuleDef = {
  id: 'CB-VID-001', name: 'black_frames_at_edges', severity: 'S1', applies_to: ['reels', 'shorts'], requires: ['black'],
  threshold: { edge_window_ms: 500, max_black_ms: 100 },
  source: { citation: 't', measured_on: '2026-09-15', confidence: 'low' }, rationale: 't',
};

const seg = (startSec: number, endSec: number): BlackSegment => ({ startSec, endSec, durationSec: endSec - startSec });

const bundle = (segments: BlackSegment[] | undefined, durationSec = 10, minReportedSec = 0.02): EditBundle => ({
  target: 'reels',
  createdAt: '2026-09-15T00:00:00Z',
  media: {
    path: 'x.mp4', sha256: '0', container: 'mp4', durationSec, probe: run,
    measures: segments === undefined ? {} : { black: { segments, minReportedSec, run } },
  },
});

describe('CB-VID-001 black_frames_at_edges', () => {
  it('passes a clean export with no black at all', () => {
    expect(check(bundle([]), rule).status).toBe('pass');
  });

  it('passes black exactly at the limit — the threshold is "more than"', () => {
    expect(check(bundle([seg(0, 0.1)]), rule).status).toBe('pass');
  });

  it('fails just past the limit and reports the timecode', () => {
    expect(check(bundle([seg(0, 0.101)]), rule)).toMatchObject({
      status: 'fail',
      at: { startSec: 0, endSec: 0.101 },
    });
  });

  it('fails on a black head and says which edge', () => {
    const r = check(bundle([seg(0, 0.133)]), rule);
    expect(r).toMatchObject({ status: 'fail', measured: { head_black_ms: 133, tail_black_ms: 0 } });
    expect(r.message).toContain('first 500 ms');
  });

  it('fails on a black tail and says which edge', () => {
    const r = check(bundle([seg(9.8, 9.97)]), rule);
    expect(r).toMatchObject({ status: 'fail', measured: { head_black_ms: 0, tail_black_ms: 170 } });
    expect(r.message).toContain('last 500 ms');
  });

  it('ignores black in the middle — that is CB-VID-002 territory', () => {
    expect(check(bundle([seg(4, 5)]), rule)).toMatchObject({
      status: 'pass',
      measured: { head_black_ms: 0, tail_black_ms: 0, black_segments: 1 },
    });
  });

  it('counts only the part of a segment inside the window', () => {
    // Black from 0.4 to 2.0: only 100ms of it is inside the first 500ms, which is exactly the limit.
    expect(check(bundle([seg(0.4, 2.0)]), rule)).toMatchObject({ status: 'pass', measured: { head_black_ms: 100 } });
    expect(check(bundle([seg(0.39, 2.0)]), rule)).toMatchObject({ status: 'fail', measured: { head_black_ms: 110 } });
  });

  it('sums several short flashes rather than clearing each one individually', () => {
    // Three 40ms flashes: each is under the limit, together they are 120ms of black at the head.
    const flashes = [seg(0, 0.04), seg(0.1, 0.14), seg(0.2, 0.24)];
    expect(check(bundle(flashes), rule)).toMatchObject({ status: 'fail', measured: { head_black_ms: 120 } });
  });

  it('flags both edges when both are black, and points at the worse one', () => {
    const r = check(bundle([seg(0, 0.15), seg(9.7, 10)]), rule);
    expect(r).toMatchObject({ status: 'fail', at: { startSec: 9.7 } });
    expect(r.message).toContain('the other edge is over too');
  });

  it('handles an entirely black export, where one segment spans both windows', () => {
    expect(check(bundle([seg(0, 10)]), rule)).toMatchObject({
      status: 'fail',
      measured: { head_black_ms: 500, tail_black_ms: 500 },
    });
  });

  it('handles a clip shorter than the window without going negative', () => {
    expect(check(bundle([seg(0, 0.3)], 0.3), rule)).toMatchObject({ status: 'fail', measured: { head_black_ms: 300 } });
  });

  it('skips — never passes — when a threshold falls below the measurement floor', () => {
    // blackdetect was run with d=0.02, so runs under 20ms were never reported. A 10ms threshold cannot
    // be answered from this measurement, and unknown is not clean.
    const tooFine = { ...rule, threshold: { edge_window_ms: 500, max_black_ms: 10 } };
    expect(check(bundle([]), tooFine)).toMatchObject({ status: 'skipped', message: expect.stringContaining('measurement floor') });
  });

  it('reports skipped — never pass — when the measurement is absent', () => {
    expect(check(bundle(undefined), rule).status).toBe('skipped');
  });

  it('rejects a malformed threshold loudly', () => {
    expect(() => check(bundle([]), { ...rule, threshold: { edge_window_ms: 0, max_black_ms: 100 } })).toThrow(/edge_window_ms/);
    expect(() => check(bundle([]), { ...rule, threshold: { edge_window_ms: 500 } })).toThrow(/max_black_ms/);
  });
});
