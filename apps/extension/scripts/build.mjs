// esbuild is this Bee's chosen bundler for the MV3 build (Bee-decision:
// esbuild over vite+CRX or a hand-rolled tsc watch, because the extension
// has exactly three real entry points -- a module-type service worker, one
// isolated-world content script, one MAIN-world script, one offscreen
// document -- and esbuild bundles each to a single, dependency-free file
// in milliseconds with zero framework config, which is all this shape
// needs; it also matches the esbuild the rest of the workspace already
// pulls in transitively via `tsx` (packages/cli), so no new bundler
// concept enters the monorepo).
//
// Lives in apps/extension/scripts/ (tracked, like this package's other
// build-time script generate-ingest-fixture.ts), not in a directory named
// build/ or dist/: both those names are covered by gitignore rules meant
// for real build OUTPUT (the root .gitignore's `build/` line exists for
// SvelteKit's apps/studio/build, and this package's own .gitignore ignores
// dist/, its actual output directory below). A build INPUT belongs
// somewhere gitignore never reaches, and scripts/ already is that place.
//
// Produces the unpacked, loadable extension directory at apps/extension/dist:
//   dist/manifest.json        (copied from ../manifest.json)
//   dist/background.js        (ESM, matches manifest "type": "module")
//   dist/content-script.js    (IIFE, isolated world)
//   dist/route-main-world.js  (IIFE, injected into MAIN world at capture start)
//   dist/offscreen.js         (ESM, offscreen document)
//   dist/offscreen.html       (copied from ../src/offscreen/offscreen.html)

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(packageDir, 'dist');

// @waggle/ir (packages/ir) is a completed, out-of-scope-to-modify package
// (this Bee's mandate is apps/extension only) whose single barrel export
// (src/index.ts) re-exports both its browser-safe zod schemas AND its
// filesystem-backed project-layout/version-writer helpers (project/layout.ts,
// version/writer.ts) from the same module graph. This extension's browser
// bundles only ever import the zod-schema half at runtime, but esbuild must
// still statically resolve every `node:fs`/`node:path` import it can reach
// while walking that graph, which fails under `platform: 'browser'` (those
// specifiers only resolve under `platform: 'node'`). This plugin redirects
// just those two builtins to inert stubs so resolution succeeds; nothing in
// this extension's code path ever calls into them; the schema exports it
// actually uses are already implemented with framework-agnostic code, do
// not touch `node:fs`/`node:path`, and are otherwise untouched.
/** @type {import('esbuild').Plugin} */
const stubNodeFsPathForBrowserBuild = {
  name: 'stub-node-fs-path-for-browser-build',
  setup(build) {
    build.onResolve({ filter: /^node:(fs|fs\/promises|path)$/ }, () => ({
      path: 'waggle-node-builtin-stub',
      namespace: 'waggle-stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'waggle-stub' }, () => ({
      loader: 'js',
      contents: `
        function unavailable() {
          throw new Error('apps/extension: node:fs/node:path are unavailable in the browser bundle');
        }
        export default new Proxy({}, { get: unavailable });
        export const readFileSync = unavailable;
        export const writeFileSync = unavailable;
        export const readdirSync = unavailable;
        export const existsSync = unavailable;
        export const mkdirSync = unavailable;
        export const join = (...parts) => parts.join('/');
        export const dirname = (p) => p.split('/').slice(0, -1).join('/');
      `,
    }));
  },
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    entryPoints: [path.join(packageDir, 'src/background/service-worker.ts')],
    outfile: path.join(distDir, 'background.js'),
    format: 'esm',
  },
  {
    entryPoints: [path.join(packageDir, 'src/content/content-script.ts')],
    outfile: path.join(distDir, 'content-script.js'),
    format: 'iife',
  },
  {
    entryPoints: [path.join(packageDir, 'src/content/route-main-world-bootstrap.ts')],
    outfile: path.join(distDir, 'route-main-world.js'),
    format: 'iife',
  },
  {
    entryPoints: [path.join(packageDir, 'src/offscreen/recorder.ts')],
    outfile: path.join(distDir, 'offscreen.js'),
    format: 'esm',
  },
];

async function main() {
  await mkdir(distDir, { recursive: true });

  for (const build of builds) {
    await esbuild.build({
      ...build,
      bundle: true,
      platform: 'browser',
      target: 'chrome116',
      sourcemap: true,
      minify: true,
      logLevel: 'info',
      plugins: [stubNodeFsPathForBrowserBuild],
    });
  }

  await cp(
    path.join(packageDir, 'src/offscreen/offscreen.html'),
    path.join(distDir, 'offscreen.html'),
  );

  const manifestRaw = await readFile(path.join(packageDir, 'manifest.json'), 'utf8');
  await writeFile(path.join(distDir, 'manifest.json'), manifestRaw);

  console.log(`apps/extension: built unpacked extension at ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
