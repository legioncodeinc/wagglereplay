// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  FFMPEG_PATH_ENV_VAR,
  FFPROBE_PATH_ENV_VAR,
  resolveFfmpegPath,
  resolveFfprobePath,
  run,
} from '../src/ffmpeg/run-ffmpeg.js';

/**
 * The one test in this package that exists purely to fail well.
 *
 * `@waggle/compose` is an ffmpeg compositor: ADR-003 makes ffmpeg the
 * default and currently only backend, and the tests that prove the package
 * works at all (AC7 idempotency, AC8 kit swapping, and "does ffmpeg
 * actually accept the graph we generate") cannot run without it.
 *
 * This suite therefore does NOT skip when ffmpeg is missing, deliberately.
 * A skipped idempotency test and a passing idempotency test look identical
 * on a green dashboard, and the claim they defend is exactly the kind that
 * rots silently. Hard failure is the honest signal for this package.
 *
 * What this file adds is legibility. Without it, a contributor with no
 * ffmpeg meets a wall of failures thrown from inside fixture synthesis,
 * several layers below the actual problem. With it, the first thing they
 * read is the requirement and how to satisfy it.
 */

const REQUIRED_FILTERS = [
  // Karaoke captions, the text watermark, and the card titles (AC2).
  'subtitles',
  // Every sprite and image layer (AC3, AC4).
  'overlay',
  // Auto-zoom and the ADR-011 reframe window (AC5).
  'crop',
  'scale',
  // Intro and outro plates, which extend rather than cover the timeline.
  'tpad',
  // Narration ducking (AC6).
  'sidechaincompress',
] as const;

function installationHelp(): string {
  return [
    '',
    '@waggle/compose composites with ffmpeg (ADR-003), so its test suite requires it.',
    'Install ffmpeg 9.x built with libx264 and libass, or point these at an existing build:',
    `  ${FFMPEG_PATH_ENV_VAR}=/path/to/ffmpeg`,
    `  ${FFPROBE_PATH_ENV_VAR}=/path/to/ffprobe`,
    '',
    'These tests do not skip when ffmpeg is absent. That is deliberate: a skipped',
    'render-idempotency test is indistinguishable from a passing one, and the render',
    'it would have stopped checking is the entire reason this package exists.',
  ].join('\n');
}

describe('preflight: the ffmpeg this package composites with', () => {
  it('is installed and runnable', async () => {
    const binary = resolveFfmpegPath();
    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run(binary, ['-hide_banner', '-version']);
    } catch (error) {
      // `FfmpegNotFoundError` already names the binary and the env vars;
      // this only appends the why-we-do-not-skip explanation.
      throw new Error(`${(error as Error).message}${installationHelp()}`);
    }
    expect(result.code, `"${binary} -version" exited non-zero.${installationHelp()}`).toBe(0);
    expect(
      result.stdout,
      `"${binary}" did not identify itself as ffmpeg.${installationHelp()}`,
    ).toMatch(/^ffmpeg version/);
  });

  it('has ffprobe alongside it, which the source-video probe needs', async () => {
    const binary = resolveFfprobePath();
    const result = await run(binary, ['-hide_banner', '-version']);
    expect(result.code, `"${binary} -version" exited non-zero.${installationHelp()}`).toBe(0);
    expect(result.stdout).toMatch(/^ffprobe version/);
  });

  it('was built with the encoders and filters the compositor generates', async () => {
    const binary = resolveFfmpegPath();

    const encoders = await run(binary, ['-hide_banner', '-encoders']);
    expect(encoders.code).toBe(0);
    // A build without libx264 fails at the very end of a render, after
    // every frame has already been composited.
    expect(
      encoders.stdout,
      `"${binary}" has no libx264 encoder, so no render can be written.${installationHelp()}`,
    ).toContain('libx264');
    expect(encoders.stdout).toContain('aac');

    const filters = await run(binary, ['-hide_banner', '-filters']);
    expect(filters.code).toBe(0);
    // Each row is `flags name inputs->outputs description`, so the name is
    // the second whitespace-separated token. Parsing that column beats a
    // substring search, which would match a filter name appearing inside
    // some other filter's description.
    const filterNames = new Set(
      filters.stdout
        .split(/\r?\n/)
        .map((line) => line.trim().split(/\s+/)[1])
        .filter((name): name is string => name !== undefined),
    );
    for (const filter of REQUIRED_FILTERS) {
      // A build without libass silently has no `subtitles` filter, and the
      // failure surfaces as an opaque filter-graph parse error.
      expect(
        filterNames.has(filter),
        `"${binary}" has no "${filter}" filter, which the generated graph uses.${installationHelp()}`,
      ).toBe(true);
    }
  });
});
