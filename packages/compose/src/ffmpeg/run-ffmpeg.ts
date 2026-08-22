// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn } from 'node:child_process';

/**
 * Launching ffmpeg and ffprobe.
 *
 * The binary names are read from the environment (`WAGGLE_FFMPEG_PATH`,
 * `WAGGLE_FFPROBE_PATH`) with a PATH lookup as the default, because
 * ADR-003 makes ffmpeg the default backend for everyone and "everyone"
 * includes people whose ffmpeg is not on PATH.
 *
 * `stdin` is closed (`-nostdin` plus an ignored stdin) so a render can
 * never block on ffmpeg's interactive prompt when it finds an existing
 * output file. `-y` handles that case explicitly instead.
 */

export const FFMPEG_PATH_ENV_VAR = 'WAGGLE_FFMPEG_PATH';
export const FFPROBE_PATH_ENV_VAR = 'WAGGLE_FFPROBE_PATH';

/** How many trailing stderr characters are kept for an error message. */
const STDERR_TAIL_LIMIT = 4000;

export function resolveFfmpegPath(env: NodeJS.ProcessEnv = process.env): string {
  return env[FFMPEG_PATH_ENV_VAR] ?? 'ffmpeg';
}

export function resolveFfprobePath(env: NodeJS.ProcessEnv = process.env): string {
  return env[FFPROBE_PATH_ENV_VAR] ?? 'ffprobe';
}

export interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export class FfmpegNotFoundError extends Error {
  constructor(binary: string, cause: string) {
    super(
      `Could not launch "${binary}": ${cause}. Install ffmpeg (ADR-003 makes it the default compositor backend) or point ${FFMPEG_PATH_ENV_VAR}/${FFPROBE_PATH_ENV_VAR} at it.`,
    );
    this.name = 'FfmpegNotFoundError';
  }
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Runs a binary to completion and returns its exit code and output.
 *
 * Never rejects on a non-zero exit code: the caller decides what a failure
 * means and needs the stderr to say so. It rejects only when the process
 * could not be launched at all, which is a genuinely different problem
 * (ffmpeg is not installed) and deserves its own error type.
 */
export function run(
  binary: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
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
      if (stderr.length > STDERR_TAIL_LIMIT * 4) {
        stderr = stderr.slice(-STDERR_TAIL_LIMIT * 2);
      }
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(new FfmpegNotFoundError(binary, error.code ?? error.message));
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/** The last few thousand characters of stderr, for an error message. */
export function stderrTail(stderr: string): string {
  return stderr.length <= STDERR_TAIL_LIMIT ? stderr : stderr.slice(-STDERR_TAIL_LIMIT);
}
