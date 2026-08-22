// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultManifest,
  IrValidationError,
  IrWriteError,
  latestIrVersion,
  listIrVersions,
  manifestPath,
  readCurrentIr,
  readIrVersion,
  WaggleManifestSchema,
  type WalkthroughFlow,
  walkthroughFilename,
  walkthroughPath,
  writeNextIrVersion,
} from '../src/index.js';
import { loadFixture } from './fixtures.js';

/**
 * AC4: the immutable version writer.
 *
 * Saving writes `walkthrough.v(n+1).json`, repoints `waggle.json`, and
 * never mutates a prior version. The immutability claim is proven by
 * hashing v1's bytes before and after v2 is written, not by inspecting the
 * writer's source: ADR-015 makes these files a git-committed source of
 * truth, so "we did not touch it" has to be a measured fact.
 */

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function seedProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-ir-writer-'));
  const manifest = createDefaultManifest('immutability-demo');
  writeFileSync(manifestPath(dir), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return dir;
}

function readManifestFile(dir: string) {
  return WaggleManifestSchema.parse(JSON.parse(readFileSync(manifestPath(dir), 'utf8')));
}

function withTitle(flow: WalkthroughFlow, title: string): WalkthroughFlow {
  return { ...structuredClone(flow), title };
}

describe('AC4: immutable version writer', () => {
  let projectDir: string;
  let v1Flow: WalkthroughFlow;

  beforeEach(() => {
    projectDir = seedProject();
    v1Flow = loadFixture('flow-navigate') as WalkthroughFlow;
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('writes walkthrough.v1.json into a project that has no versions yet', () => {
    expect(listIrVersions(projectDir)).toEqual([]);
    expect(latestIrVersion(projectDir)).toBeNull();

    const result = writeNextIrVersion(projectDir, v1Flow);

    expect(result.version).toBe(1);
    expect(path.basename(result.filePath)).toBe('walkthrough.v1.json');
    expect(readdirSync(projectDir).sort()).toEqual(['waggle.json', 'walkthrough.v1.json']);
  });

  it('repoints the manifest at the version it just wrote', () => {
    expect(readManifestFile(projectDir).currentIrVersion).toBeNull();

    writeNextIrVersion(projectDir, v1Flow);
    expect(readManifestFile(projectDir).currentIrVersion).toBe(1);

    writeNextIrVersion(projectDir, withTitle(v1Flow, 'Second take'));
    expect(readManifestFile(projectDir).currentIrVersion).toBe(2);
  });

  it('preserves every other manifest field when repointing', () => {
    const before = readManifestFile(projectDir);
    writeNextIrVersion(projectDir, v1Flow);
    const after = readManifestFile(projectDir);

    expect(after.name).toBe(before.name);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.schemaVersion).toBe(before.schemaVersion);
    expect(after.presets).toEqual(before.presets);
    expect(after.defaults).toEqual(before.defaults);
  });

  it('never mutates a prior version: v1 is byte-identical after v2 is written', () => {
    writeNextIrVersion(projectDir, v1Flow);
    const v1Path = walkthroughPath(projectDir, 1);
    const hashBefore = sha256(v1Path);
    const bytesBefore = readFileSync(v1Path);

    const second = writeNextIrVersion(projectDir, withTitle(v1Flow, 'Second take'));

    expect(second.version).toBe(2);
    expect(sha256(v1Path)).toBe(hashBefore);
    expect(readFileSync(v1Path).equals(bytesBefore)).toBe(true);

    // And the new version really is different content, so the hash match
    // above is not the trivial "we wrote the same thing twice" case.
    expect(sha256(walkthroughPath(projectDir, 2))).not.toBe(hashBefore);
  });

  it('leaves every earlier version untouched across a run of five saves', () => {
    const hashes = new Map<number, string>();
    for (let i = 1; i <= 5; i += 1) {
      const written = writeNextIrVersion(projectDir, withTitle(v1Flow, `Take ${i}`));
      expect(written.version).toBe(i);
      hashes.set(i, sha256(written.filePath));

      for (const [version, hash] of hashes) {
        expect(sha256(walkthroughPath(projectDir, version))).toBe(hash);
      }
    }

    expect(listIrVersions(projectDir)).toEqual([1, 2, 3, 4, 5]);
    expect(latestIrVersion(projectDir)).toBe(5);
    expect(new Set(hashes.values()).size).toBe(5);
  });

  it('reads back exactly what it wrote', () => {
    writeNextIrVersion(projectDir, v1Flow);
    const readBack = readIrVersion(projectDir, 1);
    expect(readBack).toEqual(v1Flow);
  });

  it('resolves the manifest pointer through readCurrentIr', () => {
    expect(readCurrentIr(projectDir)).toBeNull();

    writeNextIrVersion(projectDir, v1Flow);
    writeNextIrVersion(projectDir, withTitle(v1Flow, 'Second take'));

    const current = readCurrentIr(projectDir);
    expect(current?.version).toBe(2);
    expect(current?.flow.title).toBe('Second take');
  });

  it('validates before touching the filesystem', () => {
    const broken = structuredClone(v1Flow) as unknown as { waggle: Record<string, unknown> };
    delete broken.waggle.recordedViewport;

    expect(() => writeNextIrVersion(projectDir, broken)).toThrowError(IrValidationError);
    expect(readdirSync(projectDir)).toEqual(['waggle.json']);
    expect(readManifestFile(projectDir).currentIrVersion).toBeNull();
  });

  it('names the offending path when the flow is invalid', () => {
    const broken = structuredClone(v1Flow) as unknown as { waggle: Record<string, unknown> };
    broken.waggle.startEpochMs = -1;

    let thrown: unknown;
    try {
      writeNextIrVersion(projectDir, broken);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IrValidationError);
    expect((thrown as IrValidationError).issues.map((issue) => issue.path)).toContain(
      'waggle.startEpochMs',
    );
  });

  it('refuses to write into a directory that is not a Waggle project', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'waggle-ir-bare-'));
    try {
      expect(() => writeNextIrVersion(bare, v1Flow)).toThrowError(IrWriteError);
      expect(readdirSync(bare)).toEqual([]);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });

  it('ignores files that are not IR versions when numbering', () => {
    writeFileSync(path.join(projectDir, 'walkthrough.json'), '{}', 'utf8');
    writeFileSync(path.join(projectDir, 'walkthrough.v01.json'), '{}', 'utf8');
    writeFileSync(path.join(projectDir, 'notes.md'), 'scratch', 'utf8');

    expect(listIrVersions(projectDir)).toEqual([]);
    expect(writeNextIrVersion(projectDir, v1Flow).version).toBe(1);
  });

  it('reports a missing version rather than returning an empty flow', () => {
    expect(() => readIrVersion(projectDir, 7)).toThrowError(IrWriteError);
  });

  it('rejects an unusable version number when building a filename', () => {
    expect(() => walkthroughFilename(0)).toThrowError(RangeError);
    expect(() => walkthroughFilename(-1)).toThrowError(RangeError);
    expect(() => walkthroughFilename(1.5)).toThrowError(RangeError);
    expect(walkthroughFilename(42)).toBe('walkthrough.v42.json');
  });

  it('reports an unreadable project directory instead of reporting zero versions', () => {
    expect(() => listIrVersions(path.join(projectDir, 'does-not-exist'))).toThrowError(
      IrWriteError,
    );
  });
});
