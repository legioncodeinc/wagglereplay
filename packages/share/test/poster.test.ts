// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { choosePosterTimeMs, generatePoster, PosterGenerationError } from '../src/poster.js';
import { renderPresets, stageProject } from './fixtures.js';

describe('choosePosterTimeMs', () => {
  it('picks the one-second mark for anything two seconds or longer', () => {
    expect(choosePosterTimeMs(5000)).toBe(1000);
    expect(choosePosterTimeMs(2000)).toBe(1000);
  });

  it('picks the midpoint for a render shorter than two seconds', () => {
    expect(choosePosterTimeMs(1000)).toBe(500);
  });

  it('never returns a negative time', () => {
    expect(choosePosterTimeMs(0)).toBe(0);
  });
});

describe('generatePoster', () => {
  it('reports a launch/encode failure with the real command context', async () => {
    await expect(
      generatePoster({
        sourcePath: '/does/not/exist.mp4',
        outputPath: '/tmp/poster-that-will-not-be-written.jpg',
        atMs: 0,
      }),
    ).rejects.toThrow(PosterGenerationError);
  });

  it('extracts a real JPEG frame from a real rendered MP4', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const sourcePath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    const outputPath = path.join(projectDir, 'renders', 'poster.jpg');

    await generatePoster({ sourcePath, outputPath, atMs: 500 });

    expect(existsSync(outputPath)).toBe(true);
  });
});
