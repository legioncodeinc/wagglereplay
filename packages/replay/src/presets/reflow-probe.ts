import type { Page } from 'playwright-core';
import { masterPreset, REPLAY_PRESETS, type ReplayPreset } from './registry.js';

/**
 * The per-preset native-reflow probe (prd-009 AC4, ADR-011).
 *
 * ADR-011: "When a preset's replay viewport is unusable (no reflow,
 * horizontal scroll, or user override), the render engine replays at the
 * 16:9 master viewport and the compositor drives an animated crop
 * window." This module is the "unusable" test: load the walkthrough's
 * first URL at the preset's viewport and measure whether the layout
 * reflows.
 *
 * Signals, all measured in one evaluate call:
 *  - horizontal overflow: `scrollWidth > clientWidth + tolerance` on the
 *    scrolling element. A desktop-narrow layout on a portrait phone is
 *    exactly the "no reflow" case ADR-011 exists for.
 *  - zero-width content: the document collapsed rather than reflowed
 *    (some apps render an empty shell at unexpected viewports).
 *
 * The probe is deliberately cheap and deterministic: one navigation, one
 * measurement, no interaction. It runs BEFORE the capture session so the
 * decision is recorded in the run report and the replay manifest, and
 * the label flows into the render metadata through the compositor's own
 * aspect-ratio reframe mode.
 */

export type ReflowDecision = 'native' | 'reframed';

export interface ReflowProbeResult {
  readonly presetId: string;
  /** The viewport the probe measured. */
  readonly probedWidth: number;
  readonly probedHeight: number;
  readonly decision: ReflowDecision;
  /** Pixel width of horizontal overflow, 0 when the layout reflowed. */
  readonly horizontalOverflowPx: number;
  /** The signal that decided it, for the run report. */
  readonly reason: string;
}

/** px of horizontal overflow tolerated before a layout counts as non-reflowing. */
export const REFLOW_OVERFLOW_TOLERANCE_PX = 8;

export interface ReflowProbeOptions {
  /** The preset being probed. */
  readonly preset: ReplayPreset;
  /** A URL of the walkthrough (normally its first navigate step). */
  readonly url: string;
  /** Allow an author to force reframed regardless of the probe (ADR-011 user override). */
  readonly forceReframed?: boolean;
  /** Timeout for the probe navigation, in ms. */
  readonly timeoutMs?: number;
}

/**
 * Probes the app at the preset viewport. Never throws for a page-level
 * failure: a page that cannot even load at this viewport has told us
 * everything we need to know about replaying the full walkthrough there,
 * so the probe reports `reframed` with the failure as its reason.
 */
export async function probeReflow(
  page: Page,
  options: ReflowProbeOptions,
): Promise<ReflowProbeResult> {
  const { preset } = options;
  const base: Omit<ReflowProbeResult, 'decision' | 'reason'> = {
    presetId: preset.id,
    probedWidth: preset.width,
    probedHeight: preset.height,
    horizontalOverflowPx: 0,
  };

  if (options.forceReframed === true) {
    return { ...base, decision: 'reframed', reason: 'author override forced reframed' };
  }

  try {
    await page.goto(options.url, {
      timeout: options.timeoutMs ?? 10_000,
      waitUntil: 'domcontentloaded',
    });
    await page.setViewportSize({ width: preset.width, height: preset.height });
    const measurement = await page.evaluate(() => {
      const scroller = document.scrollingElement ?? document.documentElement;
      return {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        bodyHasContent: (document.body?.innerText ?? '').trim().length > 0,
      };
    });

    if (!measurement.bodyHasContent) {
      return {
        ...base,
        decision: 'reframed',
        reason: 'page rendered no text content at this viewport',
      };
    }

    const overflow = measurement.scrollWidth - measurement.clientWidth;
    if (overflow > REFLOW_OVERFLOW_TOLERANCE_PX) {
      return {
        ...base,
        horizontalOverflowPx: overflow,
        decision: 'reframed',
        reason: `horizontal overflow of ${overflow}px at ${preset.width}x${preset.height} (no reflow)`,
      };
    }

    return {
      ...base,
      decision: 'native',
      reason: `layout reflowed within ${REFLOW_OVERFLOW_TOLERANCE_PX}px tolerance`,
    };
  } catch (error) {
    return {
      ...base,
      decision: 'reframed',
      reason: `probe failed at this viewport, falling back to master: ${(error as Error).message}`,
    };
  }
}

/**
 * The capture preset a probe result dictates: itself when native, the
 * 16:9 master when reframed (ADR-011).
 */
export function capturePresetFor(probe: ReflowProbeResult): ReplayPreset {
  if (probe.decision === 'native') {
    const preset = REPLAY_PRESETS[probe.presetId];
    if (preset === undefined) {
      throw new Error(`internal error: unknown replay preset id "${probe.presetId}"`);
    }
    return preset;
  }
  return masterPreset();
}
