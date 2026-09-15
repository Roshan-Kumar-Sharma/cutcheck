import type { RuleCheck } from '../../types.js';

/**
 * CB-AUD-002 — true peak above the delivery ceiling.
 *
 * threshold: { max_true_peak_dbtp: number }
 * Fails if the true peak is above the ceiling. The ceiling is inclusive: EBU R128 says "maximum
 * *permitted*", so a reading sitting exactly on it is permitted.
 *
 * Reads truePeakDbtp off the loudness measurement CB-AUD-001 already forced, so this rule costs no
 * additional ffmpeg run.
 */
export const check: RuleCheck = (bundle, rule) => {
  const max = Number(rule.threshold['max_true_peak_dbtp']);
  if (!Number.isFinite(max)) {
    throw new Error(`${rule.id}: threshold must have a numeric max_true_peak_dbtp`);
  }
  const l = bundle.media.measures.loudness;
  if (!l) return { status: 'skipped', message: 'No loudness measurement available (no audio stream?)', measured: {} };

  const tp = l.truePeakDbtp;
  const measured = {
    true_peak_dbtp: Number.isFinite(tp) ? tp : null,
    integrated_lufs: Number.isFinite(l.integratedLufs) ? l.integratedLufs : null,
  };

  // Digital silence passes, deliberately. A silent file has no peak to clip, and CB-AUD-001 already
  // fails it for being silent. Failing it here too would report one defect under two rule ids, which
  // inflates the per-defect counts Phase 2's miss rate is computed from.
  if (tp === -Infinity) {
    return { status: 'pass', message: `True peak is −∞ dBTP (digital silence); nothing to clip against the ${max} dBTP ceiling`, measured };
  }
  // NaN or +Infinity means the parser handed us something unusable. Falling through would compare
  // NaN > max, which is false, and report `pass` on a number we do not have. Never pass on unknown.
  if (!Number.isFinite(tp)) {
    return { status: 'fail', message: `True peak reading is unusable (${String(tp)}); cannot confirm it clears the ${max} dBTP ceiling`, measured };
  }
  if (tp > max) {
    return {
      status: 'fail',
      message: `True peak ${tp.toFixed(1)} dBTP is ${(tp - max).toFixed(1)} dB over the ${max} dBTP ceiling`,
      measured,
    };
  }
  return { status: 'pass', message: `True peak ${tp.toFixed(1)} dBTP is within the ${max} dBTP ceiling`, measured };
};
