import type { RuleCheck } from '../../types.js';

/**
 * CB-AUD-001 — integrated loudness out of range.
 *
 * threshold: { target_lufs: number, tolerance_lu: number }
 * Fails if |integrated − target| > tolerance. Digital silence (−Infinity) fails too: an inaudible export is
 * not "quiet", it's broken, and the asymmetric-error rule says flag it.
 */
export const check: RuleCheck = (bundle, rule) => {
  const target = Number(rule.threshold['target_lufs']);
  const tol = Number(rule.threshold['tolerance_lu']);
  if (!Number.isFinite(target) || !Number.isFinite(tol) || tol < 0) {
    throw new Error(`${rule.id}: threshold must have numeric target_lufs and non-negative tolerance_lu`);
  }
  const l = bundle.media.measures.loudness;
  if (!l) return { status: 'skipped', message: 'No loudness measurement available (no audio stream?)', measured: {} };

  const i = l.integratedLufs;
  const measured = { integrated_lufs: Number.isFinite(i) ? i : null, loudness_range_lu: l.loudnessRangeLu, true_peak_dbtp: l.truePeakDbtp };

  if (!Number.isFinite(i)) {
    return { status: 'fail', message: `Integrated loudness is −∞ LUFS (digital silence); target ${target} ±${tol} LU`, measured };
  }
  const delta = i - target;
  if (Math.abs(delta) > tol) {
    const dir = delta > 0 ? 'hot' : 'quiet';
    return {
      status: 'fail',
      message: `Integrated loudness ${i.toFixed(1)} LUFS is ${Math.abs(delta).toFixed(1)} LU ${dir} of target ${target} LUFS (tolerance ±${tol} LU)`,
      measured,
    };
  }
  return { status: 'pass', message: `Integrated loudness ${i.toFixed(1)} LUFS within ${target} ±${tol} LU`, measured };
};
