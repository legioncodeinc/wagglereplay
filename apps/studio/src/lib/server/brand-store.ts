// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BrandKitError,
  brandDir,
  DEFAULT_BRAND_KIT,
  DEFAULT_BRAND_KIT_ID,
  parseBrandKit,
} from '@waggle/compose';
import type { BrandKitSummary } from '$lib/types.js';

/**
 * Lists brand kits available to the AC6 settings panel's picker: every
 * `brand/<id>.json` in the project plus the built-in default kit
 * (`@waggle/compose`'s `DEFAULT_BRAND_KIT`, which `waggle render` already
 * falls back to when `brand/` has no file for the requested id).
 */

export function listBrandKits(projectDir: string): BrandKitSummary[] {
  const summaries: BrandKitSummary[] = [
    { id: DEFAULT_BRAND_KIT_ID, name: DEFAULT_BRAND_KIT.name, source: 'built-in' },
  ];

  const dir = brandDir(projectDir);
  if (!existsSync(dir)) {
    return summaries;
  }

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(dir, entry);
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      const kit = parseBrandKit(parsed, `"${filePath}"`);
      if (kit.id === DEFAULT_BRAND_KIT_ID) continue; // a project file overriding "default" still shows once
      summaries.push({ id: kit.id, name: kit.name, source: 'project' });
    } catch (error) {
      // A malformed kit file must not take the whole settings panel down;
      // waggle render will surface the same file's problem loudly (via
      // BrandKitError) the moment someone actually tries to render with it.
      if (!(error instanceof BrandKitError) && !(error instanceof SyntaxError)) {
        throw error;
      }
    }
  }

  return summaries;
}
