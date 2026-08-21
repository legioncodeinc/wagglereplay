import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  projectPoint,
  type SensitiveTextScrubber,
  type WalkthroughFlow,
  type WalkthroughStep,
} from '@waggle/ir';
import { type Browser, chromium } from 'playwright-core';
import { ScreencastCapture } from '../capture/screencast.js';
import {
  buildReplayManifest,
  type FocusPoint,
  type ReplayManifest,
} from '../capture/timing-manifest.js';
import { createDeterministicContext } from '../determinism/context.js';
import { capturePresetFor, probeReflow, type ReflowProbeResult } from '../presets/reflow-probe.js';
import { resolveReplayPreset } from '../presets/registry.js';
import { buildFocusTrack } from '../reframe/focus-track.js';
import type { ActWithValue, CustomStepHandler } from '../steps/act.js';
import { executeStep, type StepExecutionResult } from '../steps/replay-step.js';

/**
 * The replay session orchestrator: one IR, one preset, one capture.
 *
 * Pipeline: resolve preset, probe reflow at that viewport (ADR-011),
 * create the deterministic context at the dictated CAPTURE viewport,
 * start the CDP screencast pump, execute every step through the
 * locate/act/settle/screenshot ladder, stop the pump, and write the
 * video plus the timing manifest. Everything a regen (AC6) or a
 * concurrent preset job (AC8) needs is one call to `runReplaySession`.
 */

export const DEFAULT_CAPTURE_FPS = 30;
export const DEFAULT_STEP_TIMEOUT_MS = 5000;
/**
 * Default minimum dwell between steps when pacing (AC3): the video a
 * replay produces is watched, not parsed, so back-to-back steps need a
 * breath between them even when the IR has no timing anchor.
 */
export const DEFAULT_MIN_STEP_DWELL_MS = 300;

export const REPLAY_MANIFEST_FILENAME = 'replay.manifest.json';

export interface ReplaySessionOptions {
  readonly flow: WalkthroughFlow;
  readonly irVersion: number;
  /** Replay preset id from this package's registry. */
  readonly presetId: string;
  /** Directory the capture writes into (video, manifest, screenshots/). */
  readonly outputDir: string;
  readonly fps?: number;
  readonly stepTimeoutMs?: number;
  /** ADR-011's user override: force the reframed path without probing. */
  readonly forceReframed?: boolean;
  /** Overrides the first navigate step's URL (tests point it at a local fixture). */
  readonly startUrl?: string;
  readonly killAnimations?: boolean;
  readonly timezoneId?: string;
  readonly locale?: string;
  readonly storageStatePath?: string;
  readonly networkExclusions?: readonly string[];
  readonly quietMs?: number;
  /** Injected browser (tests, ADR-004 runner profiles); launched when absent. */
  readonly browser?: Browser;
  readonly env?: NodeJS.ProcessEnv;
  /** Preferred credential boundary: value resolution and fill share one scrubbed callback. */
  readonly actWithValue?: ActWithValue;
  /** Applied to every structured failure before manifest/report persistence. */
  readonly scrubMessage?: SensitiveTextScrubber;
  /** prd-010 AC4: which steps are credential fills (drives screenshot redaction). */
  readonly isCredentialStep?: (step: WalkthroughStep, stepIndex: number) => boolean;
  /** Handlers for customStep entries; unknown names fail structured. */
  readonly customStepHandlers?: Readonly<Record<string, CustomStepHandler>>;
  /** Continue past failed steps instead of stopping at the first one. */
  readonly continueOnFailure?: boolean;
  /** Skip the screencast capture (probe or dry runs). Steps still execute. */
  readonly capture?: boolean;
  /**
   * Pace steps onto the IR's recorded timeline (default true): a click
   * step waits until its recorded click time, other steps observe a
   * minimum dwell. This is what keeps the compositor's IR-timed layers
   * (cursor, ripples, auto-zoom) aligned with replay-sourced video: the
   * capture's duration tracks the recording's duration instead of
   * collapsing every settle into nothing.
   */
  readonly pace?: boolean;
  /** Minimum dwell between un-anchored steps when pacing. */
  readonly minDwellMs?: number;
}

export interface ReplaySessionResult {
  readonly manifest: ReplayManifest;
  readonly manifestPath: string;
  readonly videoPath: string;
  readonly probe: ReflowProbeResult;
  readonly steps: readonly StepExecutionResult[];
}

/** The URL a session starts from: the first navigate step, or the override. */
export function sessionStartUrl(flow: WalkthroughFlow, override?: string): string | null {
  if (override !== undefined && override !== '') {
    return override;
  }
  for (const step of flow.steps) {
    if (step.type === 'navigate') {
      return step.url;
    }
  }
  return null;
}

export async function runReplaySession(
  options: ReplaySessionOptions,
): Promise<ReplaySessionResult> {
  const preset = resolveReplayPreset(options.presetId);
  const fps = options.fps ?? DEFAULT_CAPTURE_FPS;
  const stepTimeout = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS;
  const startUrl = sessionStartUrl(options.flow, options.startUrl);

  const browser = options.browser ?? (await chromium.launch({ headless: true }));
  const ownsBrowser = options.browser === undefined;

  try {
    // --- Reflow probe (AC4) ------------------------------------------------
    let probe: ReflowProbeResult | null = null;
    if (startUrl !== null) {
      const probeContext = await browser.newContext({
        viewport: { width: preset.width, height: preset.height },
        deviceScaleFactor: preset.deviceScaleFactor,
        isMobile: preset.isMobile,
        hasTouch: preset.hasTouch,
      });
      try {
        const probePage = await probeContext.newPage();
        probe = await probeReflow(probePage, {
          preset,
          url: startUrl,
          forceReframed: options.forceReframed,
        });
      } finally {
        await probeContext.close();
      }
    } else {
      probe = {
        presetId: preset.id,
        probedWidth: preset.width,
        probedHeight: preset.height,
        decision: 'reframed',
        horizontalOverflowPx: 0,
        reason: 'no navigate step to probe; captured at the master viewport',
      };
    }

    const capturePreset = capturePresetFor(probe);

    // --- Deterministic context (AC2) ----------------------------------------
    const context = await createDeterministicContext(browser, {
      viewportWidth: capturePreset.width,
      viewportHeight: capturePreset.height,
      deviceScaleFactor: capturePreset.deviceScaleFactor,
      isMobile: capturePreset.isMobile,
      hasTouch: capturePreset.hasTouch,
      killAnimations: options.killAnimations,
      timezoneId: options.timezoneId,
      locale: options.locale,
      storageStatePath: options.storageStatePath,
      networkExclusions: options.networkExclusions,
    });
    try {
      const page = await context.newPage();

      const screenshotsDir = path.join(options.outputDir, 'screenshots');
      mkdirSync(screenshotsDir, { recursive: true });
      const videoPath = path.join(options.outputDir, `${preset.id}.mp4`);

      // --- Screencast capture (AC3) -------------------------------------------
      const captureEnabled = options.capture ?? true;
      const capture = captureEnabled
        ? new ScreencastCapture({
            page,
            outputPath: videoPath,
            fps,
            maxWidth: capturePreset.width,
            maxHeight: capturePreset.height,
            env: options.env,
          })
        : null;

      let sessionStartEpoch = Date.now();
      const steps: StepExecutionResult[] = [];
      let captureStats = { received: 0, written: 0 };

      // Pacing bookkeeping: click steps map, in order, onto the IR's
      // press events (ingest built them that way), which is what lets the
      // capture reproduce the recording's rhythm.
      const pace = options.pace ?? true;
      const minDwell = options.minDwellMs ?? DEFAULT_MIN_STEP_DWELL_MS;
      const downClicks = options.flow.waggle.clicks.filter((click) => click.down);
      let clickAnchor = 0;
      const sleepUntil = async (targetEpoch: number): Promise<void> => {
        const remaining = targetEpoch - Date.now();
        if (remaining > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, remaining);
          });
        }
      };

      try {
        if (capture !== null) {
          await capture.start();
        }
        // Capture startup includes process launch, CDP setup, and the
        // seed JPEG. The replay timeline begins only after that work so
        // manifest offsets and encoded frame time share the same origin.
        sessionStartEpoch = Date.now();

        for (const [index, step] of options.flow.steps.entries()) {
          const click =
            step.type === 'click' || step.type === 'doubleClick'
              ? downClicks[clickAnchor]
              : undefined;
          if (pace) {
            if (click !== undefined) {
              await sleepUntil(sessionStartEpoch + click.t);
            } else if (step.type !== 'click' && step.type !== 'doubleClick') {
              const previous = steps[steps.length - 1];
              const previousEnd =
                previous !== undefined
                  ? sessionStartEpoch + previous.startOffsetMs + previous.durationMs
                  : sessionStartEpoch;
              await sleepUntil(previousEnd + minDwell);
            }
          }
          if (step.type === 'click' || step.type === 'doubleClick') {
            clickAnchor += 1;
          }
          const recordedClickPoint =
            click === undefined
              ? undefined
              : projectPoint(
                  click,
                  {
                    w: options.flow.waggle.recordedViewport.w,
                    h: options.flow.waggle.recordedViewport.h,
                  },
                  { w: capturePreset.width, h: capturePreset.height },
                );
          const result = await executeStep({
            stepIndex: index,
            step,
            page,
            timeoutMs: 'timeout' in step && step.timeout !== undefined ? step.timeout : stepTimeout,
            screenshotsDir,
            sessionStartEpoch,
            quietMs: options.quietMs,
            networkExclusions: options.networkExclusions,
            recordedClickPoint,
            actWithValue: options.actWithValue,
            scrubMessage: options.scrubMessage,
            customStepHandlers: options.customStepHandlers,
            isCredentialStep:
              options.isCredentialStep !== undefined
                ? options.isCredentialStep(step, index)
                : undefined,
          });
          steps.push(result);
          if (step.type === 'close' || (!result.ok && options.continueOnFailure !== true)) {
            break;
          }
        }
      } finally {
        if (capture !== null) {
          captureStats = await capture.stop();
        }
      }

      const durationMs = Math.max(1, Date.now() - sessionStartEpoch);

      // --- Focus track (AC5): reframed captures only --------------------------
      const focusTrack: FocusPoint[] =
        probe.decision === 'reframed'
          ? buildFocusTrack(steps, {
              viewportWidth: capturePreset.width,
              viewportHeight: capturePreset.height,
              durationMs,
            })
          : [];

      const manifest = buildReplayManifest({
        irVersion: options.irVersion,
        replayPresetId: preset.id,
        composePresetId: preset.composePresetId,
        reflow: probe.decision,
        reflowReason: probe.reason,
        capture: {
          width: capturePreset.width,
          height: capturePreset.height,
          fps,
          durationMs,
          framesReceived: captureStats.received,
          framesWritten: captureStats.written,
        },
        steps,
        focusTrack,
        screenshotBaseDir: options.outputDir,
      });

      const manifestPath = path.join(options.outputDir, REPLAY_MANIFEST_FILENAME);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      return {
        manifest,
        manifestPath,
        videoPath,
        probe,
        steps,
      };
    } finally {
      await context.close();
    }
  } finally {
    if (ownsBrowser) {
      await browser.close().catch(() => undefined);
    }
  }
}
