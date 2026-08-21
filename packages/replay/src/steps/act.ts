import type { WalkthroughStep } from '@waggle/ir';
import type { Locator, Page } from 'playwright-core';
import type { StepFailureDetail } from './step-failure.js';

/**
 * The step-type to Playwright act mapping (prd-009 AC1).
 *
 * One function per IR step type, plus a dispatch table. The mapping is
 * deliberately total: every type in the Puppeteer Replay schema has an
 * entry, and the ones a replay genuinely cannot perform
 * (`customStep`, whose semantics live outside the document) produce a
 * structured failure naming the step, never an exception.
 *
 * Credential fill (prd-010 AC2) hooks in here and ONLY here: `change`
 * steps run through the injected `actWithValue` boundary at act time.
 * A resolved secret remains inside that callback and never enters the IR
 * or a public replay result.
 */

/** Maps the IR's pointer-button names onto Playwright's. */
const BUTTON_MAP: Record<string, 'left' | 'right' | 'middle'> = {
  primary: 'left',
  auxiliary: 'middle',
  secondary: 'right',
};

export type CustomStepHandler = (
  step: Extract<WalkthroughStep, { type: 'customStep' }>,
  page: Page,
) => Promise<void>;

export type ActWithValue = (
  step: Extract<WalkthroughStep, { type: 'change' }>,
  action: (resolvedValue: string) => Promise<void>,
) => Promise<void>;

export interface ActContext {
  readonly page: Page;
  /** The located target, already resolved through the fallback cascade. */
  readonly target: Locator | null;
  /** Per-step timeout for the act itself, in ms. */
  readonly timeoutMs: number;
  /**
   * The matching IR pointer-down coordinate, projected into the replay
   * viewport. Click focus prefers this over the element-relative offset.
   */
  readonly recordedClickPoint?: { readonly x: number; readonly y: number };
  /** Keeps credential resolution and the browser action in one scrubbed boundary. */
  readonly actWithValue?: ActWithValue;
  /** Optional handlers for `customStep`s, keyed by the step's name. */
  readonly customStepHandlers?: Readonly<Record<string, CustomStepHandler>>;
  /** Called with the scrubbed failure detail when a step fails; used by the orchestrator. */
  readonly onUnsupported?: (detail: StepFailureDetail) => void;
}

interface ActOutcome {
  /**
   * Focus point in viewport CSS pixels. It is captured before the action
   * because the action may move, replace, or remove its target.
   */
  readonly center: { readonly x: number; readonly y: number } | null;
}

function unsupported(
  ctx: ActContext,
  step: WalkthroughStep,
  message: string,
): { failed: StepFailureDetail } {
  return {
    failed: {
      stepIndex: -1,
      stepType: step.type,
      phase: 'unsupported',
      message,
      attemptedSelectors: [],
      afterDrift: false,
    },
  };
}

/**
 * Executes the step's action. Returns the act-time element center (the
 * focus-track input, prd-009 AC5) or a structured failure detail.
 */
export async function actStep(
  step: WalkthroughStep,
  ctx: ActContext,
): Promise<ActOutcome | { failed: StepFailureDetail }> {
  const { page, target, timeoutMs } = ctx;

  const boxBeforeAction = target === null ? null : await target.boundingBox().catch(() => null);
  const centerBeforeAction =
    boxBeforeAction === null
      ? null
      : {
          x: boxBeforeAction.x + boxBeforeAction.width / 2,
          y: boxBeforeAction.y + boxBeforeAction.height / 2,
        };

  const clickFocusPoint = (offsets: {
    offsetX: number;
    offsetY: number;
  }): { x: number; y: number } | null => {
    if (boxBeforeAction !== null) {
      return {
        x: boxBeforeAction.x + Math.max(0, Math.min(boxBeforeAction.width, offsets.offsetX)),
        y: boxBeforeAction.y + Math.max(0, Math.min(boxBeforeAction.height, offsets.offsetY)),
      };
    }
    return ctx.recordedClickPoint ?? centerBeforeAction;
  };

  const centerOf = (): { x: number; y: number } | null => {
    if (target === null) {
      return null;
    }
    return centerBeforeAction;
  };

  const positionFromOffsets = (offsets: {
    offsetX: number;
    offsetY: number;
  }): { position: { x: number; y: number } } | { failed: StepFailureDetail } => {
    // Recorded offsetX/offsetY are DOM-event offsets: relative to the
    // element's padding edge, which is Playwright's `position` frame.
    // Out-of-bounds offsets mean the DOM changed shape since recording;
    // clicking the center is the honest fallback and is noted, not silent.
    if (target === null) {
      return {
        failed: {
          stepIndex: -1,
          stepType: 'click',
          phase: 'act',
          message: 'Click step had no located target to act on.',
          attemptedSelectors: [],
          afterDrift: false,
        },
      };
    }
    return { position: { x: offsets.offsetX, y: offsets.offsetY } };
  };

  switch (step.type) {
    case 'click':
    case 'doubleClick': {
      if (target === null) {
        return unsupported(ctx, step, `${step.type} step had selectors but none resolved.`);
      }
      const positioned = positionFromOffsets(step);
      if ('failed' in positioned) {
        return positioned;
      }
      const button = step.button !== undefined ? BUTTON_MAP[step.button] : undefined;
      if (step.button !== undefined && button === undefined) {
        return unsupported(
          ctx,
          step,
          `Pointer button "${step.button}" has no Playwright mapping (replay supports primary, auxiliary, secondary).`,
        );
      }
      const options: Record<string, unknown> = { timeout: timeoutMs, ...positioned };
      if (button !== undefined) {
        options.button = button;
      }
      if (step.type === 'click') {
        await target.click(options);
      } else {
        await target.dblclick(options);
      }
      return { center: clickFocusPoint(step) };
    }

    case 'hover': {
      if (target === null) {
        return unsupported(ctx, step, 'Hover step had selectors but none resolved.');
      }
      await target.hover({ timeout: timeoutMs });
      return { center: centerOf() };
    }

    case 'change': {
      if (target === null) {
        return unsupported(ctx, step, 'Change step had selectors but none resolved.');
      }
      if (ctx.actWithValue !== undefined) {
        await ctx.actWithValue(step, async (value) => {
          await target.fill(value, { timeout: timeoutMs });
        });
        return { center: centerOf() };
      }
      await target.fill(step.value, { timeout: timeoutMs });
      return { center: centerOf() };
    }

    case 'keyDown':
    case 'keyUp': {
      if (step.type === 'keyDown') {
        await page.keyboard.down(step.key);
      } else {
        await page.keyboard.up(step.key);
      }
      return { center: centerOf() };
    }

    case 'navigate': {
      await page.goto(step.url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
      return { center: null };
    }

    case 'scroll': {
      if (step.selectors !== undefined && target !== null) {
        await target.evaluate(
          (element, deltas) => {
            element.scrollBy(deltas.x ?? 0, deltas.y ?? 0);
          },
          { x: step.x, y: step.y },
        );
      } else {
        await page.evaluate(
          (deltas) => {
            const scroller = document.scrollingElement ?? document.documentElement;
            scroller.scrollBy(deltas.x ?? 0, deltas.y ?? 0);
          },
          { x: step.x, y: step.y },
        );
      }
      return { center: centerOf() };
    }

    case 'setViewport': {
      // The replay preset owns the context viewport. A Recorder export
      // commonly starts with setViewport for the original recording, but
      // honoring it here would overwrite every portrait/mobile preset.
      return { center: null };
    }

    case 'waitForElement': {
      if (target === null) {
        return unsupported(ctx, step, 'Wait-for-element step had selectors but none resolved.');
      }
      await target.waitFor({
        state: step.visible === false ? 'attached' : 'visible',
        timeout: timeoutMs,
      });
      return { center: centerOf() };
    }

    case 'waitForExpression': {
      await page.waitForFunction(step.expression, undefined, { timeout: timeoutMs });
      return { center: null };
    }

    case 'emulateNetworkConditions': {
      const cdp = await ctx.page.context().newCDPSession(ctx.page);
      try {
        await cdp.send('Network.emulateNetworkConditions', {
          offline: step.download === 0 && step.upload === 0,
          downloadThroughput: step.download,
          uploadThroughput: step.upload,
          latency: step.latency,
        });
      } finally {
        await cdp.detach().catch(() => undefined);
      }
      return { center: null };
    }

    case 'close': {
      await page.close();
      return { center: null };
    }

    case 'customStep': {
      const handler = ctx.customStepHandlers?.[step.name];
      if (handler === undefined) {
        return unsupported(
          ctx,
          step,
          `customStep "${step.name}" has no replay handler; a replay cannot know what a custom step did.`,
        );
      }
      await handler(step, page);
      return { center: null };
    }
  }
}
