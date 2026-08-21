import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  fromNormalized,
  ProjectionError,
  projectPoint,
  projectPoints,
  toNormalized,
  type ViewportSize,
  viewportSize,
  WalkthroughFlowSchema,
} from '../src/index.js';
import { loadFixture } from './fixtures.js';

/**
 * AC6: coordinate projection helpers, property-tested for a round-trip
 * error under 0.5 px.
 *
 * Half a pixel is the threshold that matters because it is the point at
 * which a rendered cursor would land on a different device pixel than the
 * one it was recorded on. Example-based tests cannot establish this: the
 * failure mode is a viewport ratio nobody thought to try, which is exactly
 * what fast-check searches for.
 */

/** The largest coordinate error a projection round trip may introduce. */
const MAX_ROUND_TRIP_ERROR_PX = 0.5;

/** Realistic capture and preset viewports: phone through 5K, never degenerate. */
const viewportArb: fc.Arbitrary<ViewportSize> = fc.record({
  w: fc.integer({ min: 1, max: 5120 }),
  h: fc.integer({ min: 1, max: 5120 }),
});

function pointInArb(viewport: ViewportSize) {
  return fc.record({
    x: fc.double({ min: 0, max: viewport.w, noNaN: true, noDefaultInfinity: true }),
    y: fc.double({ min: 0, max: viewport.h, noNaN: true, noDefaultInfinity: true }),
  });
}

describe('AC6: normalized round trip', () => {
  it('recovers the original pixel within half a pixel', () => {
    fc.assert(
      fc.property(
        viewportArb.chain((viewport) =>
          fc.record({ viewport: fc.constant(viewport), point: pointInArb(viewport) }),
        ),
        ({ viewport, point }) => {
          const back = fromNormalized(toNormalized(point, viewport), viewport);
          expect(Math.abs(back.x - point.x)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
          expect(Math.abs(back.y - point.y)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('keeps normalized coordinates inside 0..1 for a point inside the viewport', () => {
    fc.assert(
      fc.property(
        viewportArb.chain((viewport) =>
          fc.record({ viewport: fc.constant(viewport), point: pointInArb(viewport) }),
        ),
        ({ viewport, point }) => {
          const normalized = toNormalized(point, viewport);
          expect(normalized.nx).toBeGreaterThanOrEqual(0);
          expect(normalized.nx).toBeLessThanOrEqual(1);
          expect(normalized.ny).toBeGreaterThanOrEqual(0);
          expect(normalized.ny).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('AC6: cross-viewport projection round trip', () => {
  it('recovers the original pixel within half a pixel across any two presets', () => {
    fc.assert(
      fc.property(
        fc.tuple(viewportArb, viewportArb).chain(([from, to]) =>
          fc.record({
            from: fc.constant(from),
            to: fc.constant(to),
            point: pointInArb(from),
          }),
        ),
        ({ from, to, point }) => {
          const there = projectPoint(point, from, to);
          const back = projectPoint(there, to, from);
          expect(Math.abs(back.x - point.x)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
          expect(Math.abs(back.y - point.y)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('is the identity when source and target viewports match', () => {
    fc.assert(
      fc.property(
        viewportArb.chain((viewport) =>
          fc.record({ viewport: fc.constant(viewport), point: pointInArb(viewport) }),
        ),
        ({ viewport, point }) => {
          const projected = projectPoint(point, viewport, viewport);
          expect(Math.abs(projected.x - point.x)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
          expect(Math.abs(projected.y - point.y)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('maps the four corners of the source viewport onto the target corners', () => {
    fc.assert(
      fc.property(viewportArb, viewportArb, (from, to) => {
        expect(projectPoint({ x: 0, y: 0 }, from, to)).toEqual({ x: 0, y: 0 });
        const bottomRight = projectPoint({ x: from.w, y: from.h }, from, to);
        expect(Math.abs(bottomRight.x - to.w)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
        expect(Math.abs(bottomRight.y - to.h)).toBeLessThan(MAX_ROUND_TRIP_ERROR_PX);
      }),
      { numRuns: 500 },
    );
  });
});

describe('AC6: worked examples and guards', () => {
  it('projects a known point between two named presets', () => {
    // Centre of a 1440x900 capture, re-projected into a 1080x1920 vertical.
    expect(projectPoint({ x: 720, y: 450 }, { w: 1440, h: 900 }, { w: 1080, h: 1920 })).toEqual({
      x: 540,
      y: 960,
    });
  });

  it('projects the recorded cursor trail and preserves its timing', () => {
    const flow = WalkthroughFlowSchema.parse(loadFixture('flow-navigate'));
    const from = viewportSize(flow.waggle.recordedViewport);
    const to: ViewportSize = { w: 720, h: 450 };

    const projected = projectPoints(flow.waggle.cursorTrail, from, to);

    expect(projected).toHaveLength(flow.waggle.cursorTrail.length);
    expect(projected.map((sample) => sample.t)).toEqual(
      flow.waggle.cursorTrail.map((sample) => sample.t),
    );
    // 1440x900 -> 720x450 is exactly half in both axes.
    expect(projected[0]).toEqual({ t: 0, x: 360, y: 225 });
  });

  it('drops dpr when narrowing a recorded viewport: IR coordinates are CSS pixels', () => {
    expect(viewportSize({ w: 1440, h: 900, dpr: 2 })).toEqual({ w: 1440, h: 900 });
  });

  it('refuses a zero-sized viewport instead of producing Infinity', () => {
    expect(() => toNormalized({ x: 1, y: 1 }, { w: 0, h: 100 })).toThrowError(ProjectionError);
    expect(() => toNormalized({ x: 1, y: 1 }, { w: 100, h: 0 })).toThrowError(ProjectionError);
    expect(() => fromNormalized({ nx: 0.5, ny: 0.5 }, { w: 100, h: -1 })).toThrowError(
      ProjectionError,
    );
  });

  it('refuses a non-finite viewport', () => {
    expect(() =>
      toNormalized({ x: 1, y: 1 }, { w: Number.POSITIVE_INFINITY, h: 100 }),
    ).toThrowError(ProjectionError);
    expect(() => toNormalized({ x: 1, y: 1 }, { w: Number.NaN, h: 100 })).toThrowError(
      ProjectionError,
    );
  });
});
