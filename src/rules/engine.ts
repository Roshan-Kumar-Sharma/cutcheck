import type { EditBundle, Finding, Report, RuleDef, ToolRun } from '../types.js';
import { CUTCHECK_VERSION } from '../version.js';
import { CHECKS } from './checks/index.js';

/** Which tool runs a rule's verdict depended on — the probe plus every required measurement's run. */
function runsFor(bundle: EditBundle, rule: RuleDef): ToolRun[] {
  const runs: ToolRun[] = [bundle.media.probe];
  for (const key of rule.requires) {
    const m = bundle.media.measures[key];
    if (m) runs.push(m.run);
  }
  return runs;
}

export function evaluateRule(bundle: EditBundle, rule: RuleDef, evaluatedAt: string): Finding {
  const check = CHECKS[rule.id];
  if (!check) throw new Error(`Rule ${rule.id} is defined in YAML but has no check implementation in src/rules/checks/`);

  const missing = rule.requires.filter((k) => !bundle.media.measures[k]);
  const result = missing.length
    ? { status: 'skipped' as const, message: `Required measurement(s) not available: ${missing.join(', ')}`, measured: {} }
    : check(bundle, rule);

  return {
    ...result,
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    threshold: rule.threshold,
    provenance: { source: rule.source, runs: runsFor(bundle, rule), cutcheckVersion: CUTCHECK_VERSION, evaluatedAt },
    repro: `cutcheck run ${JSON.stringify(bundle.media.path)} --target ${bundle.target} --only ${rule.id}`,
  };
}

export function evaluate(bundle: EditBundle, rules: RuleDef[], startedAtMs: number): Report {
  const evaluatedAt = new Date().toISOString();
  const findings = rules.map((r) => evaluateRule(bundle, r, evaluatedAt));
  const summary = {
    s1Fail: findings.filter((f) => f.severity === 'S1' && f.status === 'fail').length,
    s1Skipped: findings.filter((f) => f.severity === 'S1' && f.status === 'skipped').length,
    s2Fail: findings.filter((f) => f.severity === 'S2' && f.status === 'fail').length,
    pass: findings.filter((f) => f.status === 'pass').length,
    skipped: findings.filter((f) => f.status === 'skipped').length,
  };
  return {
    cutcheckVersion: CUTCHECK_VERSION,
    target: bundle.target,
    input: { path: bundle.media.path, sha256: bundle.media.sha256, durationSec: bundle.media.durationSec },
    // A ship-blocking rule that could not run blocks too. See the note on Report.verdict.
    verdict: summary.s1Fail + summary.s1Skipped > 0 ? 'block' : 'ship',
    summary,
    findings,
    timing: { totalMs: Math.round(performance.now() - startedAtMs) },
    evaluatedAt,
  };
}
