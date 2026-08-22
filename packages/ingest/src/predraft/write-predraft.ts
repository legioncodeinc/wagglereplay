// SPDX-License-Identifier: AGPL-3.0-or-later
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PreDraftDocument } from './schema.js';

export const PREDRAFT_FILENAME = 'predraft.json';

export function predraftPath(projectDir: string): string {
  return path.join(projectDir, PREDRAFT_FILENAME);
}

/** Same serialization convention as `@waggle/ir`'s version writer and `../heatmap/write-heatmap.ts`. */
export function writePreDraft(projectDir: string, document: PreDraftDocument): string {
  const filePath = predraftPath(projectDir);
  writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return filePath;
}
