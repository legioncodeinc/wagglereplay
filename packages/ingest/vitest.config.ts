// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // ffmpeg keyframe extraction and the real fixture-app-driven fixture
    // shell out to a real process / real HTTP server; give them more room
    // than the default 5s per test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
