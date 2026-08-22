// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildFocusTrack, FOCUS_EASE_MS } from '../src/reframe/focus-track.js';
import type { StepExecutionResult } from '../src/steps/replay-step.js';

function step(
  index: number,
  center: { x: number; y: number } | null,
  atMs: number,
  durationMs = 200,
): StepExecutionResult {
  return {
    stepIndex: index,
    stepType: 'click',
    ok: true,
    startOffsetMs: atMs,
    durationMs,
    settle: { source: 'element-assertion', ms: durationMs },
    selector: null,
    attemptedSelectors: [],
    screenshotPath: null,
    center,
    failure: null,
  };
}

describe('buildFocusTrack', () => {
  it('normalizes element centers against the capture viewport', () => {
    const track = buildFocusTrack([step(0, { x: 960, y: 540 }, 0)], {
      viewportWidth: 1920,
      viewportHeight: 1080,
      durationMs: 3000,
    });
    expect(track[0]).toMatchObject({ nx: 0.5, ny: 0.5 });
  });

  it('opens on the first anchor and closes on the last', () => {
    const track = buildFocusTrack(
      [step(0, { x: 400, y: 300 }, 1000), step(1, { x: 1200, y: 900 }, 4000)],
      { viewportWidth: 1920, viewportHeight: 1080, durationMs: 6000 },
    );
    expect(track[0]?.atMs).toBe(0);
    expect(track[0]?.nx).toBeCloseTo(400 / 1920, 5);
    const last = track[track.length - 1];
    expect(last?.atMs).toBe(6000);
    expect(last?.nx).toBeCloseTo(1200 / 1920, 5);
  });

  it('eases between anchors with monotonic time', () => {
    const track = buildFocusTrack(
      [step(0, { x: 100, y: 100 }, 0, 0), step(1, { x: 1820, y: 980 }, 2000, 0)],
      { viewportWidth: 1920, viewportHeight: 1080, durationMs: 4000, easeMs: FOCUS_EASE_MS },
    );
    const times = track.map((point) => point.atMs);
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
    // Midpoints exist strictly between the anchors' values.
    const middles = track.filter((p) => p.atMs > 0 && p.atMs < 2000);
    expect(middles.length).toBeGreaterThan(0);
    for (const middle of middles) {
      expect(middle.nx).toBeGreaterThan(100 / 1920);
      expect(middle.nx).toBeLessThan(1820 / 1920);
    }
  });

  it('collapses to the frame centre when no step knew its center', () => {
    const track = buildFocusTrack([step(0, null, 0)], {
      viewportWidth: 1920,
      viewportHeight: 1080,
      durationMs: 1000,
    });
    expect(track).toEqual([{ atMs: 0, nx: 0.5, ny: 0.5 }]);
  });
});
