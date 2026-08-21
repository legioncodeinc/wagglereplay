import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  readStudioSettings,
  StudioSettingsError,
  studioSettingsPath,
  updateStudioSettings,
  writeStudioSettings,
} from '../../../src/lib/server/settings-store.js';

describe('studio.json settings store (AC6)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function seedDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-settings-'));
    cleanup.push(dir);
    return dir;
  }

  it('returns defaults when studio.json does not exist yet', () => {
    const dir = seedDir();
    expect(readStudioSettings(dir)).toEqual({
      schemaVersion: 1,
      brandKitId: null,
      voiceId: null,
      presetIds: [],
      credentialSetId: null,
    });
  });

  it('round-trips a written settings file', () => {
    const dir = seedDir();
    writeStudioSettings(dir, {
      schemaVersion: 1,
      brandKitId: 'acme',
      voiceId: 'voice-123',
      presetIds: ['16x9', '9x16'],
      credentialSetId: 'example',
    });
    const settings = readStudioSettings(dir);
    expect(settings.brandKitId).toBe('acme');
    expect(settings.presetIds).toEqual(['16x9', '9x16']);
  });

  it('applies a partial update over existing settings', () => {
    const dir = seedDir();
    updateStudioSettings(dir, { brandKitId: 'acme' });
    const next = updateStudioSettings(dir, { voiceId: 'voice-1' });
    expect(next.brandKitId).toBe('acme');
    expect(next.voiceId).toBe('voice-1');
  });

  it('rejects malformed JSON', () => {
    const dir = seedDir();
    writeFileSync(studioSettingsPath(dir), '{not json', 'utf8');
    expect(() => readStudioSettings(dir)).toThrow(StudioSettingsError);
  });

  it('rejects a file that fails schema validation', () => {
    const dir = seedDir();
    writeFileSync(studioSettingsPath(dir), JSON.stringify({ schemaVersion: 1 }), 'utf8');
    expect(() => readStudioSettings(dir)).toThrow(StudioSettingsError);
  });
});
