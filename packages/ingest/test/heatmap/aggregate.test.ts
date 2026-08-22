// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { aggregateHeatmap } from '../../src/heatmap/aggregate.js';
import { HeatmapDocumentSchema } from '../../src/heatmap/schema.js';
import type { StepTiming } from '../../src/segment/types.js';

const viewport = { w: 1000, h: 500 };

function timing(overrides: Partial<StepTiming> & { stepIndex: number }): StepTiming {
  return {
    actionRelMs: 0,
    settledRelMs: null,
    clickPoint: null,
    route: '/',
    ...overrides,
  };
}

describe('AC3: aggregateHeatmap', () => {
  it('normalizes click points via the same projection used elsewhere in the IR (0..1)', () => {
    const doc = aggregateHeatmap(
      [timing({ stepIndex: 0, clickPoint: { x: 500, y: 250 }, route: '/a' })],
      viewport,
      1,
    );
    expect(doc.routes).toEqual([{ route: '/a', points: [{ nx: 0.5, ny: 0.5, stepIndex: 0 }] }]);
  });

  it('groups points by route and sorts routes lexicographically', () => {
    const doc = aggregateHeatmap(
      [
        timing({ stepIndex: 0, clickPoint: { x: 100, y: 100 }, route: '/b' }),
        timing({ stepIndex: 1, clickPoint: { x: 200, y: 200 }, route: '/a' }),
        timing({ stepIndex: 2, clickPoint: { x: 300, y: 300 }, route: '/a' }),
      ],
      viewport,
      1,
    );
    expect(doc.routes.map((r) => r.route)).toEqual(['/a', '/b']);
    expect(doc.routes[0]?.points).toHaveLength(2);
    expect(doc.routes[1]?.points).toHaveLength(1);
  });

  it('skips steps with no click point (scroll/input/navigate steps)', () => {
    const doc = aggregateHeatmap(
      [
        timing({ stepIndex: 0, clickPoint: null, route: '/a' }),
        timing({ stepIndex: 1, clickPoint: { x: 10, y: 10 }, route: '/a' }),
      ],
      viewport,
      1,
    );
    expect(doc.routes[0]?.points).toHaveLength(1);
    expect(doc.routes[0]?.points[0]?.stepIndex).toBe(1);
  });

  it('carries the IR version and validates against its own schema', () => {
    const doc = aggregateHeatmap([], viewport, 7);
    expect(doc.irVersion).toBe(7);
    expect(HeatmapDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('is a pure, deterministic function of its inputs', () => {
    const timings = [
      timing({ stepIndex: 0, clickPoint: { x: 500, y: 250 }, route: '/a' }),
      timing({ stepIndex: 1, clickPoint: { x: 100, y: 400 }, route: '/b' }),
    ];
    const first = aggregateHeatmap(timings, viewport, 1);
    const second = aggregateHeatmap(timings, viewport, 1);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('throws ProjectionError for a degenerate zero-size viewport rather than emitting Infinity/NaN', () => {
    expect(() =>
      aggregateHeatmap(
        [timing({ stepIndex: 0, clickPoint: { x: 1, y: 1 }, route: '/a' })],
        { w: 0, h: 500 },
        1,
      ),
    ).toThrow();
  });
});
