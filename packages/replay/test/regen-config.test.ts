// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ReplayPresetError } from '../src/presets/registry.js';
import { resolveConfiguredPresets } from '../src/regen/orchestrate.js';

const tempDirs: string[] = [];

function projectDir(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-regen-config-'));
  tempDirs.push(dir);
  writeFileSync(path.join(dir, 'waggle.json'), JSON.stringify(manifest), 'utf8');
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveConfiguredPresets', () => {
  it('rejects an unsupported explicit replay preset', () => {
    const dir = projectDir({ presets: {} });
    expect(() => resolveConfiguredPresets(dir, ['4x5'])).toThrow(ReplayPresetError);
    expect(() => resolveConfiguredPresets(dir, ['4x5'])).toThrow(/unknown replay preset "4x5"/i);
  });

  it('rejects unsupported studio presets instead of dropping them', () => {
    const dir = projectDir({ presets: {} });
    writeFileSync(
      path.join(dir, 'studio.json'),
      JSON.stringify({ presetIds: ['16x9', 'cinema'] }),
      'utf8',
    );
    expect(() => resolveConfiguredPresets(dir)).toThrow(/cinema/);
  });

  it('rejects unsupported manifest presets instead of silently defaulting', () => {
    const dir = projectDir({ presets: { '4x5': { width: 1080, height: 1350 } } });
    expect(() => resolveConfiguredPresets(dir)).toThrow(ReplayPresetError);
    expect(() => resolveConfiguredPresets(dir)).toThrow(/4x5/);
  });

  it('preserves aliases as distinct replay jobs', () => {
    const dir = projectDir({ presets: {} });
    const configured = resolveConfiguredPresets(dir, ['16x9', 'desktop']);
    expect(configured.presetIds).toEqual(['16x9', 'desktop']);
  });
});
