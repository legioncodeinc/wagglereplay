// SPDX-License-Identifier: AGPL-3.0-or-later
import { type WalkthroughStep, WalkthroughStepSchema } from '@waggle/ir';
import type { Locator, Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import { actStep } from '../src/steps/act.js';
import { executeStep } from '../src/steps/replay-step.js';

const waggle = {
  classification: 'state-change',
  masked: false,
} as const;

function step(value: Record<string, unknown>): WalkthroughStep {
  const customWaggle = value.waggle as Partial<typeof waggle> | undefined;
  return WalkthroughStepSchema.parse({
    ...value,
    waggle: { ...waggle, ...customWaggle },
  });
}

function executionOptions(value: WalkthroughStep, page: Page) {
  return {
    stepIndex: 2,
    step: value,
    page,
    timeoutMs: 20,
    screenshotsDir: '',
    sessionStartEpoch: Date.now(),
  };
}

describe('actStep replay-specific behavior', () => {
  it('keeps the preset viewport when the recording contains setViewport', async () => {
    const setViewportSize = vi.fn();
    const page = { setViewportSize } as unknown as Page;
    const result = await actStep(
      step({
        type: 'setViewport',
        width: 800,
        height: 600,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        isLandscape: true,
      }),
      { page, target: null, timeoutMs: 20 },
    );
    expect(setViewportSize).not.toHaveBeenCalled();
    expect(result).toEqual({ center: null });
  });

  it('captures click focus before an action removes its target', async () => {
    let removed = false;
    const click = vi.fn(async () => {
      removed = true;
    });
    const target = {
      boundingBox: vi.fn(async () => (removed ? null : { x: 100, y: 200, width: 80, height: 40 })),
      click,
    } as unknown as Locator;
    const result = await actStep(
      step({
        type: 'click',
        selectors: ['#target'],
        offsetX: 12,
        offsetY: 8,
      }),
      { page: {} as Page, target, timeoutMs: 20, recordedClickPoint: { x: 4, y: 5 } },
    );
    expect(result).toEqual({ center: { x: 112, y: 208 } });
    expect(click).toHaveBeenCalledWith(expect.objectContaining({ position: { x: 12, y: 8 } }));
  });
});

describe('executeStep structured failures', () => {
  it('converts a locator exception into a locate StepFailure detail', async () => {
    const page = {
      locator() {
        throw new Error('selector engine failed');
      },
    } as unknown as Page;
    const result = await executeStep(
      executionOptions(
        step({ type: 'click', selectors: ['#target'], offsetX: 1, offsetY: 1 }),
        page,
      ),
    );
    expect(result.failure).toMatchObject({
      phase: 'locate',
      message: 'selector engine failed',
      causeName: 'Error',
    });
  });

  it('converts an action exception into an act StepFailure detail', async () => {
    const page = {
      goto: vi.fn(async () => {
        throw new Error('navigation failed');
      }),
    } as unknown as Page;
    const result = await executeStep(
      executionOptions(step({ type: 'navigate', url: 'http://fixture.invalid/' }), page),
    );
    expect(result.failure).toMatchObject({ phase: 'act', message: 'navigation failed' });
  });

  it('keeps credential resolution and fill errors inside actWithValue', async () => {
    const canary = 'canary-secret-value';
    const locator = {
      first() {
        return this;
      },
      waitFor: vi.fn(async () => undefined),
      boundingBox: vi.fn(async () => ({ x: 10, y: 10, width: 100, height: 20 })),
      fill: vi.fn(async () => {
        throw new Error(`browser echoed ${canary}`);
      }),
    };
    const page = {
      locator: vi.fn(() => locator),
    } as unknown as Page;
    const options = executionOptions(
      step({ type: 'change', selectors: ['#password'], value: '[REDACTED]' }),
      page,
    );
    const result = await executeStep({
      ...options,
      actWithValue: async (_changeStep, action) => {
        try {
          return await action(canary);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(message.replaceAll(canary, '[REDACTED]'));
        }
      },
    });
    expect(result.failure).toMatchObject({
      phase: 'act',
      message: 'browser echoed [REDACTED]',
    });
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it('converts a settle exception into a settle StepFailure detail', async () => {
    const page = {
      goto: vi.fn(async () => undefined),
      evaluate: vi.fn(async () => null),
    } as unknown as Page;
    const result = await executeStep(
      executionOptions(step({ type: 'navigate', url: 'http://fixture.invalid/' }), page),
    );
    expect(result.failure?.phase).toBe('settle');
  });

  it('converts a screenshot exception into a screenshot StepFailure detail', async () => {
    const page = {
      goto: vi.fn(async () => undefined),
      waitForURL: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => {
        throw new Error('disk full');
      }),
    } as unknown as Page;
    const options = executionOptions(
      step({
        type: 'navigate',
        url: 'http://fixture.invalid/next',
        waggle: { ...waggle, routeAfter: '/next' },
      }),
      page,
    );
    const result = await executeStep({ ...options, screenshotsDir: 'screenshots' });
    expect(result.failure).toMatchObject({ phase: 'screenshot', message: 'disk full' });
    expect(result.settle?.source).toBe('element-assertion');
  });

  it('passes the redaction overlay id into serialized browser callbacks', async () => {
    let overlay: {
      id: string;
      style: { cssText: string };
      setAttribute(name: string, value: string): void;
      remove(): void;
    } | null = null;
    const fakeDocument = {
      getElementById: (id: string) => (overlay?.id === id ? overlay : null),
      createElement: () => {
        const created = {
          id: '',
          style: { cssText: '' },
          setAttribute: vi.fn(),
          remove: () => {
            overlay = null;
          },
        };
        return created;
      },
      documentElement: {
        appendChild: (created: typeof overlay) => {
          overlay = created;
        },
      },
      body: null,
    };
    vi.stubGlobal('document', fakeDocument);
    try {
      const locator = {
        first() {
          return this;
        },
        waitFor: vi.fn(async () => undefined),
        boundingBox: vi.fn(async () => ({ x: 10, y: 10, width: 100, height: 20 })),
        fill: vi.fn(async () => undefined),
        evaluate: vi.fn(async (callback, arg) =>
          callback(
            {
              getBoundingClientRect: () => ({ left: 10, top: 10, width: 100, height: 20 }),
            },
            arg,
          ),
        ),
      };
      locator.fill = vi.fn(async () => {
        expect(overlay?.id).toBe('__waggle-redaction-box-2');
      });
      const screenshot = vi.fn(async () => {
        expect(overlay?.id).toBe('__waggle-redaction-box-2');
      });
      const page = {
        locator: vi.fn(() => locator),
        screenshot,
        evaluate: vi.fn(async (callback, arg) => callback(arg)),
      } as unknown as Page;
      const options = executionOptions(
        step({ type: 'change', selectors: ['#password'], value: '[credential]' }),
        page,
      );
      const result = await executeStep({
        ...options,
        screenshotsDir: 'screenshots',
        isCredentialStep: true,
      });
      expect(result).toMatchObject({ ok: true, failure: null });
      expect(screenshot).toHaveBeenCalledOnce();
      expect((overlay as { id: string } | null)?.id).toBe('__waggle-redaction-box-2');
      expect(locator.fill).toHaveBeenCalledOnce();
      expect(locator.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        '__waggle-redaction-box-2',
      );
      expect(page.evaluate).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('treats close as terminal and does not settle or screenshot a closed page', async () => {
    const close = vi.fn(async () => undefined);
    const page = {
      close,
      screenshot: vi.fn(async () => {
        throw new Error('must not run');
      }),
    } as unknown as Page;
    const options = executionOptions(step({ type: 'close' }), page);
    const result = await executeStep({ ...options, screenshotsDir: 'screenshots' });
    expect(result.ok).toBe(true);
    expect(result.settle).toBeNull();
    expect(result.screenshotPath).toBeNull();
    expect(close).toHaveBeenCalledOnce();
    expect(page.screenshot).not.toHaveBeenCalled();
  });
});
