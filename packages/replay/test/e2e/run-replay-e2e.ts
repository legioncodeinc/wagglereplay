// SPDX-License-Identifier: AGPL-3.0-or-later
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
import { probeMedia, resolveFfmpegPath, resolveFfprobePath, run } from '@waggle/compose';
import { CTA_START_TEXT, ROUTE_PATHS, startFixtureApp, TEST_IDS } from '@waggle/fixture-demo-app';
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
  '../../../../library/requirements/completed/prd-009-replay-engine/qa',
);

/**
 * The replay-side credential pixel canary (2026-08-21 Run 4 guardrail
 * pass, HANDOFF-4 section 6 item 3): the ingest path has proven black-box
 * redaction with real ffmpeg since prd-010; this is the replay-path
 * analogue. A bound secret env ref fills the fixture password field
 * during replay, the persistent overlay covers it, and real ffmpeg proves
 * the field region is black in BOTH the per-step PNG and the captured
 * MP4's final frame, plus the canary value is absent from every text
 * artifact the run writes. A test-only canary value, never a real secret.
 */
const SECRET_ENV_REF = 'WAGGLE_E2E_SECRET_CANARY';
const SECRET_CANARY_VALUE = 'WAGGLE_TEST_ONLY_REPLAY_CANARY';

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
      {
        type: 'change',
        timeout: 1000,
        selectors: [`[data-testid="${TEST_IDS.inputUsername}"]`],
        value: 'demo-user',
        waggle: {
          classification: 'state-change',
          element: { role: 'textbox', name: 'Username', rect: { x: 660, y: 200, w: 600, h: 36 } },
          masked: false,
        },
      },
      {
        type: 'change',
        timeout: 1000,
        selectors: [`[data-testid="${TEST_IDS.inputPassword}"]`],
        value: '[REDACTED]',
        waggle: {
          classification: 'state-change',
          element: { role: 'textbox', name: 'Password', rect: { x: 660, y: 280, w: 600, h: 36 } },
          masked: true,
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
  writeFileSync(
    path.join(projectDir, 'credentials.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        credentials: [
          {
            id: 'e2e-fixture-login',
            label: 'Fixture login (e2e only)',
            secret_env: SECRET_ENV_REF,
            applies_to: {
              username: [],
              secret: [`[data-testid="${TEST_IDS.inputPassword}"]`],
              totp: [],
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  writeFileSync(
    path.join(projectDir, 'studio.json'),
    `${JSON.stringify({ credentialSetId: 'e2e-fixture-login' }, null, 2)}\n`,
    'utf8',
  );
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

/** Viewport CSS-pixel rect of the fixture password input at the 16x9 capture size. */
async function measurePasswordRect(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  loginUrl: string,
): Promise<{ x: number; y: number; w: number; h: number }> {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    const rect = await page.evaluate((testId) => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      if (element === null) throw new Error('password input not found');
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }, TEST_IDS.inputPassword);
    return rect;
  } finally {
    await page.close();
  }
}

/**
 * Real-ffmpeg black-region proof over `@waggle/compose`'s production
 * runner (the same binary resolution and spawn machinery the compositor
 * uses), applied to a still image: crop the field region and require
 * every decoded byte to be zero. The overlay paints #000; any leaked
 * glyph is a non-zero byte somewhere in the crop. Blackness is
 * transport-safe even though the runner reports stdout as a string:
 * UTF-8 decoding can never turn a non-zero byte sequence into U+0000.
 */
async function assertRegionBlack(
  label: string,
  imagePath: string,
  rect: { x: number; y: number; w: number; h: number },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const cropFilter = [
    'crop=',
    Math.floor(rect.w),
    ':',
    Math.floor(rect.h),
    ':',
    Math.floor(rect.x),
    ':',
    Math.floor(rect.y),
  ].join('');
  const result = await run(resolveFfmpegPath(env), [
    '-v',
    'error',
    '-i',
    imagePath,
    '-frames:v',
    '1',
    '-vf',
    cropFilter,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
  assert(result.code === 0, `${label}: ffmpeg region extraction failed: ${result.stderr}`);
  assert(result.stdout.length > 0, `${label}: ffmpeg region extraction produced zero bytes`);
  for (let index = 0; index < result.stdout.length; index += 1) {
    if (result.stdout.charCodeAt(index) !== 0) {
      throw new Error(`${label}: byte ${index} is non-zero; the credential overlay leaked`);
    }
  }
}

/**
 * Real-ffmpeg black-region proof over `@waggle/compose`'s production
 * runner (the same binary resolution and spawn machinery the compositor
 * uses), applied to the capture's FINAL frame, selected by exact frame
 * index from the replay manifest's framesWritten count (the last frame
 * written is ScreencastCapture's end-state screenshot, which carries the
 * persistent credential overlay). Frame-index selection is deterministic;
 * seeking or -update style "last frame" extraction is not, because the
 * H.264 encode can reorder presentation around the tail.
 */
async function assertLastFrameBlack(
  videoPath: string,
  frameCount: number,
  rect: { x: number; y: number; w: number; h: number },
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const cropFilter = [
    'crop=',
    Math.floor(rect.w),
    ':',
    Math.floor(rect.h),
    ':',
    Math.floor(rect.x),
    ':',
    Math.floor(rect.y),
  ].join('');
  const lastIndex = Math.max(0, frameCount - 1);
  const result = await run(resolveFfmpegPath(env), [
    '-v',
    'error',
    '-i',
    videoPath,
    '-vf',
    `select='eq(n,${String(lastIndex)})',${cropFilter}`,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
  assert(result.code === 0, `final-frame region extraction failed: ${result.stderr}`);
  assert(result.stdout.length > 0, 'final-frame region extraction produced zero bytes');
  // The video path is doubly lossy (CDP JPEG source, then H.264 encode):
  // black next to white rings a few counts near region edges. Text glyphs
  // render far brighter than codec noise, so the interior of the region
  // is held to a strict-but-lossy-aware ceiling, not exact zero.
  const CHANNEL_CEILING = 32;
  for (let index = 0; index < result.stdout.length; index += 1) {
    if (result.stdout.charCodeAt(index) > CHANNEL_CEILING) {
      throw new Error(
        `final video frame: byte ${index} is ${String(result.stdout.charCodeAt(index))}; the credential overlay leaked`,
      );
    }
  }
}

async function main(): Promise<void> {
  const fixture = await startFixtureApp({ variant: 'moved-button' });
  const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-replay-e2e-'));
  const env = {
    ...process.env,
    WAGGLE_RENDER_CONCURRENCY: '2',
    [SECRET_ENV_REF]: SECRET_CANARY_VALUE,
  };
  const executablePath = findChromiumExecutable(env);
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    createProject(projectDir, fixture.url);
    const passwordRect = await measurePasswordRect(
      browser,
      new URL(ROUTE_PATHS.login, fixture.url).toString(),
    );
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

    // --- Replay-side credential pixel canary (HANDOFF-4 section 6 item 3) ---
    const nativeVideoRef = native.videoRef;
    assert(nativeVideoRef !== null, 'native video ref must exist for the pixel canary');
    const nativeManifestRef = native.manifestRef;
    assert(nativeManifestRef !== null, 'native manifest ref must exist for the pixel canary');
    const nativeManifest = JSON.parse(
      readFileSync(path.resolve(projectDir, nativeManifestRef), 'utf8'),
    ) as { capture?: { framesWritten?: number } };
    const framesWritten = nativeManifest.capture?.framesWritten;
    assert(
      typeof framesWritten === 'number' && framesWritten > 0,
      'native manifest must record framesWritten',
    );
    const maskedScreenshot = path.join(
      path.dirname(path.resolve(projectDir, nativeManifestRef)),
      'screenshots',
      'step-004.png',
    );
    assert(existsSync(maskedScreenshot), 'masked step screenshot step-004.png must exist');
    await assertRegionBlack('masked step PNG', maskedScreenshot, passwordRect, env);
    await assertLastFrameBlack(
      path.resolve(projectDir, nativeVideoRef),
      framesWritten,
      passwordRect,
      env,
    );
    const textArtifacts = [
      regen.reportPath,
      path.resolve(projectDir, nativeManifestRef),
      path.resolve(projectDir, `${native.render?.outputPath ?? ''}.render.json`),
    ];
    for (const artifact of textArtifacts) {
      assert(
        !readFileSync(artifact, 'utf8').includes(SECRET_CANARY_VALUE),
        `credential canary value must be absent from ${artifact}`,
      );
    }

    // --- Genuine reframed sample: the probe measures /wide and decides ---
    const wideFlow = WalkthroughFlowSchema.parse({
      title: 'Genuine reflow probe sample',
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
          url: new URL(ROUTE_PATHS.wide, fixture.url).toString(),
          waggle: { classification: 'navigate', routeAfter: ROUTE_PATHS.wide, masked: false },
        },
        {
          type: 'click',
          timeout: 1000,
          selectors: [`[data-testid="${TEST_IDS.wideContent}"]`],
          offsetX: 20,
          offsetY: 12,
          waggle: {
            classification: 'state-change',
            element: {
              role: 'generic',
              name: 'wide content',
              rect: { x: 24, y: 120, w: 1600, h: 40 },
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
    const reframed = await runReplaySession({
      flow: wideFlow,
      irVersion: 1,
      presetId: '9x16',
      outputDir: path.join(projectDir, 'recordings', 'replay', 'genuine-reframed'),
      browser,
      env,
      fps: 12,
      minDwellMs: 25,
    });
    assert(
      reframed.manifest.reflow === 'reframed',
      'the /wide fixture must be decided reframed by a genuine probe measurement',
    );
    assert(
      reframed.manifest.reflowReason?.includes('horizontal overflow') === true,
      `genuine probe reason must cite measured overflow, got: ${reframed.manifest.reflowReason ?? '(none)'}`,
    );
    assert(reframed.manifest.focusTrack.length > 0, 'reframed sample must carry a focus track');
    assert(reframed.manifest.steps.length === 3, 'timing manifest must record every replayed step');

    mkdirSync(QA_DIR, { recursive: true });
    copyFileSync(regen.reportPath, path.join(QA_DIR, 'drift-e2e-run-report.json'));
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
      `Replay e2e passed with ${executablePath}. Evidence written to ${QA_DIR}.\n` +
        'Credential pixel canary: masked field black in step PNG and captured MP4; canary absent from text artifacts.\n' +
        'Reframed sample regenerated from a genuine probe measurement (horizontal overflow on /wide), not forceReframed.\n',
    );
  } finally {
    await browser.close();
    await fixture.close();
    rmSync(projectDir, { recursive: true, force: true });
  }
}

await main();
