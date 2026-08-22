// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { subdirPath } from '@waggle/ir';
import { DEFAULT_BRAND_KIT, DEFAULT_BRAND_KIT_ID } from './defaults.js';
import { type BrandKit, BrandKitError, BrandKitSchema, parseBrandKit } from './schema.js';

/**
 * Reading and writing `brand/<id>.json` inside an ADR-015 project
 * directory.
 *
 * `brand/` is one of the subdirectories `waggle init` already creates
 * (see @waggle/ir's PROJECT_SUBDIRS), so a kit needs no new project
 * layout, only a filename convention: the kit's own `id` is the file stem,
 * which keeps "which kit produced this render" answerable from the render
 * metadata alone.
 */

export function brandDir(projectDir: string): string {
  return subdirPath(projectDir, 'brand');
}

export function brandKitPath(projectDir: string, kitId: string): string {
  return path.join(brandDir(projectDir), `${kitId}.json`);
}

/**
 * Loads `brand/<kitId>.json`. Falls back to the built-in default kit ONLY
 * for the default id and ONLY when no file exists, so a project that has
 * committed a kit never silently renders with different branding because
 * of a typo in the filename.
 */
export function loadBrandKit(projectDir: string, kitId: string = DEFAULT_BRAND_KIT_ID): BrandKit {
  const filePath = brandKitPath(projectDir, kitId);

  if (!existsSync(filePath)) {
    if (kitId === DEFAULT_BRAND_KIT_ID) {
      return DEFAULT_BRAND_KIT;
    }
    throw new BrandKitError(
      `Brand kit "${kitId}" not found: "${filePath}" does not exist. Create it, or omit --brand-kit to use the built-in "${DEFAULT_BRAND_KIT_ID}" kit.`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new BrandKitError(
      `Brand kit "${kitId}" could not be read from "${filePath}": ${(error as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new BrandKitError(`"${filePath}" is not valid JSON: ${(error as Error).message}`);
  }

  const kit = parseBrandKit(parsed, `"${filePath}"`);
  if (kit.id !== kitId) {
    throw new BrandKitError(
      `"${filePath}" declares id "${kit.id}" but is filed under "${kitId}.json". The kit id and its filename stem must match.`,
    );
  }
  return kit;
}

/** Serializes a brand kit the way every Waggle project file is written. */
export function serializeBrandKit(kit: BrandKit): string {
  return `${JSON.stringify(BrandKitSchema.parse(kit), null, 2)}\n`;
}

/** Writes `brand/<kit.id>.json`, re-validating before it touches disk. */
export function writeBrandKit(projectDir: string, kit: BrandKit): string {
  const validated = BrandKitSchema.parse(kit);
  const filePath = brandKitPath(projectDir, validated.id);
  writeFileSync(filePath, serializeBrandKit(validated), 'utf8');
  return filePath;
}
