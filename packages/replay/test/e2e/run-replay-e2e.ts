import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { probeMedia, resolveFfprobePath } from '@waggle/compose';
import { CTA_START_TEXT, startFixtureApp, TEST_IDS } from '@waggle/fixture-demo-app';
import {
  createDefaultManifest,
  PROJECT_SUBDIRS,
  WAGGLE_IR_SCHEMA_VERSION,
  WalkthroughFlowSchema,
  writeNextIrVersion,
} from '@waggle/ir';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import { runRegen } from '../../src/regen/orchestrate.js';
import { runReplaySession } from '../../src/session/replay-session.js';

const QA_DIR = path.resolve(
  import.meta.dirname,
  '../../../../library/requirements/backlog/prd-009-replay-engine/qa',
);

const ProbeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string().optional(),
      codec_name: z.string().optional(),
    }),
  ),
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Replay e2e assertion failed: ${message}`);
  }
}

function findChromiumExecutable(env: NodeJS.ProcessEnv): string {
  const explicit = [
    env.WAGGLE_CHROMIUM_PATH,
    env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    env.CHROME_PATH,
  ];
  const installed = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  const cacheRoot =
    env.LOCALAPPDATA === undefined ? null : path.join(env.LOCALAPPDATA, 'ms-playwright');
  const cached: string[] = [];
  if (cacheRoot !== null && existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot).sort().reverse()) {
      for (const relative of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
        cached.push(path.join(cacheRoot, entry, relative));
      }
    }
  }
  const found = [...explicit, ...cached, ...installed].find(
    (candidate): candidate is string => candidate !== undefined && existsSync(candidate),
  );
  if (found === undefined) {
    throw new Error(
      'No Chromium executable found. Set WAGGLE_CHROMIUM_PATH or install a Playwright Chromium cache.',
    );
  }
  return found;
}

function createProject(projectDir: string, startUrl: string): void {
  for (const subdir of PROJECT_SUBDIRS) {
    mkdirSync(path.join(projectDir, subdir), { recursive: true });
  }
  const manifest = {
    ...createDefaultManifest('replay-e2e'),
    createdAt: '2026-08-21T00:00:00.000Z',
    presets: {
      '16x9': { width: 640, height: 360, fps: 24 },
      '9x16': { width: 360, height: 640, fps: 24 },
    },
    defaults: { preset: '16x9' },
  };
  writeFileSync(
    path.join(projectDir, 'waggle.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  const flow = WalkthroughFlowSchema.parse({
    title: 'Moved button replay e2e',
    steps: [
      {
        type: 'setViewport',
        width: 800,
        height: 600,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true,
        waggle: { classification: 'state-change', masked: false },
      },
      {
        type: 'navigate',
        url: startUrl,
        waggle: { classification: 'navigate', routeAfter: '/', masked: false },
      },
      {
        type: 'click',
        timeout: 1000,
        selectors: [
          `[data-testid="${TEST_IDS.ctaStart}"]`,
          `aria/${CTA_START_TEXT}[role="button"]`,
        ],
        offsetX: 18,
        offsetY: 10,
        waggle: {
          classification: 'state-change',
          routeAfter: '/login',
          element: {
            role: 'button',
            name: CTA_START_TEXT,
            rect: { x: 280, y: 180, w: 160, h: 40 },
          },
          masked: false,
        },
      },
    ],
    waggle: {
      schemaVersion: WAGGLE_IR_SCHEMA_VERSION,
      recordedViewport: { w: 1280, h: 720, dpr: 1 },
      startEpochMs: 1_700_000_000_000,
      cursorTrail: [
        { t: 0, x: 100, y: 100 },
        { t: 400, x: 360, y: 200 },
      ],
      clicks: [
        { t: 400, x: 360, y: 200, down: true },
        { t: 450, x: 360, y: 200, down: false },
      ],
    },
  });
  writeNextIrVersion(projectDir, flow);
}

function assertH264VideoOnly(filePath: string, env: NodeJS.ProcessEnv): void {
  const stdout = execFileSync(
    resolveFfprobePath(env),
    ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', filePath],
    { encoding: 'utf8', env },
  );
  const parsed = ProbeSchema.parse(JSON.parse(stdout));
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');
  assert(video?.codec_name === 'h264', `${filePath} must contain H.264 video`);
  assert(
    !parsed.streams.some((stream) => stream.codec_type === 'audio'),
    `${filePath} must be A/V-free capture with no audio stream`,
  );
}

async function main(): Promise<void> {
  const fixture = await startFixtureApp({ variant: 'moved-button' });
  const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-replay-e2e-'));
  const env = { ...process.env, WAGGLE_RENDER_CONCURRENCY: '2' };
  const executablePath = findChromiumExecutable(env);
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    createProject(projectDir, fixture.url);
    const regen = await runRegen({
      projectDir,
      presetIds: ['16x9', 'desktop'],
      browser,
      env,
      fps: 12,
      minDwellMs: 25,
    });

    assert(
      regen.report.success,
      `regen report must succeed: ${JSON.stringify(regen.report.presets.map((preset) => ({ presetId: preset.presetId, render: preset.render, failures: preset.steps.filter((step) => !step.ok) })))}`,
    );
    assert(regen.report.presets.length === 2, 'both alias replay presets must run');
    const native = regen.report.presets.find((preset) => preset.presetId === '16x9');
    const desktop = regen.report.presets.find((preset) => preset.presetId === 'desktop');
    assert(native !== undefined, '16x9 preset result must exist');
    assert(desktop !== undefined, 'desktop preset result must exist');
    assert(native.reflow === 'native', 'responsive fixture must replay natively at 16x9');
    assert(
      native.capture.width === 1920 && native.capture.height === 1080,
      '16x9 capture dimensions must match the replay preset',
    );
    assert(
      desktop.capture.width === 1440 && desktop.capture.height === 900,
      'desktop capture dimensions must survive the recorded setViewport step',
    );
    assert(
      native.driftNotes.some((note) => note.usedAlternativeIndex === 1),
      'moved button must resolve through the fallback selector',
    );

    for (const preset of [native, desktop]) {
      const videoRef = preset.videoRef;
      const manifestRef = preset.manifestRef;
      assert(videoRef !== null, `${preset.presetId} must identify its replay video`);
      assert(manifestRef !== null, `${preset.presetId} must identify its timing manifest`);
      assert(
        preset.render !== null && !('error' in preset.render),
        `${preset.presetId} must composite successfully`,
      );
      assert(
        preset.render.sourceKind === 'replay',
        `${preset.presetId} compositor source must be replay`,
      );
      assert(
        preset.render.sourceReplayPresetId === preset.presetId,
        `${preset.presetId} report must preserve replay source identity`,
      );
      assert(
        preset.render.sourceManifestRef === manifestRef,
        `${preset.presetId} report must preserve manifest identity`,
      );
      const renderMetadata = JSON.parse(
        readFileSync(path.resolve(projectDir, `${preset.render.outputPath}.render.json`), 'utf8'),
      ) as {
        sourceKind?: string;
        sourceIdentity?: { replayPresetId?: string; manifestRef?: string };
      };
      assert(
        renderMetadata.sourceKind === 'replay',
        `${preset.presetId} render metadata must prove replay source`,
      );
      assert(
        renderMetadata.sourceIdentity?.replayPresetId === preset.presetId,
        `${preset.presetId} render metadata must name its replay preset`,
      );
      assert(
        renderMetadata.sourceIdentity?.manifestRef === manifestRef,
        `${preset.presetId} render metadata must name its timing manifest`,
      );
      assertH264VideoOnly(path.resolve(projectDir, videoRef), env);
      const probed = await probeMedia(path.resolve(projectDir, videoRef), env);
      assert(
        probed.width === preset.capture.width,
        `${preset.presetId} video width must match its manifest`,
      );
      assert(
        probed.height === preset.capture.height,
        `${preset.presetId} video height must match its manifest`,
      );
      assert(
        Math.abs(probed.durationMs - preset.capture.durationMs) < 500,
        `${preset.presetId} video duration ${probed.durationMs}ms must align with its timing manifest ${preset.capture.durationMs}ms`,
      );
      const replayManifest = JSON.parse(
        readFileSync(path.resolve(projectDir, manifestRef), 'utf8'),
      ) as { steps?: { screenshotRef?: string | null }[] };
      assert(
        replayManifest.steps?.every(
          (record) =>
            record.screenshotRef === null ||
            (record.screenshotRef !== undefined && !path.isAbsolute(record.screenshotRef)),
        ),
        `${preset.presetId} screenshot references must be capture-relative`,
      );
    }
    assert(
      native.render !== null &&
        desktop.render !== null &&
        !('error' in native.render) &&
        !('error' in desktop.render) &&
        native.render.outputPath !== desktop.render.outputPath,
      'alias replay presets must not overwrite one shared compose output',
    );
    assert(native.render.reframe === 'native', '16x9 replay source must composite natively');
    assert(
      desktop.render.reframe === 'reframed',
      'desktop replay source must prove the compositor reframe path',
    );

    const currentFlow = WalkthroughFlowSchema.parse(
      JSON.parse(readFileSync(path.join(projectDir, 'walkthrough.v1.json'), 'utf8')),
    );
    const reframed = await runReplaySession({
      flow: currentFlow,
      irVersion: 1,
      presetId: '9x16',
      outputDir: path.join(projectDir, 'recordings', 'replay', 'forced-reframed'),
      forceReframed: true,
      browser,
      env,
      fps: 12,
      minDwellMs: 25,
    });
    assert(
      reframed.manifest.reflow === 'reframed',
      'forced portrait sample must be labeled reframed',
    );
    assert(reframed.manifest.focusTrack.length > 0, 'reframed sample must carry a focus track');
    assert(reframed.manifest.steps.length === 3, 'timing manifest must record every replayed step');

    mkdirSync(QA_DIR, { recursive: true });
    copyFileSync(regen.reportPath, path.join(QA_DIR, 'drift-e2e-run-report.json'));
    const nativeManifestRef = native.manifestRef;
    assert(nativeManifestRef !== null, 'native manifest identity must remain available');
    copyFileSync(
      path.resolve(projectDir, nativeManifestRef),
      path.join(QA_DIR, 'native-replay-manifest.json'),
    );
    copyFileSync(reframed.manifestPath, path.join(QA_DIR, 'reframed-replay-manifest.json'));
    const nativeScreenshot = path.join(
      path.dirname(path.resolve(projectDir, nativeManifestRef)),
      'screenshots',
      'step-002.png',
    );
    const reframedScreenshot = path.join(
      path.dirname(reframed.manifestPath),
      'screenshots',
      'step-002.png',
    );
    copyFileSync(nativeScreenshot, path.join(QA_DIR, 'native-step-002.png'));
    copyFileSync(reframedScreenshot, path.join(QA_DIR, 'reframed-step-002.png'));

    process.stdout.write(
      `Replay e2e passed with ${executablePath}. Evidence written to ${QA_DIR}.\n`,
    );
  } finally {
    await browser.close();
    await fixture.close();
    rmSync(projectDir, { recursive: true, force: true });
  }
}

await main();
