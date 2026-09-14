import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKS } from '../src/rules/checks/index.js';
import { loadRulePacks, rulesFor } from '../src/rules/load.js';

const RULES = new URL('../rules', import.meta.url).pathname;

describe('rulepack loading', () => {
  it('loads the shipped rulepacks and every rule has a check implementation', async () => {
    const packs = await loadRulePacks(RULES);
    const rules = packs.flatMap((p) => p.rules);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(CHECKS, `no check for ${r.id}`).toHaveProperty(r.id);
  });
  it('filters by target and by --only', async () => {
    const packs = await loadRulePacks(RULES);
    expect(rulesFor(packs, 'reels').map((r) => r.id)).toContain('CB-AUD-001');
    expect(rulesFor(packs, 'reels', ['cb-aud-001']).map((r) => r.id)).toEqual(['CB-AUD-001']);
    expect(rulesFor(packs, 'reels', ['CB-NOPE-999'])).toEqual([]);
  });
  it('rejects a rule with a bad measured_on date and names the field', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcheck-rules-'));
    await writeFile(join(dir, 'bad.yaml'), [
      'pack: bad', 'version: 1', 'rules:',
      '  - id: CB-AUD-001', '    name: x', '    severity: S1', '    applies_to: [reels]', '    requires: [loudness]',
      '    threshold: {}', '    source: { citation: c, measured_on: "Sept 9", confidence: high }', '    rationale: r',
    ].join('\n'));
    await expect(loadRulePacks(dir)).rejects.toThrow(/measured_on/);
  });
  it('rejects duplicate rule ids across packs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cutcheck-rules-'));
    const one = 'pack: p\nversion: 1\nrules:\n  - { id: CB-AUD-001, name: a, severity: S1, applies_to: [reels], threshold: {}, source: { citation: c, measured_on: "2026-01-01", confidence: high }, rationale: r }\n';
    await writeFile(join(dir, 'a.yaml'), one);
    await writeFile(join(dir, 'b.yaml'), one.replace('pack: p', 'pack: q'));
    await expect(loadRulePacks(dir)).rejects.toThrow(/Duplicate rule id CB-AUD-001/);
  });
});
