import { describe, expect, it } from 'vitest';
import { boundedRedactionGeometry } from '../../src/lib/redaction-geometry.js';

const viewport = { w: 1000, h: 500, dpr: 2 };

describe('boundedRedactionGeometry', () => {
  it('clips a partially visible credential field to the recorded viewport', () => {
    expect(boundedRedactionGeometry({ x: -20, y: 450, width: 120, height: 100 }, viewport)).toEqual(
      {
        rect: { x: 0, y: 450, w: 100, h: 50 },
        viewport,
      },
    );
  });

  it('fails closed to a full-viewport box for degenerate or non-finite geometry', () => {
    expect(
      boundedRedactionGeometry({ x: Number.NaN, y: 0, width: 0, height: 20 }, viewport),
    ).toEqual({ rect: { x: 0, y: 0, w: 1000, h: 500 }, viewport });
    expect(boundedRedactionGeometry({ x: 1200, y: 600, width: 10, height: 10 }, viewport)).toEqual({
      rect: { x: 0, y: 0, w: 1000, h: 500 },
      viewport,
    });
  });
});
