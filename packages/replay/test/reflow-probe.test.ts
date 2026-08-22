// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Page } from 'playwright-core';
import { describe, expect, it, vi } from 'vitest';
import {
  capturePresetFor,
  probeReflow,
  REFLOW_OVERFLOW_TOLERANCE_PX,
  type ReflowProbeResult,
} from '../src/presets/reflow-probe.js';
import { REPLAY_PRESETS, resolveReplayPreset } from '../src/presets/registry.js';

/**
 * The reflow probe's four decision branches had zero tests until the
 * 2026-08-21 Run 4 guardrail pass (HANDOFF-4 section 3 item 4: the only
 * checked-in reframed evidence was produced by `forceReframed`, which
 * returns before any measurement). These tests drive the real decision
 * tree with a stub Page so every branch is pinned.
 */

interface Measurement {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly bodyHasContent: boolean;
}

function fakePage(measurement: Measurement | Error): Page {
  return {
    goto: vi.fn(async () => {
      if (measurement instanceof Error) throw measurement;
      return undefined;
    }),
    setViewportSize: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => {
      if (measurement instanceof Error) throw measurement;
      return measurement;
    }),
  } as unknown as Page;
}

const PRESET = resolveReplayPreset('9x16');

describe('probeReflow decision branches', () => {
  it('returns reframed before any navigation when the author forces it', async () => {
    const page = fakePage(new Error('unreachable'));
    const result = await probeReflow(page, {
      preset: PRESET,
      url: 'https://fixture.test/',
      forceReframed: true,
    });

    expect(result).toMatchObject({
      presetId: '9x16',
      decision: 'reframed',
      reason: 'author override forced reframed',
    } satisfies Partial<ReflowProbeResult>);
    expect(page.goto).not.toHaveBeenCalled();
  });

  it('decides reframed when the page renders no text content at this viewport', async () => {
    const page = fakePage({ scrollWidth: 390, clientWidth: 390, bodyHasContent: false });
    const result = await probeReflow(page, { preset: PRESET, url: 'https://fixture.test/' });

    expect(result.decision).toBe('reframed');
    expect(result.reason).toBe('page rendered no text content at this viewport');
  });

  it('decides reframed with the measured overflow when horizontal overflow exceeds the tolerance', async () => {
    const page = fakePage({ scrollWidth: 390 + 200, clientWidth: 390, bodyHasContent: true });
    const result = await probeReflow(page, { preset: PRESET, url: 'https://fixture.test/' });

    expect(result.decision).toBe('reframed');
    expect(result.horizontalOverflowPx).toBe(200);
    expect(result.reason).toContain('horizontal overflow of 200px');
    expect(result.reason).toContain(`${String(PRESET.width)}x${String(PRESET.height)}`);
  });

  it('decides native when overflow stays within the tolerance', async () => {
    const page = fakePage({
      scrollWidth: 390 + REFLOW_OVERFLOW_TOLERANCE_PX,
      clientWidth: 390,
      bodyHasContent: true,
    });
    const result = await probeReflow(page, { preset: PRESET, url: 'https://fixture.test/' });

    expect(result.decision).toBe('native');
    expect(result.horizontalOverflowPx).toBe(0);
    expect(result.reason).toBe(
      `layout reflowed within ${String(REFLOW_OVERFLOW_TOLERANCE_PX)}px tolerance`,
    );
  });

  it('decides reframed with the failure reason when navigation fails', async () => {
    const page = fakePage(new Error('net::ERR_CONNECTION_REFUSED'));
    const result = await probeReflow(page, { preset: PRESET, url: 'https://fixture.test/' });

    expect(result.decision).toBe('reframed');
    expect(result.reason).toContain('probe failed at this viewport');
    expect(result.reason).toContain('net::ERR_CONNECTION_REFUSED');
  });
});

describe('capturePresetFor mapping', () => {
  it('maps a native decision to the probe preset itself', () => {
    const preset = capturePresetFor({
      presetId: '9x16',
      probedWidth: 390,
      probedHeight: 844,
      decision: 'native',
      horizontalOverflowPx: 0,
      reason: 'layout reflowed within tolerance',
    });
    expect(preset).toBe(REPLAY_PRESETS['9x16']);
  });

  it('maps a reframed decision to the 16x9 master preset', () => {
    const preset = capturePresetFor({
      presetId: '9x16',
      probedWidth: 390,
      probedHeight: 844,
      decision: 'reframed',
      horizontalOverflowPx: 200,
      reason: 'horizontal overflow',
    });
    expect(preset).toBe(REPLAY_PRESETS['16x9']);
  });

  it('throws on an unknown preset id for a native decision', () => {
    expect(() =>
      capturePresetFor({
        presetId: 'nonexistent',
        probedWidth: 390,
        probedHeight: 844,
        decision: 'native',
        horizontalOverflowPx: 0,
        reason: 'layout reflowed within tolerance',
      }),
    ).toThrow(/unknown replay preset id/u);
  });
});
