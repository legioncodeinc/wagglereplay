// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createDefaultManifest,
  PROJECT_SUBDIRS,
  readIrVersion,
  WAGGLE_IR_SCHEMA_VERSION,
  WalkthroughFlowSchema,
  writeNextIrVersion,
} from '@waggle/ir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';

/**
 * prd-008 AC4: `waggle clean` end to end. Dry run is the default; every
 * test that expects an actual deletion passes `--force` explicitly,
 * mirroring the contract the command itself enforces.
 */

let projectDir = '';
let stdout = '';
const originalWrite = process.stdout.write.bind(process.stdout);
const cleanupDirs: string[] = [];

function ffmpeg(args: readonly string[]): void {
  const result = spawnSync('ffmpeg', [...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg fixture generation failed:\n${result.stderr ?? ''}`);
  }
}

function stageProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-clean-'));
  cleanupDirs.push(dir);
  for (const subdir of PROJECT_SUBDIRS) {
    mkdirSync(path.join(dir, subdir), { recursive: true });
  }

  writeFileSync(
    path.join(dir, 'waggle.json'),
    `${JSON.stringify(
      {
        ...createDefaultManifest('clean-fixture'),
        createdAt: '2026-08-20T00:00:00.000Z',
        presets: { '16x9': { width: 320, height: 180, fps: 24 } },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  ffmpeg([
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=24:duration=1.5',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-map_metadata',
    '-1',
    path.join(dir, 'steps', 'recording.mp4'),
  ]);

  writeNextIrVersion(
    dir,
    WalkthroughFlowSchema.parse({
      title: 'CLI clean fixture',
      steps: [
        {
          type: 'navigate',
          url: 'https://demo.example.com/dashboard',
          waggle: { classification: 'navigate', routeAfter: '/dashboard', masked: false },
        },
      ],
      waggle: {
        schemaVersion: WAGGLE_IR_SCHEMA_VERSION,
        recordedViewport: { w: 1280, h: 720, dpr: 1 },
        startEpochMs: 1_700_000_000_000,
        cursorTrail: [{ t: 0, x: 100, y: 100 }],
        clicks: [],
        sourceRecording: { videoRef: 'steps/recording.mp4', durationMs: 1500 },
      },
    }),
  );

  return dir;
}

beforeEach(() => {
  stdout = '';
  process.stdout.write = ((chunk: string) => {
    stdout += chunk;
    return true;
  }) as typeof process.stdout.write;
  projectDir = stageProject();
});

afterEach(() => {
  process.stdout.write = originalWrite;
  for (const dir of cleanupDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('AC4: waggle clean', () => {
  it('reports nothing to clean for a freshly initialized project (no renders, no scratch cache)', async () => {
    const code = await runCli(['node', 'waggle', 'clean', '--project', projectDir]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('Nothing to clean.');
  });

  it('offers only the .work scratch cache for a project with a single current-version render', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    const code = await runCli(['node', 'waggle', 'clean', '--project', projectDir]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).not.toContain('render(s) would be removed');
    expect(stdout).toContain('Scratch cache would be removed');
    expect(stdout).toContain('Dry run: nothing was deleted');
  });

  it('is a dry run by default: prints the stale render but does not delete it', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);
    const staleOutput = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');

    writeNextIrVersion(projectDir, readIrVersion(projectDir, 1));
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    const code = await runCli(['node', 'waggle', 'clean', '--project', projectDir]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('1 render(s) would be removed');
    expect(stdout).toContain('walkthrough.v1.default.16x9.mp4');
    expect(stdout).toContain('stale version');
    expect(stdout).toContain('Dry run: nothing was deleted');
    expect(existsSync(staleOutput)).toBe(true);
  });

  it('actually deletes only with --force', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);
    const staleOutput = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');

    writeNextIrVersion(projectDir, readIrVersion(projectDir, 1));
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    const code = await runCli(['node', 'waggle', 'clean', '--project', projectDir, '--force']);
    expect(code).toBe(ExitCode.SUCCESS);
    // The stale render's MP4 plus its compositor .render.json sidecar (no
    // .manifest.json here: only `waggle export` writes that one).
    expect(stdout).toContain('Deleted 2 file(s)');
    expect(stdout).toContain('Scratch cache removed.');
    expect(existsSync(staleOutput)).toBe(false);

    const currentOutput = path.join(projectDir, 'renders', 'walkthrough.v2.default.16x9.mp4');
    expect(existsSync(currentOutput)).toBe(true);
  });

  it('honors --keep-versions', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);
    writeNextIrVersion(projectDir, readIrVersion(projectDir, 1));
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    const code = await runCli([
      'node',
      'waggle',
      'clean',
      '--project',
      projectDir,
      '--keep-versions',
      '2',
    ]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).not.toContain('render(s) would be removed');
  });

  it('never deletes renders/share bundles even under --force', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);
    await runCli(['node', 'waggle', 'export', '--project', projectDir]);

    writeNextIrVersion(projectDir, readIrVersion(projectDir, 1));
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    await runCli(['node', 'waggle', 'clean', '--project', projectDir, '--force']);

    expect(existsSync(path.join(projectDir, 'renders', 'share', 'v1', 'index.html'))).toBe(true);
  });

  it('still resolves the project the way every other command does', async () => {
    const code = await runCli(['node', 'waggle', 'clean', '--project', tmpdir()]);
    expect(code).toBe(ExitCode.PROJECT_NOT_FOUND);
  });
});
