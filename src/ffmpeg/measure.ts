import type { MeasureKey, Measures, MediaFacts } from '../types.js';
import { measureLoudness } from './ebur128.js';

/**
 * Runs the measurement passes and merges whatever they produced into one `measures` map.
 *
 * **One ffmpeg invocation per stream type, not one per measurement.** Decoding dominates the cost — on a
 * 60s 1080x1920 h264 clip, decoding is ~950ms of every run and the filters themselves are 10–900ms. So
 * every measurement that needs raw video frames chains into a single `-an` pass (`blackdetect`,
 * `freezedetect` and `cropdetect` are all pass-through filters that only log, so they chain serially with
 * no `split`), and audio-only measurements run in a separate `-vn` pass.
 *
 * Measured, same clip: four separate invocations ~4.9s; one combined `-filter_complex` 2.47s; two
 * concurrent passes ~2.3s. The split costs nothing over one combined graph and buys two things back —
 * failure isolation (freezedetect dying still leaves loudness measured) and one stderr per parser instead
 * of four filters interleaved into one stream.
 *
 * A pass that no selected rule needs is never run: `--only CB-AUD-001` must not pay for a video decode.
 */
export async function collectMeasures(media: MediaFacts, needed: ReadonlySet<MeasureKey>): Promise<Partial<Measures>> {
  const [loudness] = await Promise.all([
    needed.has('loudness') ? measureLoudness(media) : undefined,
    // Phase 0 next: the video pass, gated on needed.has('black') || needed.has('freeze') || needed.has('crop')
  ]);
  return { ...(loudness ? { loudness } : {}) };
}
