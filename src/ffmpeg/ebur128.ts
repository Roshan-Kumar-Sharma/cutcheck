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

/**
 * The audio pass: ffmpeg's ebur128 over the whole file.
 *
 * Returns undefined when there is no audio stream to measure. That absence is deliberate — it leaves the
 * `loudness` key off `measures`, so a rule that `requires: [loudness]` reports `skipped`, and a skipped
 * S1 blocks. Never synthesise a zero here.
 */
export async function measureLoudness(media: MediaFacts): Promise<LoudnessMeasure | undefined> {
  if (!media.audio) return undefined;
  const env = await ffmpegEnv();
  // -vn drops video from the null output, so ffmpeg never decodes the video stream. Loudness is an
  // audio-only measurement and decoding is ~94% of the cost: 991ms -> 171ms on a 60s 1080x1920 h264
  // clip, byte-identical Summary block. Keep scripts/make-fixtures.sh in step with these args.
  const args = ['-hide_banner', '-nostats', '-i', media.path, '-vn', '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'];
  const res = await run('ffmpeg', args);
  if (res.exitCode !== 0) throw new Error(`ffmpeg ebur128 failed on ${media.path} (exit ${res.exitCode}):\n${res.stderr.slice(-800)}`);
  return {
    ...parseEbur128Summary(res.stderr),
    run: { tool: 'ffmpeg:ebur128', toolVersion: env.ffmpegVersion, command: res.command, durationMs: res.durationMs },
  };
}
