import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // ADR-014: local-first runtime. Studio runs as `node build/index.js` on
    // the author's machine, launched by `waggle studio` / `waggle record`
    // (prd-005); it is not deployed to a hosted platform.
    adapter: adapter(),
  },
};

export default config;
