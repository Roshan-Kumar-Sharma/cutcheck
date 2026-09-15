import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ffmpegEnv, REQUIRED_FILTERS } from './ffmpeg/env.js';
import { collectMeasures } from './ffmpeg/measure.js';
import { probeMedia } from './ffmpeg/probe.js';
import { renderText } from './report.js';
import { evaluate } from './rules/engine.js';
import { loadRulePacks, rulesFor } from './rules/load.js';
import { TARGETS, type EditBundle, type Target } from './types.js';
import { CUTCHECK_VERSION } from './version.js';

const RULES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'rules');

function parseTarget(s: string): Target {
  if ((TARGETS as readonly string[]).includes(s)) return s as Target;
  throw new Error(`--target must be one of ${TARGETS.join(', ')}; got "${s}"`);
}

const program = new Command().name('cutcheck').description('Ship-gate for agentic video editors. Rules decide; models explain.').version(CUTCHECK_VERSION);

program
  .command('run')
  .description('Check a rendered export against a platform rulepack. Exit 1 if any S1 rule fails.')
  .argument('<file>', 'rendered export (mp4/mov)')
  .requiredOption('-t, --target <platform>', `one of ${TARGETS.join(', ')}`)
  .option('--only <ids>', 'comma-separated rule ids to run (e.g. CB-AUD-001)')
  .option('-o, --out <path>', 'where to write the JSON report', 'cutcheck-report.json')
  .option('--json', 'print the JSON report to stdout instead of the text summary')
  .action(async (file: string, opts: { target: string; only?: string; out: string; json?: boolean }) => {
    const started = performance.now();
    const target = parseTarget(opts.target);
    const packs = await loadRulePacks(RULES_DIR);
    const rules = rulesFor(packs, target, opts.only?.split(','));
    if (!rules.length) throw new Error(`No rules apply to target=${target}${opts.only ? ` with --only ${opts.only}` : ''}`);

    const media = await probeMedia(resolve(file));
    const measures = await collectMeasures(media, new Set(rules.flatMap((r) => r.requires)));

    const bundle: EditBundle = { target, media: { ...media, measures }, createdAt: new Date().toISOString() };
    const report = evaluate(bundle, rules, started);

    await writeFile(opts.out, JSON.stringify(report, null, 2));
    process.stdout.write((opts.json ? JSON.stringify(report, null, 2) : renderText(report)) + '\n');
    if (!opts.json) process.stdout.write(`report → ${opts.out}\n`);
    process.exitCode = report.verdict === 'block' ? 1 : 0;
  });

program
  .command('rules')
  .description('List the rules that would run for a target')
  .option('-t, --target <platform>', `one of ${TARGETS.join(', ')}`)
  .action(async (opts: { target?: string }) => {
    const packs = await loadRulePacks(RULES_DIR);
    const rules = opts.target ? rulesFor(packs, parseTarget(opts.target)) : packs.flatMap((p) => p.rules);
    for (const r of rules) process.stdout.write(`${r.severity} ${r.id.padEnd(11)} ${r.name.padEnd(36)} [${r.applies_to.join(',')}]  requires: ${r.requires.join(',') || '-'}\n`);
  });

program
  .command('doctor')
  .description('Check ffmpeg/ffprobe are present with the filters cutcheck needs')
  .action(async () => {
    const env = await ffmpegEnv();
    process.stdout.write(`ffmpeg  ${env.ffmpegVersion}\nffprobe ${env.ffprobeVersion}\n`);
    for (const f of REQUIRED_FILTERS) process.stdout.write(`  ${env.missingFilters.includes(f) ? '✖ missing' : '✔ present'}  ${f}\n`);
    if (env.missingFilters.length) process.exitCode = 1;
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`cutcheck: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
});
