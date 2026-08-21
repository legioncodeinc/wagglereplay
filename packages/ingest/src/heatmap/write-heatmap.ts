import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { HeatmapDocument } from './schema.js';

export const HEATMAP_FILENAME = 'heatmap.json';

export function heatmapPath(projectDir: string): string {
  return path.join(projectDir, HEATMAP_FILENAME);
}

/** Same serialization convention as `@waggle/ir`'s version writer: two-space JSON, trailing newline. */
export function writeHeatmap(projectDir: string, document: HeatmapDocument): string {
  const filePath = heatmapPath(projectDir);
  writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return filePath;
}
