import { spawn } from 'node:child_process';
import { FrameExtractionError } from '../errors.js';

/**
 * Injectable ffmpeg execution, exactly the same shape as
 * `@waggle/narrate`'s `FetchLike` (packages/narrate/src/tts/shared/http.ts):
 * production code defaults to spawning the real `ffmpeg` binary, tests
 * inject a fake that records the argv it was called with instead of
 * actually decoding a video, and every other line of extraction-plan
 * construction and file-path bookkeeping still runs for real against that
 * fake.
 */
export type FfmpegRunner = (args: readonly string[]) => Promise<{
  readonly stdout: string;
  readonly stderr: string;
}>;

/**
 * The real runner: shells out to `ffmpeg` on PATH (or `WAGGLE_FFMPEG_PATH`
 * if set) via `spawn` with an argv array, never a shell string - there is
 * no shell interpolation of a video path or timestamp anywhere in this
 * package (ADR-008's "no secrets in prompts" cousin: no path/value from a
 * project directory should ever be able to break out of an argument
 * boundary).
 */
export function createRealFfmpegRunner(ffmpegPath?: string): FfmpegRunner {
  const bin = ffmpegPath ?? process.env.WAGGLE_FFMPEG_PATH ?? 'ffmpeg';
  return (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        reject(
          new FrameExtractionError(
            `Failed to start "${bin}": ${error.message}. Is ffmpeg installed and on PATH? Set WAGGLE_FFMPEG_PATH to override.`,
            { cause: error },
          ),
        );
      });
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(
          new FrameExtractionError(
            `"${bin} ${args.join(' ')}" exited with code ${String(code)}:\n${stderr}`,
          ),
        );
      });
    });
}
