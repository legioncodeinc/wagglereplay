import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Real ffmpeg renders are the slow tests in this package; the default
    // 5s timeout is far too short for an encode.
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
