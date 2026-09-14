import type { AudioFacts, MediaFacts, VideoFacts } from '../types.js';
import { run } from '../util/exec.js';
import { sha256File } from '../util/hash.js';
import { ffmpegEnv } from './env.js';

interface FfprobeStream {
  codec_type?: string; codec_name?: string; width?: number; height?: number;
  r_frame_rate?: string; avg_frame_rate?: string; start_time?: string; sample_rate?: string; channels?: number;
}
interface FfprobeOut { format?: { format_name?: string; duration?: string }; streams?: FfprobeStream[] }

/** "30/1" → 30, "30000/1001" → 29.97. */
export function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [n, d] = r.split('/').map(Number);
  return d ? (n ?? 0) / d : (n ?? 0);
}

const num = (s: string | undefined, fallback = 0): number => (s === undefined ? fallback : Number(s));

/** ffprobe → MediaFacts with an empty `measures` map. Measurements are added by the probes in ./measures. */
export async function probeMedia(path: string): Promise<MediaFacts> {
  const env = await ffmpegEnv();
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path];
  const [res, sha256] = await Promise.all([run('ffprobe', args), sha256File(path)]);
  if (res.exitCode !== 0) throw new Error(`ffprobe failed on ${path}: ${res.stderr.trim()}`);
  const out = JSON.parse(res.stdout) as FfprobeOut;

  const v = out.streams?.find((s) => s.codec_type === 'video');
  const a = out.streams?.find((s) => s.codec_type === 'audio');

  const video: VideoFacts | undefined = v
    ? { codec: v.codec_name ?? 'unknown', width: v.width ?? 0, height: v.height ?? 0, fps: parseRate(v.avg_frame_rate ?? v.r_frame_rate), startTimeSec: num(v.start_time) }
    : undefined;
  const audio: AudioFacts | undefined = a
    ? { codec: a.codec_name ?? 'unknown', sampleRate: num(a.sample_rate), channels: a.channels ?? 0, startTimeSec: num(a.start_time) }
    : undefined;

  return {
    path,
    sha256,
    container: out.format?.format_name ?? 'unknown',
    durationSec: num(out.format?.duration),
    ...(video ? { video } : {}),
    ...(audio ? { audio } : {}),
    measures: {},
    probe: { tool: 'ffprobe', toolVersion: env.ffprobeVersion, command: res.command, durationMs: res.durationMs },
  };
}
