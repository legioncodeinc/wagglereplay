// SPDX-License-Identifier: AGPL-3.0-or-later
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// The `sveltekit()` plugin is what makes `$lib/...` and `$app/...` aliases
// resolve under plain `vitest run`, exactly as they do under `vite dev`/
// `vite build` - without it, every server module that imports `$lib/...`
// (the norm in this app; see e.g. `$lib/server/settings-store.ts`) fails
// to resolve under test.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    environment: 'node',
  },
});
