import type { LoudnessMeasure, MediaFacts } from '../types.js';
import { run } from '../util/exec.js';
import { ffmpegEnv } from './env.js';

/**
 * Parses the "Summary:" block ffmpeg's ebur128 filter prints to stderr at end of stream.
 * Real captured output lives in test/fixtures/*.ebur128.stderr.txt — the parser is tested against that,
 * not against a hand-typed approximation.
 *
 *   Integrated loudness:
 *     I:         -13.8 LUFS
 *   Loudness range:
 *     LRA:         0.0 LU
 *   True peak:
 *     Peak:       -7.6 dBFS      <- with peak=true this is the oversampled true peak (dBTP)
 */
export function parseEbur128Summary(stderr: string): Omit<LoudnessMeasure, 'run'> {
  const summaryAt = stderr.lastIndexOf('Summary:');
  if (summaryAt < 0) throw new Error('ebur128: no Summary block in ffmpeg stderr (did the filter run to end of stream?)');
  const s = stderr.slice(summaryAt);
  const grab = (re: RegExp, what: string): number => {
    const m = re.exec(s);
    if (!m?.[1]) throw new Error(`ebur128: could not find ${what} in Summary block`);
    return m[1] === '-inf' ? -Infinity : Number(m[1]);
  };
  return {
    integratedLufs: grab(/^\s*I:\s+(-?[\d.]+|-inf)\s+LUFS/m, 'integrated loudness (I:)'),
    loudnessRangeLu: grab(/^\s*LRA:\s+(-?[\d.]+|-inf)\s+LU\b/m, 'loudness range (LRA:)'),
    truePeakDbtp: grab(/^\s*Peak:\s+(-?[\d.]+|-inf)\s+dBFS/m, 'true peak (Peak:)'),
  };
}

/** Runs ffmpeg's ebur128 over the whole file and attaches a `loudness` measurement. No-op if there is no audio stream. */
export async function measureLoudness(media: MediaFacts): Promise<MediaFacts> {
  if (!media.audio) return media; // rules that `require: [loudness]` will report `skipped`, loudly
  const env = await ffmpegEnv();
  const args = ['-hide_banner', '-nostats', '-i', media.path, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'];
  const res = await run('ffmpeg', args);
  if (res.exitCode !== 0) throw new Error(`ffmpeg ebur128 failed on ${media.path} (exit ${res.exitCode}):\n${res.stderr.slice(-800)}`);
  const parsed = parseEbur128Summary(res.stderr);
  const loudness: LoudnessMeasure = {
    ...parsed,
    run: { tool: 'ffmpeg:ebur128', toolVersion: env.ffmpegVersion, command: res.command, durationMs: res.durationMs },
  };
  return { ...media, measures: { ...media.measures, loudness } };
}
