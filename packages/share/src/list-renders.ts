import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { subdirPath } from '@waggle/ir';
import { parseRenderFilename, type RenderOutputIdentity } from './naming.js';

/**
 * `renders/` subdirectories this package must never treat as render
 * outputs to manage: `.work/` is `@waggle/compose`'s own scratch space
 * (`WORK_SUBDIR` in `render-project.ts`), and `share/` is this package's
 * own bundle output (`SHARE_SUBDIR` in `bundle/build-bundle.ts`). Both are
 * excluded from the scan so `waggle clean` cannot mistake a compositor
 * intermediate or a distributed share bundle for a stale render.
 */
export const RENDER_WORK_SUBDIR = '.work';
export const RENDER_SHARE_SUBDIR = 'share';

export interface RenderOutputInfo extends RenderOutputIdentity {
  readonly path: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
}

/**
 * Lists every render output directly inside `<projectDir>/renders/` whose
 * filename matches the stable naming scheme (AC1), oldest first by
 * modification time. Anything else in that directory (a stray file, the
 * `.work/` and `share/` subdirectories) is silently skipped: this
 * function's job is to find renders, not to validate the directory's
 * hygiene.
 */
export function listRenderOutputs(projectDir: string): RenderOutputInfo[] {
  const rendersDir = subdirPath(projectDir, 'renders');
  if (!existsSync(rendersDir)) {
    return [];
  }

  const entries: RenderOutputInfo[] = [];
  for (const entry of readdirSync(rendersDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const identity = parseRenderFilename(entry.name);
    if (identity === null) {
      continue;
    }
    const filePath = path.join(rendersDir, entry.name);
    const stat = statSync(filePath);
    entries.push({ ...identity, path: filePath, sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
  }

  return entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/** Renders in `renders/` for one exact IR version, in stable (filename) order. */
export function renderOutputsForVersion(projectDir: string, irVersion: number): RenderOutputInfo[] {
  return listRenderOutputs(projectDir)
    .filter((output) => output.irVersion === irVersion)
    .sort((a, b) => a.filename.localeCompare(b.filename));
}
