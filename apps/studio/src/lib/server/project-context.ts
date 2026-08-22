// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import path from 'node:path';
import { manifestPath } from '@waggle/ir';

/**
 * The Waggle project directory Studio is editing (AC1: "Studio server
 * boots on localhost with a project dir argument").
 *
 * `waggle studio` (packages/cli/src/commands/studio.ts) spawns this
 * SvelteKit app's adapter-node server as a plain Node child process and
 * passes the project directory the only way a Node process can hand data
 * to an already-built server bundle: an environment variable. Every
 * server-only route and lib module reads the resolved project directory
 * through this module rather than `process.env` directly, so there is
 * exactly one place that validates the variable is set and points at a
 * real Waggle project.
 */

export class ProjectContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectContextError';
  }
}

let cachedProjectDir: string | null = null;

/**
 * Resolves and caches the project directory for the lifetime of the
 * server process. Throws `ProjectContextError` (surfaced as a 500 by
 * SvelteKit's error handling) if `WAGGLE_PROJECT_DIR` is unset or does not
 * point at a directory with a `waggle.json` manifest, since every route in
 * this app is meaningless without a real project to read and write.
 */
export function getProjectDir(): string {
  if (cachedProjectDir !== null) {
    return cachedProjectDir;
  }

  const raw = process.env.WAGGLE_PROJECT_DIR;
  if (raw === undefined || raw.trim() === '') {
    throw new ProjectContextError(
      'WAGGLE_PROJECT_DIR is not set. Studio must be launched by "waggle studio <project>" ' +
        '(packages/cli), which passes the resolved project directory as this environment variable.',
    );
  }

  const resolved = path.resolve(raw);
  if (!existsSync(manifestPath(resolved))) {
    throw new ProjectContextError(
      `WAGGLE_PROJECT_DIR="${resolved}" has no waggle.json manifest. Run "waggle init <name>" ` +
        'first, or point WAGGLE_PROJECT_DIR at an existing Waggle project directory.',
    );
  }

  cachedProjectDir = resolved;
  return cachedProjectDir;
}

/** Test-only: clears the cached project directory so a fresh env var takes effect. */
export function resetProjectDirCacheForTests(): void {
  cachedProjectDir = null;
}
