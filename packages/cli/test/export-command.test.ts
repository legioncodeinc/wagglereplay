import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createDefaultManifest,
  PROJECT_SUBDIRS,
  WAGGLE_IR_SCHEMA_VERSION,
  WalkthroughFlowSchema,
  writeNextIrVersion,
} from '@waggle/ir';
import { NARRATION_WORDS_SCHEMA_VERSION, writeWordsJson } from '@waggle/narrate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';

/**
 * prd-008 AC2/AC3: `waggle export` end to end, through the real CLI entry
 * point: real ffmpeg render (via `waggle render`), real bundle assembly,
 * and (for the `--upload` cases) a mocked R2 transport standing in for
 * the network call, in the same style as `narrate-command.test.ts`'s
 * mocked ElevenLabs fetch.
 */

let projectDir = '';
let stdout = '';
let stderr = '';
const originalWrite = process.stdout.write.bind(process.stdout);
const originalErrorWrite = process.stderr.write.bind(process.stderr);
const cleanupDirs: string[] = [];
const R2_ENV_VARS = [
  'WAGGLE_R2_ACCOUNT_ID',
  'WAGGLE_R2_ACCESS_KEY_ID',
  'WAGGLE_R2_SECRET_ACCESS_KEY',
  'WAGGLE_R2_BUCKET',
  'WAGGLE_R2_PUBLIC_BASE_URL',
] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const key of R2_ENV_VARS) {
  originalEnv[key] = process.env[key];
}

function ffmpeg(args: readonly string[]): void {
  const result = spawnSync('ffmpeg', [...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg fixture generation failed:\n${result.stderr ?? ''}`);
  }
}

function stageProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-export-'));
  cleanupDirs.push(dir);
  for (const subdir of PROJECT_SUBDIRS) {
    mkdirSync(path.join(dir, subdir), { recursive: true });
  }

  writeFileSync(
    path.join(dir, 'waggle.json'),
    `${JSON.stringify(
      {
        ...createDefaultManifest('export-fixture'),
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
    'testsrc2=size=320x180:rate=24:duration=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=220:duration=2',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-map_metadata',
    '-1',
    path.join(dir, 'steps', 'recording.mp4'),
  ]);
  ffmpeg([
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '96k',
    '-map_metadata',
    '-1',
    path.join(dir, 'narration', 'audio.mp3'),
  ]);

  writeNextIrVersion(
    dir,
    WalkthroughFlowSchema.parse({
      title: 'CLI export fixture',
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
        sourceRecording: { videoRef: 'steps/recording.mp4', durationMs: 2000 },
      },
    }),
  );

  writeWordsJson(path.join(dir, 'narration', 'words.json'), {
    schemaVersion: NARRATION_WORDS_SCHEMA_VERSION,
    provider: 'fixture',
    sourceText: 'Open the dashboard.',
    durationMs: 2000,
    words: [
      { word: 'Open', startMs: 0, endMs: 300 },
      { word: 'the', startMs: 320, endMs: 480 },
      { word: 'dashboard.', startMs: 500, endMs: 1200 },
    ],
  });

  return dir;
}

beforeEach(() => {
  stdout = '';
  stderr = '';
  process.stdout.write = ((chunk: string) => {
    stdout += chunk;
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string) => {
    stderr += chunk;
    return true;
  }) as typeof process.stderr.write;
  projectDir = stageProject();
  for (const key of R2_ENV_VARS) {
    delete process.env[key];
  }
});

afterEach(() => {
  process.stdout.write = originalWrite;
  process.stderr.write = originalErrorWrite;
  for (const key of R2_ENV_VARS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
  vi.unstubAllGlobals();
  for (const dir of cleanupDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('AC2: waggle export', () => {
  it('exits RENDER_INPUT_MISSING when the project has no recorded IR yet', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-export-norecord-'));
    cleanupDirs.push(dir);
    const initCode = await runCli(['node', 'waggle', 'init', 'x', '--dir', dir]);
    expect(initCode).toBe(ExitCode.SUCCESS);

    const code = await runCli(['node', 'waggle', 'export', '--project', path.join(dir, 'x')]);
    expect(code).toBe(ExitCode.RENDER_INPUT_MISSING);
  });

  it('exits EXPORT_NO_RENDERS when the IR exists but nothing has been rendered', async () => {
    const code = await runCli(['node', 'waggle', 'export', '--project', projectDir]);
    expect(code).toBe(ExitCode.EXPORT_NO_RENDERS);
    expect(stderr).toContain('No renders found');
  });

  it('builds a self-contained bundle after a real render', async () => {
    const renderCode = await runCli([
      'node',
      'waggle',
      'render',
      '--project',
      projectDir,
      '--preset',
      '16x9',
    ]);
    expect(renderCode).toBe(ExitCode.SUCCESS);

    const code = await runCli(['node', 'waggle', 'export', '--project', projectDir]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('Share bundle written:');
    expect(stdout).toContain('Captions: included');
    expect(stdout).toContain('Transcript: included');
    expect(stdout).toContain('Link integrity: OK');
    expect(stdout).toContain('Not uploaded');

    const bundleDir = path.join(projectDir, 'renders', 'share', 'v1');
    expect(existsSync(path.join(bundleDir, 'index.html'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'poster.jpg'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'captions.vtt'))).toBe(true);
    expect(existsSync(path.join(bundleDir, 'walkthrough.v1.default.16x9.mp4'))).toBe(true);
  });

  it('exits R2_CONFIG_INVALID with the exact missing variable names when --upload is passed without env config', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);
    const code = await runCli(['node', 'waggle', 'export', '--project', projectDir, '--upload']);
    expect(code).toBe(ExitCode.R2_CONFIG_INVALID);
    for (const varName of R2_ENV_VARS) {
      expect(stderr).toContain(varName);
    }
  });

  it('uploads to R2 and prints the public URL layout when --upload is passed and configured', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    process.env.WAGGLE_R2_ACCOUNT_ID = 'acct123';
    process.env.WAGGLE_R2_ACCESS_KEY_ID = 'AKIDEXAMPLE';
    process.env.WAGGLE_R2_SECRET_ACCESS_KEY = 'secret';
    process.env.WAGGLE_R2_BUCKET = 'my-bucket';
    process.env.WAGGLE_R2_PUBLIC_BASE_URL = 'https://cdn.example.com';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );

    const code = await runCli(['node', 'waggle', 'export', '--project', projectDir, '--upload']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('Uploaded');
    expect(stdout).toContain('Public URL layout:');
    expect(stdout).toContain('https://cdn.example.com/export-fixture/v1/index.html');
  });

  it('exits R2_UPLOAD_FAILED when R2 rejects the upload', async () => {
    await runCli(['node', 'waggle', 'render', '--project', projectDir, '--preset', '16x9']);

    process.env.WAGGLE_R2_ACCOUNT_ID = 'acct123';
    process.env.WAGGLE_R2_ACCESS_KEY_ID = 'AKIDEXAMPLE';
    process.env.WAGGLE_R2_SECRET_ACCESS_KEY = 'secret';
    process.env.WAGGLE_R2_BUCKET = 'my-bucket';
    process.env.WAGGLE_R2_PUBLIC_BASE_URL = 'https://cdn.example.com';

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('access denied', { status: 403 })),
    );

    const code = await runCli(['node', 'waggle', 'export', '--project', projectDir, '--upload']);
    expect(code).toBe(ExitCode.R2_UPLOAD_FAILED);
    expect(stderr).toContain('403');
  });

  it('still resolves the project the way every other command does', async () => {
    const code = await runCli(['node', 'waggle', 'export', '--project', tmpdir()]);
    expect(code).toBe(ExitCode.PROJECT_NOT_FOUND);
  });
});
