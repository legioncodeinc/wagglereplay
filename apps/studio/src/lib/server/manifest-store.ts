// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { manifestPath, type WaggleManifest, WaggleManifestSchema } from '@waggle/ir';

/** Reads and validates `waggle.json`. `project-context.ts` already proved the file exists before any route calls this. */
export function readManifest(projectDir: string): WaggleManifest {
  const raw = readFileSync(manifestPath(projectDir), 'utf8');
  return WaggleManifestSchema.parse(JSON.parse(raw));
}
