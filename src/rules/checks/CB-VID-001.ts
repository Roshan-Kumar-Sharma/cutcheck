import type { BlackSegment, RuleCheck, Seconds } from '../../types.js';

/** Seconds of overlap between two intervals; 0 when they do not touch. */
const overlap = (aStart: Seconds, aEnd: Seconds, bStart: Seconds, bEnd: Seconds): Seconds =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

const totalOverlapMs = (segments: readonly BlackSegment[], start: Seconds, end: Seconds): number =>
  segments.reduce((acc, s) => acc + overlap(s.startSec, s.endSec, start, end), 0) * 1000;

/**
 * CB-VID-001 — black frames at the head or tail of the export.
 *
 * threshold: { edge_window_ms: number, max_black_ms: number }
 * Fails when the total black inside either edge window exceeds max_black_ms.
 *
 * Totals overlap rather than testing each segment on its own: three 40ms black flashes inside the first
 * 500ms is 120ms of black at the head, and a viewer sees that as one broken opening, not as three
 * individually-acceptable events. Overlap also handles the all-black export, where one segment spans
 * both windows.
 */
export const check: RuleCheck = (bundle, rule) => {
  const windowMs = Number(rule.threshold['edge_window_ms']);
  const maxMs = Number(rule.threshold['max_black_ms']);
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isFinite(maxMs) || maxMs < 0) {
    throw new Error(`${rule.id}: threshold needs a positive edge_window_ms and a non-negative max_black_ms`);
  }

  const m = bundle.media.measures.black;
  if (!m) return { status: 'skipped', message: 'No black-frame measurement available (no video stream?)', measured: {} };

  // blackdetect never reports a run shorter than its `d`, so a threshold below that floor cannot be
  // answered from this measurement — qualifying black could exist that we were never told about.
  // Unknown is not clean: report skipped, which for an S1 rule blocks.
  const floorMs = m.minReportedSec * 1000;
  if (maxMs < floorMs) {
    return {
      status: 'skipped',
      message: `max_black_ms=${maxMs} is below the ${floorMs} ms measurement floor (blackdetect d=${m.minReportedSec}); shorter black was never reported, so this cannot be answered`,
      measured: {},
    };
  }

  const duration = bundle.media.durationSec;
  const win = windowMs / 1000;
  const headEnd = Math.min(win, duration);
  const tailStart = Math.max(0, duration - win);

  const headMs = totalOverlapMs(m.segments, 0, headEnd);
  const tailMs = totalOverlapMs(m.segments, tailStart, duration);
  const measured = {
    head_black_ms: Math.round(headMs),
    tail_black_ms: Math.round(tailMs),
    black_segments: m.segments.length,
  };

  const headOver = headMs > maxMs;
  const tailOver = tailMs > maxMs;
  if (!headOver && !tailOver) {
    return {
      status: 'pass',
      message: `No more than ${maxMs} ms of black at either edge (head ${Math.round(headMs)} ms, tail ${Math.round(tailMs)} ms, window ${windowMs} ms)`,
      measured,
    };
  }

  // Whichever edge has more black is necessarily one that is over, so this always names a real failure.
  const worstIsHead = headMs >= tailMs;
  const worst = worstIsHead
    ? { ms: headMs, start: 0, end: headEnd, label: `first ${windowMs} ms` }
    : { ms: tailMs, start: tailStart, end: duration, label: `last ${windowMs} ms` };

  // Point `at` at the segment contributing most to that edge, so the timecode lands on real frames.
  const culprit = m.segments
    .map((s) => ({ s, ms: overlap(s.startSec, s.endSec, worst.start, worst.end) * 1000 }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => b.ms - a.ms)[0];

  const other = headOver && tailOver ? ` — the other edge is over too (${Math.round(worstIsHead ? tailMs : headMs)} ms)` : '';
  return {
    status: 'fail',
    message: `${Math.round(worst.ms)} ms of black in the ${worst.label} (limit ${maxMs} ms)${other}`,
    measured,
    ...(culprit ? { at: { startSec: culprit.s.startSec, endSec: culprit.s.endSec } } : {}),
  };
};
