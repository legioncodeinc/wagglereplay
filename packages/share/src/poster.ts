// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveFfmpegPath } from '@waggle/compose';
import { type FfmpegRunner, ffmpegStderrTail, runFfmpeg } from './ffmpeg-run.js';

/**
 * The share page's poster frame (prd-008 AC2): a single JPEG grabbed from
 * the primary render, shown before the video plays and while it loads.
 * `@waggle/compose`'s own `FfmpegCompositor` covers encoding the video
 * itself; this is a much smaller, one-frame job the render pipeline has no
 * reason to own.
 */

export class PosterGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosterGenerationError';
  }
}

export interface GeneratePosterOptions {
  readonly sourcePath: string;
  readonly outputPath: string;
  /** Seek position within the source video. Clamped to a sane frame if the video is shorter. */
  readonly atMs: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly runner?: FfmpegRunner;
}

/**
 * Picks a poster timestamp that is unlikely to be a blank first frame
 * (many recordings open on a still, unloaded page) without running past a
 * short render: one second in, or the midpoint of anything shorter than
 * two seconds.
 */
export function choosePosterTimeMs(durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }
  return durationMs < 2000 ? Math.floor(durationMs / 2) : 1000;
}

export async function generatePoster(options: GeneratePosterOptions): Promise<void> {
  const env = options.env ?? process.env;
  const runner = options.runner ?? runFfmpeg;
  const binary = resolveFfmpegPath(env);
  const seekSeconds = (Math.max(0, options.atMs) / 1000).toFixed(3);

  const result = await runner(binary, [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-ss',
    seekSeconds,
    '-i',
    options.sourcePath,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    options.outputPath,
  ]);

  if (result.code !== 0) {
    throw new PosterGenerationError(
      `Could not generate a poster image from "${options.sourcePath}":\n${ffmpegStderrTail(result.stderr)}`,
    );
  }
}
