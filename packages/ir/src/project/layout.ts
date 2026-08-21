import path from 'node:path';

/**
 * The ADR-015 filesystem project layout, as constants and path helpers.
 *
 * This module is the single source of truth for the Waggle project
 * directory shape. It lives in `packages/ir` because `packages/ir` is the
 * lowest layer of the workspace: the IR version writer (which owns
 * `walkthrough.v{n}.json`) needs these paths, and every other package that
 * needs them (`@waggle/cli` today, ingest / studio / replay / compose next)
 * already depends on the IR. `@waggle/cli` re-exports these names so its
 * own import sites stay stable.
 *
 * See library/knowledge/private/architecture/ADR-015-filesystem-project-dirs-no-database.md
 * and library/knowledge/private/waggle/walkthrough-ir-and-project-format.md.
 */

export const MANIFEST_FILENAME = 'waggle.json';
export const CREDENTIALS_FILENAME = 'credentials.json';
export const GITIGNORE_FILENAME = '.gitignore';

/** Subdirectories created by `waggle init`, in ADR-015 order. */
export const PROJECT_SUBDIRS = ['steps', 'narration', 'brand', 'baselines', 'renders'] as const;

export type ProjectSubdir = (typeof PROJECT_SUBDIRS)[number];

/** Subdirectories that get a `.gitkeep` so the empty skeleton is committable. `renders/` is excluded: it is gitignored by design. */
export const TRACKED_EMPTY_SUBDIRS = PROJECT_SUBDIRS.filter((dir) => dir !== 'renders');

export function manifestPath(projectDir: string): string {
  return path.join(projectDir, MANIFEST_FILENAME);
}

export function credentialsPath(projectDir: string): string {
  return path.join(projectDir, CREDENTIALS_FILENAME);
}

export function gitignorePath(projectDir: string): string {
  return path.join(projectDir, GITIGNORE_FILENAME);
}

export function subdirPath(projectDir: string, subdir: ProjectSubdir): string {
  return path.join(projectDir, subdir);
}

/**
 * Matches an immutable IR version file: `walkthrough.v1.json`,
 * `walkthrough.v2.json`, and so on. Version numbers are 1-based, have no
 * leading zeros, and are unbounded (a long-lived project can accumulate
 * hundreds of versions).
 */
export const WALKTHROUGH_FILENAME_PATTERN = /^walkthrough\.v([1-9][0-9]*)\.json$/;

/** The lowest IR version number a project can hold. */
export const FIRST_IR_VERSION = 1;

export function walkthroughFilename(version: number): string {
  if (!Number.isInteger(version) || version < FIRST_IR_VERSION) {
    throw new RangeError(
      `IR version must be an integer >= ${FIRST_IR_VERSION}, received ${String(version)}.`,
    );
  }
  return `walkthrough.v${version}.json`;
}

export function walkthroughPath(projectDir: string, version: number): string {
  return path.join(projectDir, walkthroughFilename(version));
}

/**
 * Returns the version number encoded in an IR filename, or `null` if the
 * name is not an IR version file. Callers use `null` to skip unrelated
 * entries rather than to signal an error.
 */
export function parseWalkthroughVersion(filename: string): number | null {
  const match = WALKTHROUGH_FILENAME_PATTERN.exec(filename);
  if (match === null) {
    return null;
  }
  const captured = match[1];
  if (captured === undefined) {
    return null;
  }
  return Number.parseInt(captured, 10);
}
