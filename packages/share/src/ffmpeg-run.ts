import { spawn } from 'node:child_process';

/**
 * A tiny process runner for shelling out to ffmpeg, in the same shape as
 * `@waggle/compose`'s internal `run-ffmpeg.ts` (never resolves the child
 * process exit code as a rejection; only launch failure rejects). That
 * module is not part of compose's public API (only path resolution and
 * the "not found" error type are re-exported from the package root), and
 * packages/compose is out of this Bee's scope to modify, so this is a
 * deliberately small, self-contained duplicate of the one thing this
 * package needs from it: run a binary to completion and report what
 * happened.
 */

const STDERR_TAIL_LIMIT = 4000;

export interface FfmpegRunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export class FfmpegLaunchError extends Error {
  constructor(binary: string, cause: string) {
    super(`Could not launch "${binary}": ${cause}.`);
    this.name = 'FfmpegLaunchError';
  }
}

export type FfmpegRunner = (binary: string, args: readonly string[]) => Promise<FfmpegRunResult>;

/** The real runner, spawning a child process. Injectable so tests never need a real ffmpeg binary except in the e2e suite that deliberately wants one. */
export const runFfmpeg: FfmpegRunner = (binary, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(new FfmpegLaunchError(binary, error.code ?? error.message));
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });

/** The last few thousand characters of stderr, for an error message. */
export function ffmpegStderrTail(stderr: string): string {
  return stderr.length <= STDERR_TAIL_LIMIT ? stderr : stderr.slice(-STDERR_TAIL_LIMIT);
}
