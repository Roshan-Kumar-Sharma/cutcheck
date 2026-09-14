import { run } from '../util/exec.js';

/** Filters cutcheck will need across Phase 0. Checked by `cutcheck doctor`. */
export const REQUIRED_FILTERS = ['ebur128', 'blackdetect', 'freezedetect', 'silencedetect', 'cropdetect', 'astats'] as const;

export interface FfmpegEnv {
  ffmpegVersion: string;
  ffprobeVersion: string;
  missingFilters: string[];
}

let cached: Promise<FfmpegEnv> | undefined;

export function ffmpegEnv(): Promise<FfmpegEnv> {
  cached ??= (async () => {
    const [v, p, f] = await Promise.all([run('ffmpeg', ['-version']), run('ffprobe', ['-version']), run('ffmpeg', ['-hide_banner', '-filters'])]);
    if (v.exitCode !== 0) throw new Error(`ffmpeg not found or not runnable (exit ${v.exitCode}). Install FFmpeg 6+ and ensure it is on PATH.`);
    if (p.exitCode !== 0) throw new Error(`ffprobe not found or not runnable (exit ${p.exitCode}).`);
    const ver = (out: string) => /version\s+(\S+)/.exec(out)?.[1] ?? 'unknown';
    const present = new Set(
      f.stdout.split('\n').map((l) => /^\s*[TSC.]{2,3}\s+(\S+)\s+\S+->/.exec(l)?.[1]).filter((x): x is string => !!x),
    );
    return { ffmpegVersion: ver(v.stdout), ffprobeVersion: ver(p.stdout), missingFilters: REQUIRED_FILTERS.filter((x) => !present.has(x)) };
  })();
  return cached;
}
