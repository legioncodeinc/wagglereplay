// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import { BrandKitSchema, type CursorSpring } from '../src/brand/schema.js';
import { springSmoothPath, type TimedPoint } from '../src/cursor/spring.js';
import {
  buildCursorOverlayExpressions,
  buildCursorTrack,
  MAX_CURSOR_SEGMENTS,
} from '../src/cursor/track.js';
import {
  encodeCursorSprite,
  renderCursorSprite,
  renderRippleSprite,
} from '../src/ffmpeg/sprites.js';
import { resolvePreset } from '../src/presets.js';
import { buildTimeline } from '../src/timeline.js';
import { buildZoomExpressions, computeCoverGeometry } from '../src/zoom/expressions.js';
import { buildZoomTrack } from '../src/zoom/segments.js';
import { makeFlow } from './fixtures.js';

/** prd-007 AC3: the spring-damped cursor path and the click ripple track. */

const SPRING: CursorSpring = { stiffness: 26, dampingRatio: 1, sampleHz: 12 };
const PRESET = resolvePreset('16x9', { '16x9': { width: 640, height: 360, fps: 30 } }).preset;

function stepTrail(): TimedPoint[] {
  // A hard step: the pointer teleports from 0 to 100 at t=0 and stays.
  // This is the pathological input the spring exists to smooth.
  return [
    { t: 0, x: 0, y: 0 },
    { t: 1, x: 100, y: 0 },
    { t: 3000, x: 100, y: 0 },
  ];
}

describe('AC3: spring smoothing', () => {
  it('returns nothing for an empty trail, so the caller can drop the layer', () => {
    expect(springSmoothPath([], { spring: SPRING })).toEqual([]);
  });

  it('holds a single-sample trail still', () => {
    const path = springSmoothPath([{ t: 0, x: 5, y: 7 }], { spring: SPRING });
    expect(path).toEqual([{ t: 0, x: 5, y: 7 }]);
  });

  it('tracks the analytic critically-damped step response', () => {
    // A critically damped spring answering a unit step has the closed
    // form x(t) = 1 - (1 + wt)e^(-wt). Checking the integrator against
    // that, rather than against a hand-picked "looks laggy" number, is
    // what makes this a test of the physics and not of a magic constant.
    const path = springSmoothPath(stepTrail(), { spring: SPRING, startMs: 0, endMs: 2000 });
    const omega = SPRING.stiffness;
    for (const sample of [1, 3, 6]) {
      const point = path[sample];
      expect(point).toBeDefined();
      if (point === undefined) {
        continue;
      }
      const t = point.t / 1000;
      const analytic = 100 * (1 - (1 + omega * t) * Math.exp(-omega * t));
      // Semi-implicit Euler at MAX_SPRING_SUBSTEP_MS lands within about
      // 1% of the closed form; a broken integrator would not.
      expect(Math.abs(point.x - analytic)).toBeLessThan(1.5);
    }
    // And it genuinely lags: it has not arrived on the first sample.
    const early = path[1];
    expect(early?.x).toBeGreaterThan(0);
    expect(early?.x).toBeLessThan(95);
  });

  it('converges on the target rather than orbiting it', () => {
    const path = springSmoothPath(stepTrail(), { spring: SPRING, startMs: 0, endMs: 2000 });
    const last = path[path.length - 1];
    expect(last?.x).toBeCloseTo(100, 1);
  });

  it('never overshoots at a damping ratio of 1', () => {
    const path = springSmoothPath(stepTrail(), {
      spring: { ...SPRING, dampingRatio: 1 },
      startMs: 0,
      endMs: 2000,
    });
    for (const point of path) {
      expect(point.x).toBeLessThanOrEqual(100.001);
    }
  });

  it('overshoots below critical damping, which is the point of the knob', () => {
    const path = springSmoothPath(stepTrail(), {
      spring: { stiffness: 30, dampingRatio: 0.35, sampleHz: 60 },
      startMs: 0,
      endMs: 2000,
    });
    expect(Math.max(...path.map((point) => point.x))).toBeGreaterThan(100);
  });

  it('produces the same curve at a different sample rate, only sampled finer', () => {
    // The sub-step bound is what makes this true: if integration accuracy
    // rode on `sampleHz`, raising the rate would change the shape of the
    // motion, not just its resolution.
    const coarse = springSmoothPath(stepTrail(), {
      spring: { ...SPRING, sampleHz: 10 },
      startMs: 0,
      endMs: 1000,
    });
    const fine = springSmoothPath(stepTrail(), {
      spring: { ...SPRING, sampleHz: 50 },
      startMs: 0,
      endMs: 1000,
    });
    for (const point of coarse) {
      const match = fine.find((candidate) => Math.abs(candidate.t - point.t) < 1);
      if (match !== undefined) {
        expect(Math.abs(match.x - point.x)).toBeLessThan(1);
      }
    }
  });

  it('is deterministic: the same trail and kit give a bit-identical path', () => {
    const a = springSmoothPath(stepTrail(), { spring: SPRING, startMs: 0, endMs: 2000 });
    const b = springSmoothPath(stepTrail(), { spring: SPRING, startMs: 0, endMs: 2000 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('respects the sample cap by lowering the effective rate', () => {
    const trail: TimedPoint[] = Array.from({ length: 200 }, (_, i) => ({
      t: i * 1000,
      x: i,
      y: i,
    }));
    const path = springSmoothPath(trail, {
      spring: { ...SPRING, sampleHz: 60 },
      startMs: 0,
      endMs: 199_000,
      maxSamples: 51,
    });
    expect(path.length).toBeLessThanOrEqual(51);
  });
});

describe('AC3: the cursor track', () => {
  it('normalizes the trail so a kit feels the same at every preset', () => {
    const flow = makeFlow({ viewportWidth: 1280, viewportHeight: 720, durationMs: 4000 });
    const track = buildCursorTrack({
      flow,
      cursor: DEFAULT_BRAND_KIT.cursor,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 4000),
    });
    expect(track.path.length).toBeGreaterThan(0);
    for (const point of track.path) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
  });

  it('emits one ripple window per pointer PRESS, never per release', () => {
    const flow = makeFlow({ durationMs: 4000, clickTimesMs: [1000, 2000, 3000] });
    // The fixture writes a down and an up for each click; only the downs
    // may produce a ripple, or every click would ripple twice.
    expect(flow.waggle.clicks.length).toBe(6);
    const track = buildCursorTrack({
      flow,
      cursor: DEFAULT_BRAND_KIT.cursor,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 4000),
    });
    expect(track.ripples.length).toBe(3);
  });

  it('gives every ripple a bounded enable window inside the timeline', () => {
    const timeline = buildTimeline(DEFAULT_BRAND_KIT, 4000);
    const track = buildCursorTrack({
      flow: makeFlow({ durationMs: 4000, clickTimesMs: [3900] }),
      cursor: DEFAULT_BRAND_KIT.cursor,
      timeline,
    });
    for (const ripple of track.ripples) {
      expect(ripple.endMs).toBeGreaterThan(ripple.startMs);
      // A click near the end must not push the ripple past the last frame.
      expect(ripple.endMs).toBeLessThanOrEqual(timeline.totalMs);
    }
  });

  it('drops the whole layer when the kit disables the cursor', () => {
    const kit = BrandKitSchema.parse({
      ...DEFAULT_BRAND_KIT,
      cursor: { ...DEFAULT_BRAND_KIT.cursor, enabled: false },
    });
    const track = buildCursorTrack({
      flow: makeFlow(),
      cursor: kit.cursor,
      timeline: buildTimeline(kit, 4000),
    });
    expect(track.path).toEqual([]);
    expect(track.ripples).toEqual([]);
    expect(buildCursorOverlayExpressions(track, zoomExpressionsFor())).toBeNull();
  });

  it('keeps the position expression inside the segment cap', () => {
    const flow = makeFlow({ durationMs: 600_000 });
    const track = buildCursorTrack({
      flow,
      cursor: DEFAULT_BRAND_KIT.cursor,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 600_000),
    });
    expect(track.path.length).toBeLessThanOrEqual(MAX_CURSOR_SEGMENTS + 1);
  });

  it('projects the cursor through the same zoom the base video went through', () => {
    const flow = makeFlow({ durationMs: 4000 });
    const track = buildCursorTrack({
      flow,
      cursor: DEFAULT_BRAND_KIT.cursor,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 4000),
    });
    const expressions = buildCursorOverlayExpressions(track, zoomExpressionsFor());
    expect(expressions).not.toBeNull();
    // The projection has to re-derive the scaled frame size, because an
    // overlay filter cannot read an upstream filter's frame dimensions.
    expect(expressions?.x).toContain('ceil(');
    expect(expressions?.x).toContain('min(max(');
    expect(expressions?.x).not.toContain('in_w');
    // No single quotes, or the quoted filter option would terminate early.
    expect(expressions?.x).not.toContain("'");
    expect(expressions?.y).not.toContain("'");
  });
});

function zoomExpressionsFor(): ReturnType<typeof buildZoomExpressions> {
  const flow = makeFlow({ durationMs: 4000 });
  const timeline = buildTimeline(DEFAULT_BRAND_KIT, 4000);
  const track = buildZoomTrack({
    flow,
    zoom: DEFAULT_BRAND_KIT.zoom,
    timeline,
    reframe: 'native',
  });
  return buildZoomExpressions(track, PRESET, computeCoverGeometry(PRESET, 640, 360));
}

describe('AC3: sprites', () => {
  it('draws the arrow with its tip at the sprite origin', () => {
    // The overlay filter positions by top-left corner, so the tip has to
    // be pixel (0,0) or every cursor position would need an offset.
    const bitmap = renderCursorSprite(DEFAULT_BRAND_KIT.cursor);
    const alphaAt = (x: number, y: number): number =>
      bitmap.data[(y * bitmap.width + x) * 4 + 3] ?? 0;
    expect(alphaAt(0, 0)).toBeGreaterThan(0);
    // The bottom-right corner is outside the arrow entirely.
    expect(alphaAt(bitmap.width - 1, bitmap.height - 1)).toBe(0);
  });

  it('sizes the arrow from the kit', () => {
    const bitmap = renderCursorSprite({ ...DEFAULT_BRAND_KIT.cursor, sizePx: 48 });
    expect(bitmap.height).toBe(48);
    expect(bitmap.width).toBeGreaterThan(0);
    expect(bitmap.width).toBeLessThan(48);
  });

  it('draws the ripple as a hollow ring at its largest radius', () => {
    const ripple = renderRippleSprite(DEFAULT_BRAND_KIT.cursor.ripple);
    const diameter = DEFAULT_BRAND_KIT.cursor.ripple.endRadiusPx * 2;
    expect(ripple.width).toBe(diameter);
    const alphaAt = (x: number, y: number): number =>
      ripple.data[(y * ripple.width + x) * 4 + 3] ?? 0;
    // Hollow in the middle, painted on the rim.
    expect(alphaAt(Math.floor(diameter / 2), Math.floor(diameter / 2))).toBe(0);
    expect(alphaAt(Math.floor(diameter / 2), 1)).toBeGreaterThan(0);
  });

  it('encodes a valid, byte-stable PNG', () => {
    const first = encodeCursorSprite(DEFAULT_BRAND_KIT.cursor);
    const second = encodeCursorSprite(DEFAULT_BRAND_KIT.cursor);
    expect(first.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(first.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect(first.subarray(-8, -4).toString('latin1')).toBe('IEND');
    // AC7's idempotency claim reaches all the way down to the sprites.
    expect(first.equals(second)).toBe(true);
  });

  it('recolours with the kit, so a second kit really does change the cursor', () => {
    const a = encodeCursorSprite(DEFAULT_BRAND_KIT.cursor);
    const b = encodeCursorSprite({ ...DEFAULT_BRAND_KIT.cursor, color: '#00b3ff' });
    expect(a.equals(b)).toBe(false);
  });
});
