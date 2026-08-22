// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';

/**
 * Generates a short, deterministic-content-irrelevant synthetic video with
 * real ffmpeg (`testsrc` lavfi source), so frame-extraction tests are
 * hermetic and never depend on a captured webm (per this PRD's brief).
 * Only the video's DURATION matters to what this package tests; its
 * pixel content is never asserted on.
 */
export function createSyntheticVideo(outPath: string, durationSeconds: number): void {
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=320x240:rate=2:duration=${String(durationSeconds)}`,
    '-pix_fmt',
    'yuv420p',
    outPath,
  ];
  const result = spawnSync('ffmpeg', args, { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg testsrc generation failed (status ${String(result.status)}): ${result.stderr.toString('utf8')}`,
    );
  }
}
