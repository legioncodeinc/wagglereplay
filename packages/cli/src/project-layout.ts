/**
 * The ADR-015 filesystem project layout.
 *
 * The definitions moved to `@waggle/ir` in prd-002: the immutable IR
 * version writer owns `walkthrough.v{n}.json` and the `waggle.json`
 * pointer, so the project shape has to be defined at or below the IR
 * layer, and `@waggle/ir` is the workspace's lowest layer. This module
 * stays as the CLI's import site so nothing inside the CLI has to care
 * where the definitions live.
 *
 * See library/knowledge/private/architecture/ADR-015-filesystem-project-dirs-no-database.md.
 */

export type { ProjectSubdir } from '@waggle/ir';
export {
  CREDENTIALS_FILENAME,
  credentialsPath,
  FIRST_IR_VERSION,
  GITIGNORE_FILENAME,
  gitignorePath,
  MANIFEST_FILENAME,
  manifestPath,
  PROJECT_SUBDIRS,
  parseWalkthroughVersion,
  subdirPath,
  TRACKED_EMPTY_SUBDIRS,
  WALKTHROUGH_FILENAME_PATTERN,
  walkthroughFilename,
  walkthroughPath,
} from '@waggle/ir';
