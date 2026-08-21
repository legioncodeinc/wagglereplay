import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createDefaultManifest,
  PROJECT_SUBDIRS,
  WAGGLE_IR_SCHEMA_VERSION,
  type WalkthroughFlow,
  WalkthroughFlowSchema,
  writeNextIrVersion,
} from '@waggle/ir';
import {
  NARRATION_WORDS_SCHEMA_VERSION,
  type NarrationWordsDocument,
  writeWordsJson,
} from '@waggle/narrate';
import { resolveFfmpegPath, run } from '../src/ffmpeg/run-ffmpeg.js';

/**
 * Hermetic fixtures for the compositor's tests.
 *
 * Every media input is SYNTHESIZED by ffmpeg itself (`testsrc2`, `sine`)
 * rather than checked in. Three reasons, all of which matter for a repo
 * that has to stay reviewable:
 *
 *  - No binary blobs in git. A committed sample MP4 would be the single
 *    largest artifact in the repository and would need re-generating every
 *    time a test wanted a different duration or aspect ratio.
 *  - `testsrc2` is deterministic. The same arguments produce the same
 *    frames, which is what lets AC7's idempotency test compare stream
 *    hashes across two renders and blame any difference on the compositor
 *    rather than on its input.
 *  - It exercises the real decoder path. A render over a synthetic H.264
 *    file goes through exactly the same demux, decode, and scale as a
 *    render over a screen recording.
 */

export function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `waggle-${prefix}-`));
}

/**
 * An absolute path rooted at the filesystem root of whatever platform the
 * suite is running on.
 *
 * A test that asserts on path RESOLUTION must never hardcode a `C:/...`
 * literal. `path.isAbsolute('C:/project')` is false on POSIX, so
 * `path.resolve()` treats the string as relative and silently prefixes the
 * working directory: the test then passes on Windows and fails on Linux
 * with a baffling `/home/runner/.../C:/project/...`. This helper yields
 * `/project` on POSIX and `C:\project` on Windows, both genuinely
 * absolute, so an assertion built from it means the same thing on both.
 */
export function absoluteTestPath(...segments: readonly string[]): string {
  return path.resolve(path.sep, ...segments);
}

export interface SyntheticVideoOptions {
  readonly width?: number;
  readonly height?: number;
  readonly durationS?: number;
  readonly fps?: number;
  readonly withAudio?: boolean;
}

/** Renders a deterministic test pattern (optionally with a tone) to `filePath`. */
export async function makeSyntheticVideo(
  filePath: string,
  options: SyntheticVideoOptions = {},
): Promise<string> {
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const durationS = options.durationS ?? 4;
  const fps = options.fps ?? 30;

  mkdirSync(path.dirname(filePath), { recursive: true });

  const args = [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-fflags',
    '+bitexact',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${height}:rate=${fps}:duration=${durationS}`,
  ];
  if (options.withAudio !== false) {
    args.push('-f', 'lavfi', '-i', `sine=frequency=220:duration=${durationS}`);
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-flags:v',
    '+bitexact',
  );
  if (options.withAudio !== false) {
    args.push('-c:a', 'aac', '-b:a', '96k', '-flags:a', '+bitexact');
  }
  args.push('-map_metadata', '-1', filePath);

  const result = await run(resolveFfmpegPath(), args);
  if (result.code !== 0) {
    throw new Error(`Could not synthesize "${filePath}":\n${result.stderr}`);
  }
  return filePath;
}

/** Renders a deterministic tone to `filePath`, standing in for narration audio. */
export async function makeSyntheticAudio(filePath: string, durationS = 4): Promise<string> {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const result = await run(resolveFfmpegPath(), [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-loglevel',
    'error',
    '-fflags',
    '+bitexact',
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
    filePath,
  ]);
  if (result.code !== 0) {
    throw new Error(`Could not synthesize "${filePath}":\n${result.stderr}`);
  }
  return filePath;
}

export interface FlowFixtureOptions {
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
  readonly durationMs?: number;
  /** Click times in ms; each click gets a normalized position from `clickPoints`. */
  readonly clickTimesMs?: readonly number[];
  readonly videoRef?: string;
}

/**
 * A small but structurally complete Walkthrough IR: a real cursor trail, a
 * real click sequence, and a `sourceRecording` pointer, parsed through the
 * real schema so a fixture can never drift from what the IR actually
 * accepts.
 */
export function makeFlow(options: FlowFixtureOptions = {}): WalkthroughFlow {
  const viewportWidth = options.viewportWidth ?? 1280;
  const viewportHeight = options.viewportHeight ?? 720;
  const durationMs = options.durationMs ?? 4000;
  const clickTimesMs = options.clickTimesMs ?? [1200, 2800];

  // A deterministic zig-zag across the viewport, sampled every 100ms.
  const cursorTrail: { t: number; x: number; y: number }[] = [];
  for (let t = 0; t <= durationMs; t += 100) {
    const phase = t / durationMs;
    cursorTrail.push({
      t,
      x: Math.round(viewportWidth * (0.15 + 0.7 * phase)),
      y: Math.round(viewportHeight * (0.3 + 0.4 * Math.abs(Math.sin(phase * Math.PI * 2)))),
    });
  }

  const clicks = clickTimesMs.flatMap((t, index) => {
    const phase = t / durationMs;
    const x = Math.round(viewportWidth * (0.15 + 0.7 * phase));
    const y = Math.round(viewportHeight * (0.35 + 0.3 * (index % 2)));
    return [
      { t, x, y, down: true },
      { t: t + 90, x, y, down: false },
    ];
  });

  return WalkthroughFlowSchema.parse({
    title: 'Compositor fixture walkthrough',
    steps: [
      {
        type: 'navigate',
        url: 'https://demo.example.com/dashboard',
        waggle: { classification: 'navigate', routeAfter: '/dashboard', masked: false },
      },
      {
        type: 'click',
        selectors: ['[data-testid=filter]'],
        offsetX: 60,
        offsetY: 20,
        waggle: {
          classification: 'state-change',
          element: {
            role: 'button',
            name: 'Filter',
            rect: { x: 320, y: 240, w: 120, h: 40 },
          },
          masked: false,
        },
      },
    ],
    waggle: {
      schemaVersion: WAGGLE_IR_SCHEMA_VERSION,
      recordedViewport: { w: viewportWidth, h: viewportHeight, dpr: 1 },
      startEpochMs: 1_700_000_000_000,
      cursorTrail,
      clicks,
      sourceRecording: {
        videoRef: options.videoRef ?? 'steps/recording.mp4',
        durationMs,
      },
    },
  });
}

/** A `words.json` document whose words tile the requested span evenly. */
export function makeWords(text: string, durationMs: number): NarrationWordsDocument {
  const tokens = text.split(/\s+/).filter((token) => token !== '');
  const slot = durationMs / Math.max(1, tokens.length);
  return {
    schemaVersion: NARRATION_WORDS_SCHEMA_VERSION,
    provider: 'fixture',
    sourceText: text,
    durationMs,
    words: tokens.map((word, index) => ({
      word,
      startMs: Math.round(index * slot),
      endMs: Math.round((index + 1) * slot) - 10,
    })),
  };
}

export interface ProjectFixtureOptions extends FlowFixtureOptions {
  readonly withNarration?: boolean;
  readonly withSourceAudio?: boolean;
  readonly videoWidth?: number;
  readonly videoHeight?: number;
  readonly presets?: Record<string, unknown>;
  readonly narrationText?: string;
}

export interface ProjectFixture {
  readonly projectDir: string;
  readonly irVersion: number;
  readonly flow: WalkthroughFlow;
  readonly videoPath: string;
}

/** Stages a complete ADR-015 project directory in a temp dir. */
export async function makeProject(options: ProjectFixtureOptions = {}): Promise<ProjectFixture> {
  const projectDir = makeTempDir('project');
  for (const subdir of PROJECT_SUBDIRS) {
    mkdirSync(path.join(projectDir, subdir), { recursive: true });
  }

  const manifest = {
    ...createDefaultManifest('compositor-fixture'),
    createdAt: '2026-08-20T00:00:00.000Z',
    presets: options.presets ?? {},
  };
  writeFileSync(
    path.join(projectDir, 'waggle.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const durationMs = options.durationMs ?? 4000;
  const videoPath = path.join(projectDir, 'steps', 'recording.mp4');
  await makeSyntheticVideo(videoPath, {
    width: options.videoWidth ?? 640,
    height: options.videoHeight ?? 360,
    durationS: durationMs / 1000,
    withAudio: options.withSourceAudio ?? true,
  });

  const flow = makeFlow(options);
  const written = writeNextIrVersion(projectDir, flow);

  if (options.withNarration ?? true) {
    const narrationDir = path.join(projectDir, 'narration');
    await makeSyntheticAudio(path.join(narrationDir, 'audio.mp3'), durationMs / 1000);
    writeWordsJson(
      path.join(narrationDir, 'words.json'),
      makeWords(
        options.narrationText ??
          'Open the dashboard and apply a filter to narrow the results down to this week.',
        durationMs,
      ),
    );
  }

  return { projectDir, irVersion: written.version, flow, videoPath };
}
