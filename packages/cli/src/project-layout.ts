import path from 'node:path';

/**
 * The ADR-015 filesystem project layout, as constants and path helpers.
 *
 * See library/knowledge/private/architecture/ADR-015-filesystem-project-dirs-no-database.md
 * and library/knowledge/private/waggle/walkthrough-ir-and-project-format.md.
 * The Walkthrough IR files themselves (walkthrough.v{n}.json) are owned by
 * prd-002 and are not created here; `waggle init` only lays out the
 * directory skeleton and the project manifest.
 */

export const MANIFEST_FILENAME = 'waggle.json';
export const CREDENTIALS_FILENAME = 'credentials.json';
export const GITIGNORE_FILENAME = '.gitignore';

/** Subdirectories created by `waggle init`, in ADR-015 order. */
export const PROJECT_SUBDIRS = ['steps', 'narration', 'brand', 'baselines', 'renders'] as const;

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

export function subdirPath(projectDir: string, subdir: (typeof PROJECT_SUBDIRS)[number]): string {
  return path.join(projectDir, subdir);
}
