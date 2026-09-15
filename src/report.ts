import type { Finding, Report } from './types.js';

/** A skipped S1 blocks, so it must not wear the same benign dash an advisory skip gets. */
function icon(f: Finding): string {
  if (f.status === 'pass') return '✔';
  if (f.status === 'fail') return '✖';
  return f.severity === 'S1' ? '!' : '–';
}

function blockReason(s: Report['summary']): string {
  if (s.s1Fail && s.s1Skipped) return 'ship-blocking defects found, and other S1 checks could not run';
  if (s.s1Fail) return 'do not publish';
  return 'an S1 check could not run — unverified is not the same as safe';
}

/** Human summary for the terminal. The JSON report is the real artifact; this is just a glance. */
export function renderText(r: Report): string {
  const lines: string[] = [];
  lines.push(`cutcheck ${r.cutcheckVersion} · target=${r.target} · ${r.input.path} (${r.input.durationSec.toFixed(2)}s, sha256 ${r.input.sha256.slice(0, 12)}…)`);
  lines.push('');
  for (const f of r.findings) {
    lines.push(`${icon(f)} ${f.severity} ${f.ruleId} ${f.ruleName}`);
    lines.push(`    ${f.message}`);
    if (f.status !== 'skipped' && Object.keys(f.measured).length) {
      lines.push(`    measured: ${Object.entries(f.measured).map(([k, v]) => `${k}=${v}`).join('  ')}`);
    }
    lines.push(`    source: ${f.provenance.source.citation.split('.')[0]}. (${f.provenance.source.confidence} confidence, verified ${f.provenance.source.measured_on})`);
  }
  lines.push('');
  const s = r.summary;
  lines.push(`${s.s1Fail} S1 fail · ${s.s1Skipped} S1 unverified · ${s.s2Fail} S2 fail · ${s.pass} pass · ${s.skipped} skipped · ${r.timing.totalMs} ms`);
  lines.push(r.verdict === 'block' ? `VERDICT: BLOCK — ${blockReason(s)}` : 'VERDICT: SHIP');
  return lines.join('\n');
}
