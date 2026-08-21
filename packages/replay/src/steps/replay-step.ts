import path from 'node:path';
import type { SensitiveTextScrubber, WalkthroughStep } from '@waggle/ir';
import type { Locator, Page } from 'playwright-core';
import { type ActWithValue, actStep, type CustomStepHandler } from './act.js';
import { locateWithCascade, type SelectorCandidate } from './selector-cascade.js';
import { type SettleOutcome, settleStep } from './settle.js';
import type { StepFailureDetail } from './step-failure.js';

/**
 * Per-step orchestration (prd-009 AC1): locate through the fallback
 * cascade, act per step type, settle through the ladder, take a
 * screenshot. A failure at any phase becomes a structured result; the
 * only exceptions that escape are infrastructure errors (browser died),
 * because those are not step failures.
 *
 * The screenshot is taken AFTER settle, so it shows the step's outcome.
 * Credential fields receive a persistent opaque overlay BEFORE the fill:
 * CDP screencast is continuous, so adding the box only around the still
 * screenshot would leave credential pixels in the replay video and shared
 * render. The overlay remains until navigation or context teardown.
 */

export interface StepExecutionOptions {
  readonly stepIndex: number;
  readonly step: WalkthroughStep;
  readonly page: Page;
  /** Per-step timeout budget, in ms; defaults are the caller's policy. */
  readonly timeoutMs: number;
  /** Directory screenshots are written into. */
  readonly screenshotsDir: string;
  /** Milliseconds since the session started; timing-manifest input (AC3). */
  readonly sessionStartEpoch: number;
  /** Matching pointer-down coordinate projected into the replay viewport. */
  readonly recordedClickPoint?: { readonly x: number; readonly y: number };
  /**
   * True when this step is a credential fill (prd-010 AC4). Drives the
   * pre-storage redaction box on the screenshot.
   */
  readonly isCredentialStep?: boolean;
  /** Settle options: quiet window and network exclusions. */
  readonly quietMs?: number;
  readonly networkExclusions?: readonly string[];
  /** Preferred act-time credential boundary. */
  readonly actWithValue?: ActWithValue;
  /** Final scrub applied to every structured failure before persistence. */
  readonly scrubMessage?: SensitiveTextScrubber;
  /** Handlers for `customStep`s, keyed by the step's name. */
  readonly customStepHandlers?: Readonly<Record<string, CustomStepHandler>>;
}

export interface SelectorUseRecord {
  /** The recorded alternative that resolved, verbatim from the IR. */
  readonly recorded: string;
  /** The Playwright selector that actually matched. */
  readonly playwright: string;
  readonly engine: SelectorCandidate['engine'];
  readonly alternativeIndex: number;
  /** True when a non-first alternative had to rescue the step (AC6 drift). */
  readonly drift: boolean;
}

export interface StepExecutionResult {
  readonly stepIndex: number;
  readonly stepType: string;
  readonly ok: boolean;
  /** ms since session start when the step began. */
  readonly startOffsetMs: number;
  /** ms between step start and settle completion. */
  readonly durationMs: number;
  readonly settle: SettleOutcome | null;
  readonly selector: SelectorUseRecord | null;
  readonly attemptedSelectors: readonly string[];
  readonly screenshotPath: string | null;
  /** Act-time element center in viewport CSS px; focus-track input (AC5). */
  readonly center: { readonly x: number; readonly y: number } | null;
  readonly failure: StepFailureDetail | null;
}

const REDACTION_OVERLAY_ID = '__waggle-redaction-box';

/**
 * Paints an opaque box over `target` before a credential fill. The box is
 * deliberately persistent: removing it after the still screenshot would
 * expose the filled value to the continuous screencast on the next frame.
 * Navigation removes it with the old document; context teardown removes it
 * at session end. A step-scoped id permits multiple credential fields on a
 * single page to remain redacted together.
 */
async function applyPersistentRedaction(target: Locator, overlayId: string): Promise<void> {
  await target.evaluate((element, overlayId) => {
    const previous = document.getElementById(overlayId);
    if (previous !== null) {
      previous.remove();
    }
    const rect = element.getBoundingClientRect();
    const box = document.createElement('div');
    box.id = overlayId;
    box.setAttribute('data-waggle-redaction', 'credential');
    const margin = 6;
    box.style.cssText =
      `position:fixed;left:${rect.left - margin}px;top:${rect.top - margin}px;` +
      `width:${rect.width + margin * 2}px;height:${rect.height + margin * 2}px;` +
      'background:#000;z-index:2147483647;pointer-events:none;';
    (document.documentElement || document.body).appendChild(box);
  }, overlayId);
}

/** Executes one step end to end and returns its structured result. */
export async function executeStep(options: StepExecutionOptions): Promise<StepExecutionResult> {
  const { step, page, stepIndex } = options;
  const startedWall = Date.now();
  const startOffsetMs = startedWall - options.sessionStartEpoch;
  const scrubMessage = options.scrubMessage ?? ((message: string) => message);

  const fail = (
    phase: StepFailureDetail['phase'],
    error: unknown,
    attempted: readonly string[],
    state: {
      selector?: SelectorUseRecord | null;
      settle?: SettleOutcome | null;
      screenshotPath?: string | null;
      center?: { readonly x: number; readonly y: number } | null;
    } = {},
  ): StepExecutionResult => ({
    stepIndex,
    stepType: step.type,
    ok: false,
    startOffsetMs,
    durationMs: Date.now() - startedWall,
    settle: state.settle ?? null,
    selector: state.selector ?? null,
    attemptedSelectors: attempted,
    screenshotPath: state.screenshotPath ?? null,
    center: state.center ?? null,
    failure: {
      stepIndex,
      stepType: step.type,
      phase,
      message: scrubMessage(error instanceof Error ? error.message : String(error)),
      attemptedSelectors: attempted,
      ...(error instanceof Error ? { causeName: error.name } : {}),
      afterDrift: state.selector?.drift ?? false,
    },
  });

  const hasSelectors =
    'selectors' in step && Array.isArray((step as { selectors?: unknown }).selectors);

  // --- Locate -------------------------------------------------------------
  let target: Locator | null = null;
  let selectorRecord: SelectorUseRecord | null = null;
  let attempted: string[] = [];
  if (hasSelectors) {
    const alternatives = (step as { selectors: readonly (string | readonly string[])[] }).selectors;
    let located;
    try {
      located = await locateWithCascade(page, alternatives, { timeoutMs: options.timeoutMs });
    } catch (error: unknown) {
      attempted = alternatives.map((alternative) =>
        typeof alternative === 'string' ? alternative : JSON.stringify(alternative),
      );
      return fail('locate', error, attempted);
    }
    if (located === null) {
      attempted = alternatives.map((alternative) =>
        typeof alternative === 'string' ? alternative : JSON.stringify(alternative),
      );
      return fail(
        'locate',
        new Error(
          `No selector alternative resolved within ${options.timeoutMs}ms; tried ${attempted.length} alternative(s).`,
        ),
        attempted,
      );
    }
    target = located.locator;
    selectorRecord = {
      recorded: located.candidate.recorded,
      playwright: located.candidate.playwrightSelector,
      engine: located.candidate.engine,
      alternativeIndex: located.alternativeIndex,
      drift: located.drift,
    };
    attempted = located.attempted.map((c) => c.playwrightSelector);
  }

  const credentialStep =
    options.isCredentialStep ?? ('waggle' in step ? step.waggle.masked : false);
  if (credentialStep && target !== null) {
    try {
      await applyPersistentRedaction(target, `${REDACTION_OVERLAY_ID}-${String(stepIndex)}`);
    } catch (error: unknown) {
      return fail('act', error, attempted, { selector: selectorRecord });
    }
  }

  // --- Act ----------------------------------------------------------------
  let center: { x: number; y: number } | null = null;
  let actOutcome;
  try {
    actOutcome = await actStep(step, {
      page,
      target,
      timeoutMs: options.timeoutMs,
      recordedClickPoint: options.recordedClickPoint,
      actWithValue: options.actWithValue,
      customStepHandlers: options.customStepHandlers,
    });
  } catch (error: unknown) {
    return fail('act', error, attempted, { selector: selectorRecord });
  }
  if ('failed' in actOutcome) {
    const detail: StepFailureDetail = {
      ...actOutcome.failed,
      stepIndex,
      message: scrubMessage(actOutcome.failed.message),
      attemptedSelectors: attempted,
      afterDrift: selectorRecord?.drift ?? false,
    };
    return {
      stepIndex,
      stepType: step.type,
      ok: false,
      startOffsetMs,
      durationMs: Date.now() - startedWall,
      settle: null,
      selector: selectorRecord,
      attemptedSelectors: attempted,
      screenshotPath: null,
      center: null,
      failure: detail,
    };
  }
  center = actOutcome.center;

  // A close step intentionally destroys the page. It cannot settle or
  // take a post-step screenshot, and the session must not run later steps
  // against that closed page.
  if (step.type === 'close') {
    return {
      stepIndex,
      stepType: step.type,
      ok: true,
      startOffsetMs,
      durationMs: Date.now() - startedWall,
      settle: null,
      selector: selectorRecord,
      attemptedSelectors: attempted,
      screenshotPath: null,
      center,
      failure: null,
    };
  }

  // --- Settle ---------------------------------------------------------------
  const expectedRoute = 'waggle' in step ? step.waggle.routeAfter : undefined;
  let settle: SettleOutcome;
  try {
    settle = await settleStep({
      page,
      target,
      expectedRoute,
      options: {
        timeoutMs: options.timeoutMs,
        quietMs: options.quietMs,
        networkExclusions: options.networkExclusions?.map((urlContains) => ({ urlContains })),
      },
    });
  } catch (error: unknown) {
    return fail('settle', error, attempted, { selector: selectorRecord, center });
  }

  // --- Screenshot -----------------------------------------------------------
  let screenshotPath: string | null = null;
  if (options.screenshotsDir !== '') {
    const fileName = `step-${String(stepIndex).padStart(3, '0')}.png`;
    const filePath = path.join(options.screenshotsDir, fileName);
    const shoot = async (): Promise<void> => {
      await page.screenshot({ path: filePath });
    };
    try {
      await shoot();
      screenshotPath = filePath;
    } catch (error: unknown) {
      return fail('screenshot', error, attempted, {
        selector: selectorRecord,
        settle,
        center,
      });
    }
  }

  return {
    stepIndex,
    stepType: step.type,
    ok: true,
    startOffsetMs,
    durationMs: Date.now() - startedWall,
    settle,
    selector: selectorRecord,
    attemptedSelectors: attempted,
    screenshotPath,
    center,
    failure: null,
  };
}
