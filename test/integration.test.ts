import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectMeasures } from '../src/ffmpeg/measure.js';
import { probeMedia } from '../src/ffmpeg/probe.js';
import { evaluate } from '../src/rules/engine.js';
import { loadRulePacks, rulesFor } from '../src/rules/load.js';

// Real ffmpeg, real files. Skipped if the fixtures haven't been generated (`pnpm fixtures`).
const fx = (n: string) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const have = existsSync(fx('ok.mp4')) && existsSync(fx('hot.mp4')) && existsSync(fx('blackhead.mp4'));

describe.skipIf(!have)('end to end against real ffmpeg', () => {
  it('blocks the hot export and ships the compliant one, with provenance on the finding', async () => {
    const packs = await loadRulePacks(new URL('../rules', import.meta.url).pathname);
    const rules = rulesFor(packs, 'reels', ['CB-AUD-001']);

    const bundleFor = async (name: string, target: 'reels' | 'shorts') => {
      const media = await probeMedia(fx(name));
      return { target, media: { ...media, measures: await collectMeasures(media, new Set(rules.flatMap((r) => r.requires))) }, createdAt: '' };
    };

    const hot = evaluate(await bundleFor('hot.mp4', 'reels'), rules, performance.now());
    expect(hot.verdict).toBe('block');
    const f = hot.findings[0]!;
    expect(f.status).toBe('fail');
    expect(f.provenance.runs.map((r) => r.tool)).toEqual(['ffprobe', 'ffmpeg:ebur128']);
    expect(f.provenance.runs[1]!.command).toContain('ebur128=peak=true');
    expect(f.repro).toContain('--only CB-AUD-001');
    expect(hot.input.sha256).toMatch(/^[0-9a-f]{64}$/);

    const ok = evaluate(await bundleFor('ok.mp4', 'shorts'), rules, performance.now());
    expect(ok.verdict).toBe('ship');
    expect(ok.findings[0]!.status).toBe('pass');
  }, 30_000);

  it('detects black at each edge, and does not claim mid-timeline black', async () => {
    const packs = await loadRulePacks(new URL('../rules', import.meta.url).pathname);
    const rules = rulesFor(packs, 'reels', ['CB-VID-001']);
    const verdictFor = async (name: string) => {
      const media = await probeMedia(fx(name));
      const bundle = { target: 'reels' as const, media: { ...media, measures: await collectMeasures(media, new Set(rules.flatMap((r) => r.requires))) }, createdAt: '' };
      return evaluate(bundle, rules, performance.now()).findings[0]!;
    };

    const head = await verdictFor('blackhead.mp4');
    expect(head).toMatchObject({ status: 'fail', at: { startSec: 0 } });
    expect(head.message).toContain('first 500 ms');
    expect(head.provenance.runs.map((r) => r.tool)).toEqual(['ffprobe', 'ffmpeg:blackdetect=d=0.02']);

    const tail = await verdictFor('blacktail.mp4');
    expect(tail).toMatchObject({ status: 'fail' });
    expect(tail.message).toContain('last 500 ms');

    // 67ms of black is under the 100ms limit, and mid-timeline black is CB-VID-002's problem.
    expect((await verdictFor('blackshort.mp4')).status).toBe('pass');
    expect((await verdictFor('blackmid.mp4')).status).toBe('pass');
    expect((await verdictFor('ok.mp4')).status).toBe('pass');
  }, 60_000);
});
