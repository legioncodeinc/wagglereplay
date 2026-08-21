import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';

/**
 * `waggle studio`'s launch mechanics (prd-005 AC1), split out of
 * ../commands/studio.ts so each half is independently unit-testable:
 * resolving `@waggle/studio`'s built adapter-node server entry, and
 * probing whether the target port is free before spawning anything.
 *
 * `@waggle/studio` ships as a real SvelteKit app (ADR-014: "Studio runs
 * as `node build/index.js` on the author's machine", per that app's own
 * `svelte.config.js`), not a library this package imports at compile
 * time - it is resolved at RUNTIME via `require.resolve`, the same way
 * `node` itself locates any package. This is why `@waggle/studio` is a
 * plain `dependencies` entry in package.json (for the pnpm workspace
 * symlink) but never a static `import` here.
 */

export function studioServerEntryPath(): string {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve('@waggle/studio/package.json');
  return path.join(path.dirname(packageJsonPath), 'build', 'index.js');
}

/**
 * Resolves the built server entry, throwing `CliExitError` with
 * `ExitCode.STUDIO_BUILD_MISSING` if `@waggle/studio` has not been built
 * yet (`build/index.js` does not exist).
 */
export function resolveStudioServerEntry(): string {
  const entryPath = studioServerEntryPath();
  if (!existsSync(entryPath)) {
    throw new CliExitError(
      ExitCode.STUDIO_BUILD_MISSING,
      `waggle studio: "@waggle/studio" has not been built yet ("${entryPath}" does not exist). ` +
        'Run "pnpm --filter @waggle/studio build" (or "pnpm build" from the workspace root) first.',
    );
  }
  return entryPath;
}

/** Resolves `true` when `host:port` is free to bind, `false` when something is already listening there. */
export function checkPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(error);
    });
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, host);
  });
}

/** Throws `CliExitError` with `ExitCode.STUDIO_PORT_UNAVAILABLE` when `host:port` is already taken. */
export async function assertPortAvailable(port: number, host: string): Promise<void> {
  const available = await checkPortAvailable(port, host);
  if (!available) {
    throw new CliExitError(
      ExitCode.STUDIO_PORT_UNAVAILABLE,
      `waggle studio: ${host}:${String(port)} is already in use. Pass --port <port> to use a different one.`,
    );
  }
}
