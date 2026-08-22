// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { ScreencastCapture, ScreencastError } from '../src/capture/screencast.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('ScreencastCapture process lifecycle', () => {
  it('rejects invalid capture geometry before launching a process', async () => {
    const capture = new ScreencastCapture({
      page: {} as Page,
      outputPath: 'unused.mp4',
      fps: 0,
      maxWidth: 640,
      maxHeight: 360,
    });
    await expect(capture.start()).rejects.toThrow(/fps must be a positive finite number/);
  });

  it('surfaces an asynchronous spawn error instead of hanging', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-screencast-'));
    tempDirs.push(dir);
    const page = {
      context() {
        throw new Error('CDP must not be reached when ffmpeg cannot spawn');
      },
    } as unknown as Page;
    const capture = new ScreencastCapture({
      page,
      outputPath: path.join(dir, 'capture.mp4'),
      fps: 30,
      maxWidth: 640,
      maxHeight: 360,
      env: {
        ...process.env,
        WAGGLE_FFMPEG_PATH: path.join(dir, 'missing-ffmpeg-binary'),
      },
    });

    await expect(capture.start()).rejects.toThrow(ScreencastError);
    await expect(capture.start()).rejects.toThrow(/already started/);
  });
});
