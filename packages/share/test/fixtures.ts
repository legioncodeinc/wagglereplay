// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderProject, resolveFfmpegPath } from '@waggle/compose';
import {
  createDefaultManifest,
  PROJECT_SUBDIRS,
  WAGGLE_IR_SCHEMA_VERSION,
  WalkthroughFlowSchema,
  writeNextIrVersion,
} from '@waggle/ir';
import { NARRATION_WORDS_SCHEMA_VERSION, writeWordsJson } from '@waggle/narrate';

/**
 * Hermetic fixtures for this package's test suite, following the same
 * shape as `packages/compose/test/fixtures.ts`: every media input is
 * synthesized by ffmpeg (never checked in), and a real project directory
 * is staged on disk so tests exercise this package's actual filesystem
 * code rather than a mock of it. This package's own tests need one thing
 * compose's fixtures do not provide: a REAL, ENCODED render on disk (this
 * package manages render outputs, it does not produce them), so
 * `stageRenderedProject` below stages a project and then calls
 * `@waggle/compose`'s own public `renderProject` to produce one.
 */

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `waggle-share-${prefix}-`));
}

function ffmpeg(args: readonly string[]): void {
  const result = spawnSync(resolveFfmpegPath(), [...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg fixture generation failed:\n${result.stderr ?? ''}`);
  }
}

export interface StagedProject {
  readonly projectDir: string;
  readonly irVersion: number;
}

const FAST_PRESETS = {
  '16x9': { width: 320, height: 180, fps: 24 },
  '9x16': { width: 180, height: 320, fps: 24 },
} as const;

export interface StageOptions {
  readonly durationS?: number;
  readonly withNarration?: boolean;
  readonly presets?: Record<string, unknown>;
}

/** Stages a full ADR-015 project with a synthetic recording and (by default) narration, ready for `renderProject`. */
export function stageProject(options: StageOptions = {}): StagedProject {
  const durationS = options.durationS ?? 2.5;
  const dir = makeTempDir('project');
  for (const subdir of PROJECT_SUBDIRS) {
    mkdirSync(path.join(dir, subdir), { recursive: true });
  }

  writeFileSync(
    path.join(dir, 'waggle.json'),
    `${JSON.stringify(
      {
        ...createDefaultManifest('share-fixture'),
        createdAt: '2026-08-20T00:00:00.000Z',
        presets: options.presets ?? FAST_PRESETS,
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
    `testsrc2=size=320x180:rate=24:duration=${durationS}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=220:duration=${durationS}`,
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

  const durationMs = Math.round(durationS * 1000);
  const cursorTrail = Array.from({ length: 10 }, (_, i) => ({
    t: i * 100,
    x: 100 + i * 10,
    y: 100 + (i % 3) * 8,
  }));

  writeNextIrVersion(
    dir,
    WalkthroughFlowSchema.parse({
      title: 'Share fixture walkthrough',
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
        cursorTrail,
        clicks: [],
        sourceRecording: { videoRef: 'steps/recording.mp4', durationMs },
      },
    }),
  );

  if (options.withNarration ?? true) {
    ffmpeg([
      '-hide_banner',
      '-nostdin',
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${durationS}`,
      '-c:a',
      'libmp3lame',
      '-b:a',
      '96k',
      '-map_metadata',
      '-1',
      path.join(dir, 'narration', 'audio.mp3'),
    ]);

    writeWordsJson(path.join(dir, 'narration', 'words.json'), {
      schemaVersion: NARRATION_WORDS_SCHEMA_VERSION,
      provider: 'fixture',
      sourceText: 'Open the dashboard and review this week.',
      durationMs,
      words: [
        { word: 'Open', startMs: 0, endMs: 300 },
        { word: 'the', startMs: 320, endMs: 480 },
        { word: 'dashboard', startMs: 500, endMs: 1000 },
        { word: 'and', startMs: 1020, endMs: 1150 },
        { word: 'review', startMs: 1170, endMs: 1500 },
        { word: 'this', startMs: 1520, endMs: 1700 },
        { word: 'week.', startMs: 1720, endMs: Math.min(durationMs - 10, 2100) },
      ],
    });
  }

  return { projectDir: dir, irVersion: 1 };
}

/** Renders `presetIds` for the staged project via `@waggle/compose`'s real `renderProject`, real ffmpeg included. */
export async function renderPresets(
  projectDir: string,
  presetIds: readonly string[],
): Promise<void> {
  for (const presetId of presetIds) {
    await renderProject({ projectDir, presetId });
  }
}
