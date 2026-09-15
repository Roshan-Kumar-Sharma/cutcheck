import type { MeasureKey, Measures, MediaFacts, ToolRun } from '../types.js';
import { run } from '../util/exec.js';
import { blackdetectFilter, parseBlackdetect } from './blackdetect.js';
import { ffmpegEnv } from './env.js';

/**
 * The shortest black run blackdetect is asked to report, in seconds. ~1 frame at 50fps.
 *
 * Deliberately far below any rule threshold. `d` is a filter-level cutoff — runs shorter than it are
 * never reported at all — so measuring at the rule's threshold would move the threshold out of YAML and
 * into the ffmpeg invocation, where lowering it in YAML would silently do nothing. Measure sensitively,
 * let the rule decide. BlackMeasure.minReportedSec carries this number so a rule whose threshold falls
 * below it can refuse to answer instead of reporting a false pass.
 */
const BLACK_MIN_SEC = 0.02;

/**
 * The video pass: one `-an` decode with every needed video filter chained onto it.
 *
 * blackdetect, freezedetect and cropdetect are all pass-through filters that only log, so they chain
 * serially with no `split`. Decoding dominates the cost, so chaining is near-free relative to running
 * each filter in its own invocation. Returns {} when nothing needs it, so no decode happens at all.
 */
export async function measureVideo(media: MediaFacts, needed: ReadonlySet<MeasureKey>): Promise<Partial<Measures>> {
  if (!media.video) return {};

  const filters: string[] = [];
  if (needed.has('black')) filters.push(blackdetectFilter(BLACK_MIN_SEC));
  // Phase 0, next: freezedetect and cropdetect append here, and their parsers read the same stderr.
  if (!filters.length) return {};

  const env = await ffmpegEnv();
  const args = ['-hide_banner', '-nostats', '-i', media.path, '-an', '-vf', filters.join(','), '-f', 'null', '-'];
  const res = await run('ffmpeg', args);
  if (res.exitCode !== 0) {
    throw new Error(`ffmpeg video pass failed on ${media.path} (exit ${res.exitCode}):\n${res.stderr.slice(-800)}`);
  }
  // One ToolRun, shared by every measurement this pass produced. `command` is the whole chain verbatim,
  // so each finding still cites exactly what produced its number.
  const toolRun: ToolRun = {
    tool: `ffmpeg:${filters.join(',')}`,
    toolVersion: env.ffmpegVersion,
    command: res.command,
    durationMs: res.durationMs,
  };

  return {
    ...(needed.has('black')
      ? { black: { segments: parseBlackdetect(res.stderr), minReportedSec: BLACK_MIN_SEC, run: toolRun } }
      : {}),
  };
}
