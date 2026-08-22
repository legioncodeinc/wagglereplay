// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AC4, the last line of defence.
 *
 * `writeNextIrVersion` opens the new version file with the `wx` flag, so
 * even if the directory listing and the filesystem disagree the write
 * fails rather than clobbering an existing version. That disagreement
 * cannot be produced by ordinary means, so this file mocks `readdirSync`
 * to hide an existing `walkthrough.v1.json` and proves the guard holds.
 *
 * The mock lives in its own test file because mocking `node:fs` for the
 * whole module graph would distort every other filesystem assertion.
 */
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => {
      const entries = actual.readdirSync(...args) as unknown as string[];
      return entries.filter((entry) => !entry.startsWith('walkthrough.v'));
    },
  };
});

const { createDefaultManifest, IrWriteError, manifestPath, walkthroughPath, writeNextIrVersion } =
  await import('../src/index.js');
const { loadFixture } = await import('./fixtures.js');

describe('AC4: the writer refuses to overwrite an existing version file', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-ir-collision-'));
    writeFileSync(
      manifestPath(projectDir),
      `${JSON.stringify(createDefaultManifest('collision-demo'), null, 2)}\n`,
      'utf8',
    );
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('throws IrWriteError and leaves the existing file byte-identical', () => {
    const existing = '{"this":"is v1 and must survive"}\n';
    const v1Path = walkthroughPath(projectDir, 1);
    writeFileSync(v1Path, existing, 'utf8');

    // The mocked listing hides walkthrough.v1.json, so the writer believes
    // the project has no versions and targets v1.
    expect(() => writeNextIrVersion(projectDir, loadFixture('flow-navigate'))).toThrowError(
      IrWriteError,
    );
    expect(readFileSync(v1Path, 'utf8')).toBe(existing);
  });

  it('explains why the write was refused', () => {
    writeFileSync(walkthroughPath(projectDir, 1), '{}\n', 'utf8');
    expect(() => writeNextIrVersion(projectDir, loadFixture('flow-navigate'))).toThrowError(
      /immutable/,
    );
  });
});
