// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { FrameExtractionError } from '../../src/errors.js';
import {
  activeFrameRedactions,
  buildRedactionFilter,
  type FrameRedaction,
  validateFrameRedactions,
} from '../../src/frames/redaction.js';

const redaction: FrameRedaction = {
  startRelMs: 1_000,
  geometry: {
    rect: { x: 100, y: 50, w: 200, h: 100 },
    viewport: { w: 1000, h: 500, dpr: 2 },
  },
};

describe('credential frame redaction', () => {
  it('activates a rectangle at its exact video-relative timestamp', () => {
    expect(activeFrameRedactions([redaction], 999)).toEqual([]);
    expect(activeFrameRedactions([redaction], 1_000)).toEqual([redaction]);
    expect(activeFrameRedactions([redaction], 10_000)).toEqual([redaction]);
  });

  it('projects recorded CSS geometry through ffmpeg frame dimensions', () => {
    expect(buildRedactionFilter([redaction])).toBe(
      'drawbox=x=floor(iw*0.1):y=floor(ih*0.1):w=ceil(iw*0.2):h=ceil(ih*0.2):color=black@1:t=fill',
    );
  });

  it('fails closed before extraction for missing, out-of-bounds, or zero-size boxes', () => {
    const invalid = [
      { startRelMs: 1_000 },
      {
        ...redaction,
        geometry: { ...redaction.geometry, rect: { x: 900, y: 0, w: 200, h: 100 } },
      },
      {
        ...redaction,
        geometry: { ...redaction.geometry, rect: { x: 10, y: 10, w: 0, h: 10 } },
      },
      {
        ...redaction,
        geometry: { ...redaction.geometry, rect: { x: '0):y=0:color=red', y: 0, w: 10, h: 10 } },
      },
    ];
    for (const candidate of invalid) {
      expect(() => validateFrameRedactions([candidate as unknown as FrameRedaction])).toThrow(
        FrameExtractionError,
      );
    }
  });
});
