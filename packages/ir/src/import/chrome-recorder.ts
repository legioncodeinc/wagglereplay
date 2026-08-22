// SPDX-License-Identifier: AGPL-3.0-or-later
import type { WalkthroughFlow, WalkthroughStep } from '../schema/flow.js';
import type { StepCore, StepType } from '../schema/step-core.js';
import {
  type RecordedViewport,
  type StepClassification,
  WAGGLE_IR_SCHEMA_VERSION,
} from '../schema/waggle-extensions.js';
import { assertUserFlowCore, assertWalkthroughFlow } from '../validate.js';

/**
 * Chrome DevTools Recorder JSON import (ADR-001: "Chrome Recorder flows
 * import directly").
 *
 * A bare Recorder export carries no `waggle` keys at all, so import is a
 * pure addition: the step core is passed through untouched and the
 * required Waggle keys are filled in. Optional Waggle keys are left ABSENT
 * rather than stubbed, because a stub would be indistinguishable from a
 * real recorded value downstream. The only values derived here are ones
 * the Recorder actually recorded (the viewport, from a `setViewport`
 * step) or ones that follow mechanically from the step type (the
 * classification).
 */

/**
 * Used when the Recorder export contains no `setViewport` step and the
 * caller supplies no override. 1280x800 at dpr 1 is the Chrome Recorder's
 * own common desktop capture size and a safe, obviously-default value to
 * re-project away from later (../coords/projection.ts).
 */
export const DEFAULT_RECORDED_VIEWPORT: RecordedViewport = { w: 1280, h: 800, dpr: 1 };

export interface ChromeRecorderImportOptions {
  /**
   * Overrides the recorded viewport. When omitted, the viewport is taken
   * from the first `setViewport` step in the flow, and only if there is
   * none does `DEFAULT_RECORDED_VIEWPORT` apply.
   */
  readonly recordedViewport?: RecordedViewport;
  /**
   * Absolute wall-clock anchor for the flow's relative times. Defaults to
   * `0`: a Recorder export carries no timing information, and defaulting
   * to `Date.now()` would make import non-deterministic and every
   * re-import produce a spurious diff in a git-committed IR.
   */
  readonly startEpochMs?: number;
  readonly userAgent?: string;
}

const CLASSIFICATION_BY_STEP_TYPE: Readonly<Record<StepType, StepClassification>> = {
  navigate: 'navigate',
  change: 'input',
  keyDown: 'input',
  keyUp: 'input',
  scroll: 'scroll',
  click: 'state-change',
  doubleClick: 'state-change',
  hover: 'state-change',
  close: 'state-change',
  customStep: 'state-change',
  emulateNetworkConditions: 'state-change',
  setViewport: 'state-change',
  waitForElement: 'state-change',
  waitForExpression: 'state-change',
};

/** The storyboard classification a bare Recorder step maps to. */
export function classifyRecorderStep(type: StepType): StepClassification {
  return CLASSIFICATION_BY_STEP_TYPE[type];
}

function viewportFromSteps(steps: readonly StepCore[]): RecordedViewport | null {
  for (const step of steps) {
    if (step.type === 'setViewport') {
      return { w: step.width, h: step.height, dpr: step.deviceScaleFactor };
    }
  }
  return null;
}

/**
 * Imports a bare Chrome Recorder / Puppeteer Replay export as a
 * Walkthrough IR flow.
 *
 * Throws `IrValidationError` if the input is not a valid Recorder export,
 * naming the offending JSON path. The returned flow is re-validated
 * against the full IR schema before it is handed back, so a defaulting bug
 * here surfaces as a validation failure rather than as a malformed IR
 * written to disk.
 */
export function importChromeRecorderFlow(
  input: unknown,
  options: ChromeRecorderImportOptions = {},
): WalkthroughFlow {
  const core = assertUserFlowCore(input, 'Chrome Recorder export');

  const recordedViewport =
    options.recordedViewport ?? viewportFromSteps(core.steps) ?? DEFAULT_RECORDED_VIEWPORT;

  const steps: WalkthroughStep[] = core.steps.map((step) => ({
    ...step,
    waggle: {
      classification: classifyRecorderStep(step.type),
      masked: false,
    },
  }));

  const flow = {
    ...core,
    steps,
    waggle: {
      schemaVersion: WAGGLE_IR_SCHEMA_VERSION,
      recordedViewport,
      ...(options.userAgent === undefined ? {} : { userAgent: options.userAgent }),
      startEpochMs: options.startEpochMs ?? 0,
      cursorTrail: [],
      clicks: [],
    },
  };

  return assertWalkthroughFlow(flow, 'Chrome Recorder export (after Waggle defaulting)');
}
