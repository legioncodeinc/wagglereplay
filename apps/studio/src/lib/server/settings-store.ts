import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  defaultStudioSettings,
  STUDIO_SETTINGS_FILENAME,
  STUDIO_SETTINGS_SCHEMA_VERSION,
  type StudioSettings,
  StudioSettingsSchema,
} from '$lib/schemas/studio-settings.js';

/**
 * File I/O for `studio.json` (AC6). The schema itself lives in
 * `$lib/schemas/studio-settings.ts` so client-side code can import the
 * TYPE without pulling `node:fs` into the browser bundle; this module is
 * the server-only read/write half.
 */

export function studioSettingsPath(projectDir: string): string {
  return path.join(projectDir, STUDIO_SETTINGS_FILENAME);
}

export class StudioSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioSettingsError';
  }
}

/** Reads `studio.json`, or returns the defaults when the project has none yet (a fresh recording). */
export function readStudioSettings(projectDir: string): StudioSettings {
  const filePath = studioSettingsPath(projectDir);
  if (!existsSync(filePath)) {
    return defaultStudioSettings();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new StudioSettingsError(`"${filePath}" is not valid JSON: ${(error as Error).message}`);
  }

  const result = StudioSettingsSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new StudioSettingsError(`"${filePath}" failed studio settings validation:\n${detail}`);
  }
  return result.data;
}

/** Writes `studio.json`, validating first so a bad partial update never lands on disk. */
export function writeStudioSettings(projectDir: string, settings: StudioSettings): void {
  const validated = StudioSettingsSchema.parse(settings);
  writeFileSync(studioSettingsPath(projectDir), `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
}

/** Applies a partial update over the settings currently on disk (or the defaults) and persists the result. */
export function updateStudioSettings(
  projectDir: string,
  patch: Partial<StudioSettings>,
): StudioSettings {
  const current = readStudioSettings(projectDir);
  const next: StudioSettings = {
    ...current,
    ...patch,
    schemaVersion: STUDIO_SETTINGS_SCHEMA_VERSION,
  };
  writeStudioSettings(projectDir, next);
  return next;
}
