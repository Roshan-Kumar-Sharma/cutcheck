import type { Finding, Report } from './types.js';

const ICON: Record<Finding['status'], string> = { pass: '✔', fail: '✖', skipped: '–' };

/** Human summary for the terminal. The JSON report is the real artifact; this is just a glance. */
export function renderText(r: Report): string {
  const lines: string[] = [];
  lines.push(`cutcheck ${r.cutcheckVersion} · target=${r.target} · ${r.input.path} (${r.input.durationSec.toFixed(2)}s, sha256 ${r.input.sha256.slice(0, 12)}…)`);
  lines.push('');
  for (const f of r.findings) {
    lines.push(`${ICON[f.status]} ${f.severity} ${f.ruleId} ${f.ruleName}`);
    lines.push(`    ${f.message}`);
    if (f.status !== 'skipped' && Object.keys(f.measured).length) {
      lines.push(`    measured: ${Object.entries(f.measured).map(([k, v]) => `${k}=${v}`).join('  ')}`);
    }
    lines.push(`    source: ${f.provenance.source.citation.split('.')[0]}. (${f.provenance.source.confidence} confidence, verified ${f.provenance.source.measured_on})`);
  }
  lines.push('');
  const s = r.summary;
  lines.push(`${s.s1Fail} S1 fail · ${s.s2Fail} S2 fail · ${s.pass} pass · ${s.skipped} skipped · ${r.timing.totalMs} ms`);
  lines.push(r.verdict === 'block' ? 'VERDICT: BLOCK — do not publish' : 'VERDICT: SHIP');
  return lines.join('\n');
}
