import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import type { ZoomStyle } from '../src/brand/schema.js';
import { clampExpr, enableWindow, num, piecewise } from '../src/expr/piecewise.js';
import { isNativeAspect, reframeModeFor, resolvePreset } from '../src/presets.js';
import { buildTimeline } from '../src/timeline.js';
import {
  buildZoomExpressions,
  computeCoverGeometry,
  projectNormalizedX,
} from '../src/zoom/expressions.js';
import { buildZoomTrack, buildZoomWindows, collectFocusEvents } from '../src/zoom/segments.js';
import { makeFlow } from './fixtures.js';

/**
 * prd-007 AC5: click-driven auto-zoom via crop+scale expressions, plus
 * ADR-011's smart-reframe focus track, which is the same mechanism.
 */

const ZOOM: ZoomStyle = { enabled: true, level: 1.4, holdMs: 800, easeMs: 400, leadMs: 200 };
const LANDSCAPE = resolvePreset('16x9', { '16x9': { width: 1280, height: 720, fps: 30 } }).preset;
const PORTRAIT = resolvePreset('9x16', { '9x16': { width: 720, height: 1280, fps: 30 } }).preset;

describe('expression primitives', () => {
  it('never emits an exponent, a negative zero, or a trailing zero', () => {
    expect(num(0.0000001)).toBe('0');
    expect(num(-0)).toBe('0');
    expect(num(1.5)).toBe('1.5');
    expect(num(1.0)).toBe('1');
    expect(num(0.1 + 0.2)).toBe('0.3');
    expect(num(1234.56789)).toBe('1234.5679');
  });

  it('refuses a non-finite value rather than writing "Infinity" into a graph', () => {
    expect(() => num(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => num(Number.NaN)).toThrow(/non-finite/);
  });

  it('gates piecewise segments half-open so adjacent terms cannot both fire', () => {
    // `between()` is inclusive at both ends, so a sum of `between` terms
    // would double-count the shared instant. The builder must not use it.
    const expression = piecewise([
      { atMs: 0, value: 0 },
      { atMs: 1000, value: 10 },
      { atMs: 2000, value: 20 },
    ]);
    expect(expression).toContain('gte(t,0)*lt(t,1)');
    expect(expression).toContain('gte(t,1)*lt(t,2)');
    expect(expression).not.toContain('between(');
  });

  it('collapses a single keyframe to a constant', () => {
    expect(piecewise([{ atMs: 500, value: 3 }])).toBe('3');
  });

  it('clamps before the first and after the last keyframe', () => {
    const expression = piecewise([
      { atMs: 1000, value: 5 },
      { atMs: 2000, value: 9 },
    ]);
    expect(expression).toContain('lt(t,1)*5');
    expect(expression).toContain('gte(t,2)*9');
  });

  it('emits a smoothstep curve when asked, and a linear ramp otherwise', () => {
    const eased = piecewise(
      [
        { atMs: 0, value: 0 },
        { atMs: 1000, value: 1 },
      ],
      'smoothstep',
    );
    expect(eased).toContain('3*pow(');
    expect(eased).toContain('-2*pow(');
    const linear = piecewise(
      [
        { atMs: 0, value: 0 },
        { atMs: 1000, value: 1 },
      ],
      'linear',
    );
    expect(linear).not.toContain('pow(');
  });

  it('rejects an empty keyframe list instead of emitting an empty expression', () => {
    expect(() => piecewise([])).toThrow(/at least one keyframe/);
  });

  it('builds clamps and enable windows in seconds', () => {
    expect(clampExpr('x', '0', '10')).toBe('min(max(x,0),10)');
    expect(enableWindow(1500, 2100)).toBe('between(t,1.5,2.1)');
  });
});

describe('AC5: zoom windows', () => {
  it('produces no windows when zoom is off or the level is 1', () => {
    const events = collectFocusEvents(makeFlow({ clickTimesMs: [1000] }));
    expect(buildZoomWindows(events, { ...ZOOM, enabled: false })).toEqual([]);
    expect(buildZoomWindows(events, { ...ZOOM, level: 1 })).toEqual([]);
    expect(buildZoomWindows([], ZOOM)).toEqual([]);
  });

  it('leads the click, holds, and eases back out', () => {
    const windows = buildZoomWindows([{ atMs: 2000, nx: 0.5, ny: 0.5 }], ZOOM);
    expect(windows).toEqual([
      { inStartMs: 1400, peakStartMs: 1800, peakEndMs: 2600, outEndMs: 3000 },
    ]);
  });

  it('merges overlapping windows so back-to-back clicks do not pump the zoom', () => {
    // Two clicks 800ms apart: without merging the zoom would ease out and
    // straight back in between them, which is the most obvious auto-zoom
    // artifact there is.
    const windows = buildZoomWindows(
      [
        { atMs: 2000, nx: 0.3, ny: 0.3 },
        { atMs: 2800, nx: 0.7, ny: 0.7 },
      ],
      ZOOM,
    );
    expect(windows.length).toBe(1);
    expect(windows[0]?.inStartMs).toBe(1400);
    expect(windows[0]?.outEndMs).toBe(3800);
  });

  it('keeps distant clicks as separate windows', () => {
    const windows = buildZoomWindows(
      [
        { atMs: 1000, nx: 0.3, ny: 0.3 },
        { atMs: 9000, nx: 0.7, ny: 0.7 },
      ],
      ZOOM,
    );
    expect(windows.length).toBe(2);
  });
});

describe('AC5 / ADR-011: the focus track', () => {
  it('prefers click-downs, the strongest attention signal the IR carries', () => {
    const flow = makeFlow({ durationMs: 4000, clickTimesMs: [1000, 3000] });
    const events = collectFocusEvents(flow);
    expect(events.length).toBe(2);
    expect(events[0]?.atMs).toBe(1000);
  });

  it('falls back to the pointer trail when a walkthrough has no clicks', () => {
    const flow = makeFlow({ durationMs: 4000, clickTimesMs: [] });
    const events = collectFocusEvents(flow);
    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(24);
  });

  it('collapses to the frame centre when there is neither', () => {
    const flow = makeFlow({ durationMs: 4000, clickTimesMs: [] });
    const bare = { ...flow, waggle: { ...flow.waggle, cursorTrail: [], clicks: [] } };
    expect(collectFocusEvents(bare)).toEqual([]);
    const track = buildZoomTrack({
      flow: bare,
      zoom: ZOOM,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 4000),
      reframe: 'reframed',
    });
    expect(track.focusX).toEqual([{ atMs: 0, value: 0.5 }]);
  });

  it('starts a reframed preset already looking at the first point of interest', () => {
    const flow = makeFlow({ durationMs: 4000, clickTimesMs: [2000] });
    const timeline = buildTimeline(DEFAULT_BRAND_KIT, 4000);
    const reframed = buildZoomTrack({ flow, zoom: ZOOM, timeline, reframe: 'reframed' });
    expect(reframed.focusX[0]?.atMs).toBe(0);
    // A native preset cannot pan at zoom 1 anyway, so no leading keyframe.
    const native = buildZoomTrack({ flow, zoom: ZOOM, timeline, reframe: 'native' });
    expect(native.focusX[0]?.atMs).toBe(2000);
  });

  it('emits sorted, de-duplicated keyframes', () => {
    const track = buildZoomTrack({
      flow: makeFlow({ durationMs: 4000, clickTimesMs: [1000, 1000, 2000] }),
      zoom: ZOOM,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 4000),
      reframe: 'native',
    });
    for (const keyframes of [track.zoom, track.focusX, track.focusY]) {
      for (let i = 1; i < keyframes.length; i += 1) {
        const previous = keyframes[i - 1];
        const current = keyframes[i];
        expect(current?.atMs).toBeGreaterThan(previous?.atMs ?? -1);
      }
    }
  });
});

describe('AC5: cover geometry and crop expressions', () => {
  it('covers the preset exactly at zoom 1 for a native aspect ratio', () => {
    const geometry = computeCoverGeometry(LANDSCAPE, 640, 360);
    expect(geometry).toEqual({ coverWidth: 1280, coverHeight: 720 });
  });

  it('overshoots one axis for a reframed preset, which is the pan room', () => {
    const geometry = computeCoverGeometry(PORTRAIT, 1280, 720);
    expect(geometry.coverHeight).toBe(1280);
    // 16:9 scaled to 1280 tall is 2276 wide, giving 1556px of pan room
    // for a 720px-wide window. That room IS ADR-011's reframe.
    expect(geometry.coverWidth).toBeGreaterThan(PORTRAIT.width);
  });

  it('always returns even dimensions, which chroma subsampling requires', () => {
    for (const [w, h] of [
      [1279, 719],
      [641, 361],
      [333, 777],
    ] as const) {
      const geometry = computeCoverGeometry(LANDSCAPE, w, h);
      expect(geometry.coverWidth % 2).toBe(0);
      expect(geometry.coverHeight % 2).toBe(0);
    }
  });

  it('refuses a zero-sized source instead of dividing by it', () => {
    expect(() => computeCoverGeometry(LANDSCAPE, 0, 360)).toThrow(/must be positive/);
  });

  it('uses crop+scale and never zoompan (ADR-003)', () => {
    const expressions = zoomExpressionsFor(LANDSCAPE, 640, 360);
    const all = [
      expressions.zoom,
      expressions.scaledWidth,
      expressions.scaledHeight,
      expressions.cropX,
      expressions.cropY,
    ].join(' ');
    expect(all).not.toContain('zoompan');
    // Even-rounded per-frame scale, which the cursor projection reuses
    // verbatim so the two can never disagree by a pixel.
    expect(expressions.scaledWidth).toMatch(/^ceil\(1280\*\(/);
    expect(expressions.scaledWidth).toMatch(/\/2\)\*2$/);
  });

  it('clamps the crop window inside the scaled frame', () => {
    const expressions = zoomExpressionsFor(LANDSCAPE, 640, 360);
    expect(expressions.cropX).toBe(`min(max((${expressions.focusX})*in_w-out_w/2,0),in_w-out_w)`);
    expect(expressions.cropY).toBe(`min(max((${expressions.focusY})*in_h-out_h/2,0),in_h-out_h)`);
  });

  it('reproduces the crop offset analytically when projecting a point', () => {
    // An overlay filter cannot read an upstream filter's frame size, so
    // the projection re-derives `in_w` as the identical scale expression.
    const expressions = zoomExpressionsFor(LANDSCAPE, 640, 360);
    const projected = projectNormalizedX(expressions, '0.5');
    expect(projected).toContain(expressions.scaledWidth);
    expect(projected).not.toContain('in_w');
    expect(projected.startsWith('(0.5)*(')).toBe(true);
  });
});

describe('ADR-011: honest reframe labelling', () => {
  it('labels a matching aspect ratio native and a mismatched one reframed', () => {
    expect(isNativeAspect(LANDSCAPE, 640, 360)).toBe(true);
    expect(reframeModeFor(LANDSCAPE, 640, 360)).toBe('native');
    expect(reframeModeFor(PORTRAIT, 1280, 720)).toBe('reframed');
    expect(reframeModeFor(LANDSCAPE, 1080, 1080)).toBe('reframed');
  });

  it('tolerates a half-pixel aspect difference', () => {
    expect(isNativeAspect(LANDSCAPE, 1281, 720)).toBe(true);
  });

  it('never calls a zero-sized source native', () => {
    expect(isNativeAspect(LANDSCAPE, 0, 0)).toBe(false);
  });
});

function zoomExpressionsFor(
  preset: typeof LANDSCAPE,
  sourceWidth: number,
  sourceHeight: number,
): ReturnType<typeof buildZoomExpressions> {
  const flow = makeFlow({ durationMs: 4000, clickTimesMs: [1500] });
  const timeline = buildTimeline(DEFAULT_BRAND_KIT, 4000);
  const track = buildZoomTrack({
    flow,
    zoom: ZOOM,
    timeline,
    reframe: reframeModeFor(preset, sourceWidth, sourceHeight),
  });
  return buildZoomExpressions(
    track,
    preset,
    computeCoverGeometry(preset, sourceWidth, sourceHeight),
  );
}
