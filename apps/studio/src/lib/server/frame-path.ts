// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import { subdirPath } from '@waggle/ir';

/**
 * Resolves a step frame image's on-disk path from three path SEGMENTS
 * (never a joined path) that ride straight in the URL
 * (`/api/frames/[version]/[stepDir]/[fileName]`, ../../routes), so this is
 * the one place that decides whether a request may read a file at all.
 *
 * Every segment is checked against an exact allow-list pattern before it
 * touches `path.join`: an attacker-controlled `fileName` of `../../../etc/passwd`
 * never reaches the filesystem, because it does not match
 * `FRAME_FILENAME_PATTERN` and this function throws before any `path.join`
 * happens. This mirrors `@waggle/ingest`'s own naming
 * (`packages/ingest/src/frames/extraction-plan.ts`): `before.png`,
 * `click.png`, `settled.png`, `frame_t<+->N.png`.
 */

const STEP_DIR_PATTERN = /^step-\d{3,}$/;
const FRAME_FILENAME_PATTERN = /^(before|click|settled)\.png$|^frame_t[+-]\d+\.png$/;

export class InvalidFramePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFramePathError';
  }
}

export function resolveFramePath(
  projectDir: string,
  versionRaw: string,
  stepDir: string,
  fileName: string,
): string {
  if (!/^\d+$/.test(versionRaw) || Number.parseInt(versionRaw, 10) < 1) {
    throw new InvalidFramePathError(`Invalid IR version "${versionRaw}".`);
  }
  if (!STEP_DIR_PATTERN.test(stepDir)) {
    throw new InvalidFramePathError(`Invalid step directory "${stepDir}".`);
  }
  if (!FRAME_FILENAME_PATTERN.test(fileName)) {
    throw new InvalidFramePathError(`Invalid frame file name "${fileName}".`);
  }

  const stepsRoot = subdirPath(projectDir, 'steps');
  return path.join(stepsRoot, `v${versionRaw}`, stepDir, fileName);
}
