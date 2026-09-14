import { execFile } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  /** Shell-quoted, copy-pasteable. */
  command: string;
}

function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(bin: string, args: string[]): string {
  return [bin, ...args].map(shellQuote).join(' ');
}

/** Runs a binary with args (no shell). Resolves even on non-zero exit so callers decide what's fatal. */
export function run(bin: string, args: string[], opts: { maxBuffer?: number } = {}): Promise<ExecResult> {
  const started = performance.now();
  const command = formatCommand(bin, args);
  return new Promise((resolve) => {
    execFile(bin, args, { maxBuffer: opts.maxBuffer ?? 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const exitCode = err && typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : err ? 1 : 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), exitCode, durationMs: Math.round(performance.now() - started), command });
    });
  });
}
