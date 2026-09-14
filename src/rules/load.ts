import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { RuleDef, Target } from '../types.js';
import { RulePackSchema, type RulePack } from './schema.js';

/** Loads and validates every *.yaml in a rules directory. Duplicate rule ids across packs are an error. */
export async function loadRulePacks(dir: string): Promise<RulePack[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml')).sort();
  const packs: RulePack[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const raw = parse(await readFile(join(dir, file), 'utf8')) as unknown;
    const result = RulePackSchema.safeParse(raw);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
      throw new Error(`Invalid rulepack ${file}:\n${issues}`);
    }
    for (const r of result.data.rules) {
      const prev = seen.get(r.id);
      if (prev) throw new Error(`Duplicate rule id ${r.id} in ${file} (already defined in ${prev})`);
      seen.set(r.id, file);
    }
    packs.push(result.data as RulePack);
  }
  return packs;
}

export function rulesFor(packs: RulePack[], target: Target, only?: string[]): RuleDef[] {
  const wanted = only ? new Set(only.map((s) => s.trim().toUpperCase())) : undefined;
  return packs.flatMap((p) => p.rules).filter((r) => r.applies_to.includes(target) && (!wanted || wanted.has(r.id)));
}
