import type { Browser, BrowserContext } from 'playwright-core';
import { QUIESCENCE_PROBE_SOURCE } from '../steps/settle.js';
import { buildDeterminismInitPayload, installDeterminismAssets } from './assets.js';

/**
 * The determinism kit context factory (prd-009 AC2).
 *
 * Every context a replay runs in goes through here, which is what makes
 * two replays of the same IR comparable: same reduced-motion emulation,
 * same animation-kill CSS (toggleable), same timezone, same locale, same
 * storage state. The kit members and their rationale:
 *
 *  - reducedMotion 'reduce': Playwright's own emulation, honored by apps
 *    that respect the media query.
 *  - animation-kill CSS injection (toggle): corpus fact, Playwright's
 *    `animations: 'disabled'` covers screenshots only, so a running
 *    capture needs the stylesheet; toggled off for walkthroughs that are
 *    themselves about an animation.
 *  - fixed timezone and locale: a clock in the corner or a
 *    locale-formatted date would otherwise differ between runs and
 *    poison every pixel comparison downstream (prd-011 baselines).
 *  - storage state load: authenticated targets replay their logged-in
 *    state deterministically instead of depending on a profile's
 *    leftover cookies.
 */

export interface DeterminismOptions {
  /** Viewport width and height, CSS pixels. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Device pixel ratio for the context. */
  readonly deviceScaleFactor: number;
  /** Mobile emulation flag (also enables touch by default). */
  readonly isMobile: boolean;
  /** Explicit touch override for non-mobile touchscreens. */
  readonly hasTouch: boolean;
  /**
   * Toggle for the animation-kill stylesheet injection. Default true.
   * The toggle exists (AC2 says "toggle") for walkthroughs whose subject
   * IS an animation.
   */
  readonly killAnimations?: boolean;
  /** Fixed timezone id. Default 'UTC'. */
  readonly timezoneId?: string;
  /** Fixed locale. Default 'en-US'. */
  readonly locale?: string;
  /** Path to a Playwright storage state JSON file, when the target needs one. */
  readonly storageStatePath?: string;
  /** URLs containing any of these are excluded from settle's network heuristic. */
  readonly networkExclusions?: readonly string[];
  /** Injected for tests and for ADR-004's runner profiles. */
  readonly extraHttpHeaders?: Readonly<Record<string, string>>;
}

export const DEFAULT_TIMEZONE_ID = 'UTC';
export const DEFAULT_LOCALE = 'en-US';

/**
 * Creates a deterministic context on `browser`. The caller owns closing
 * it; replay sessions close it in their `finally`.
 */
export async function createDeterministicContext(
  browser: Browser,
  options: DeterminismOptions,
): Promise<BrowserContext> {
  const killAnimations = options.killAnimations ?? true;

  const context = await browser.newContext({
    viewport: { width: options.viewportWidth, height: options.viewportHeight },
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch,
    reducedMotion: 'reduce',
    timezoneId: options.timezoneId ?? DEFAULT_TIMEZONE_ID,
    locale: options.locale ?? DEFAULT_LOCALE,
    ...(options.storageStatePath !== undefined ? { storageState: options.storageStatePath } : {}),
    ...(options.extraHttpHeaders !== undefined
      ? { extraHTTPHeaders: options.extraHttpHeaders }
      : {}),
  });

  try {
    const initPayload = buildDeterminismInitPayload({
      killAnimations,
      networkExclusions: options.networkExclusions ?? [],
    });
    await context.addInitScript(installDeterminismAssets, initPayload);
    await context.addInitScript(QUIESCENCE_PROBE_SOURCE);
    return context;
  } catch (error: unknown) {
    await context.close().catch(() => undefined);
    throw error;
  }
}
