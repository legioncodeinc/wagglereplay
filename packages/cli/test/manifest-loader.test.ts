// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CliExitError } from '../src/errors.js';
import { ExitCode } from '../src/exit-codes.js';
import { loadManifest } from '../src/manifest/load-manifest.js';

describe('loadManifest', () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-manifest-'));
    cleanupDirs.push(dir);
    return dir;
  }

  it('names the file and JSON path for a schema violation instead of a generic message', () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, 'waggle.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: '',
        createdAt: 'not-a-date',
        currentIrVersion: null,
        presets: {},
        defaults: {},
      }),
    );

    expect.assertions(4);
    try {
      loadManifest(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(CliExitError);
      const err = error as CliExitError;
      expect(err.code).toBe(ExitCode.MANIFEST_INVALID);
      expect(err.message).toContain(path.join(dir, 'waggle.json'));
      expect(err.message).toMatch(/name|createdAt/);
    }
  });

  it('rejects unknown top-level keys (strict schema catches typos)', () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, 'waggle.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'demo',
        createdAt: new Date().toISOString(),
        currentIrVersion: null,
        presets: {},
        defaults: {},
        typoField: true,
      }),
    );

    expect.assertions(2);
    try {
      loadManifest(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(CliExitError);
      expect((error as CliExitError).message).toContain('typoField');
    }
  });

  it('reports a line and column for malformed JSON', () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, 'waggle.json'), '{\n  "name": "demo",\n  broken\n}');

    expect.assertions(3);
    try {
      loadManifest(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(CliExitError);
      expect((error as CliExitError).code).toBe(ExitCode.MANIFEST_INVALID);
      expect((error as CliExitError).message).toMatch(/line \d+, column \d+/);
    }
  });

  it('reports PROJECT_NOT_FOUND when waggle.json is missing', () => {
    const dir = tempDir();

    expect.assertions(2);
    try {
      loadManifest(dir);
    } catch (error) {
      expect(error).toBeInstanceOf(CliExitError);
      expect((error as CliExitError).code).toBe(ExitCode.PROJECT_NOT_FOUND);
    }
  });
});
