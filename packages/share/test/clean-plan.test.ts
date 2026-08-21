import { existsSync, mkdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderProject } from '@waggle/compose';
import { readIrVersion, writeNextIrVersion } from '@waggle/ir';
import { describe, expect, it } from 'vitest';
import { deleteCleanCandidates, planClean } from '../src/clean/plan.js';
import { renderPresets, stageProject } from './fixtures.js';

/**
 * prd-008 AC4: "prunes stale renders by age/version with a dry-run
 * default. Destroying files must require an explicit flag. Print what
 * would be removed." `planClean` never touches disk; `deleteCleanCandidates`
 * is the only function that does, and only ever when called explicitly.
 */
describe('AC4: planClean (version pruning)', () => {
  it('keeps the most recent version per (brand kit, preset) and flags the rest as stale-version', async () => {
    const { projectDir, irVersion } = stageProject();
    await renderPresets(projectDir, ['16x9']);

    // A second IR version, re-rendered at the same preset: v1's render is now superseded.
    const current = writeNextIrVersion(projectDir, readIrVersion(projectDir, irVersion));
    await renderProject({ projectDir, presetId: '16x9' });

    const plan = planClean(projectDir);
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.output.irVersion).toBe(1);
    expect(plan.candidates[0]?.reasons).toEqual(['stale-version']);
    expect(current.version).toBe(2);
  });

  it('keeps N versions when keepVersions is raised', async () => {
    const { projectDir, irVersion } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    writeNextIrVersion(projectDir, readIrVersion(projectDir, irVersion));
    await renderProject({ projectDir, presetId: '16x9' });

    expect(planClean(projectDir, { keepVersions: 2 }).candidates).toHaveLength(0);
    expect(planClean(projectDir, { keepVersions: 1 }).candidates).toHaveLength(1);
  });
});

describe('AC4: planClean (age pruning)', () => {
  it('is off by default: no candidate is flagged by age alone', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    const veryOld = new Date('2000-01-01');
    utimesSync(outputPath, veryOld, veryOld);

    const plan = planClean(projectDir);
    expect(plan.candidates).toHaveLength(0);
  });

  it('flags a render older than olderThanDays', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    const old = new Date('2020-01-01');
    utimesSync(outputPath, old, old);

    const plan = planClean(projectDir, {
      olderThanDays: 30,
      now: () => new Date('2026-08-20T00:00:00.000Z'),
    });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.reasons).toEqual(['age']);
  });

  it('does not flag a recent render even with age pruning enabled', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);

    const plan = planClean(projectDir, { olderThanDays: 30, now: () => new Date() });
    expect(plan.candidates).toHaveLength(0);
  });
});

describe('AC4: deleteCleanCandidates', () => {
  it('planClean never deletes anything on its own', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');

    planClean(projectDir, { olderThanDays: 0, now: () => new Date(Date.now() + 1000) });
    expect(existsSync(outputPath)).toBe(true);
  });

  it('deletes exactly the planned files (render + sidecars) and reports bytes freed', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    const size = statSync(outputPath).size;

    const plan = planClean(projectDir, {
      olderThanDays: 0,
      now: () => new Date(Date.now() + 1000),
    });
    expect(plan.candidates).toHaveLength(1);

    const result = deleteCleanCandidates(plan);
    expect(result.filesDeleted).toBeGreaterThanOrEqual(1);
    expect(result.bytesFreed).toBeGreaterThanOrEqual(size);
    expect(existsSync(outputPath)).toBe(false);
    expect(existsSync(`${outputPath}.render.json`)).toBe(false);
  });

  it('reports and deletes the .work scratch directory as pure cache', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const workDir = path.join(projectDir, 'renders', '.work');
    mkdirSync(workDir, { recursive: true });
    writeFileSync(path.join(workDir, 'scratch.bin'), 'intermediate');

    const plan = planClean(projectDir);
    expect(plan.workDirPath).toBe(workDir);
    expect(plan.workDirBytes).toBeGreaterThan(0);

    const result = deleteCleanCandidates(plan);
    expect(result.workDirDeleted).toBe(true);
    expect(existsSync(workDir)).toBe(false);
  });

  it('never touches renders/share, even when it holds an already-distributed bundle', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const shareDir = path.join(projectDir, 'renders', 'share', 'v1');
    mkdirSync(shareDir, { recursive: true });
    writeFileSync(path.join(shareDir, 'index.html'), '<html></html>');

    const plan = planClean(projectDir, {
      olderThanDays: 0,
      now: () => new Date(Date.now() + 1000),
    });
    deleteCleanCandidates(plan);

    expect(existsSync(path.join(shareDir, 'index.html'))).toBe(true);
  });
});
