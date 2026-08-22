// SPDX-License-Identifier: AGPL-3.0-or-later
import type { WalkthroughFlow } from '@waggle/ir';
import { toNormalized, viewportSize } from '@waggle/ir';
import type { CursorStyle } from '../brand/schema.js';
import { type Keyframe, piecewise } from '../expr/piecewise.js';
import type { RenderTimeline } from '../timeline.js';
import { toClampedTimelineMs } from '../timeline.js';
import {
  projectNormalizedX,
  projectNormalizedY,
  type ZoomExpressions,
} from '../zoom/expressions.js';
import { springSmoothPath, type TimedPoint } from './spring.js';

/**
 * The synthetic cursor overlay track and the per-click ripple windows
 * (prd-007 AC3).
 *
 * The cursor's animated position is baked into the `overlay` filter's x/y
 * expressions rather than pre-rendered as a video track: an overlay
 * expression costs one string in the filter graph, while a pre-rendered
 * alpha track costs a second encode, a temporary file, and the corpus's
 * alpha-handling trap ("MP4 has no alpha; VP9 WebM does") for something
 * that is only ever a moving sprite.
 *
 * That trade has one real cost, and `MAX_CURSOR_SEGMENTS` is where it is
 * paid: the expression grows linearly with the number of smoothed samples.
 * A long walkthrough is decimated rather than allowed to produce a
 * megabyte-long expression, and the decimation is deterministic.
 */

/** Upper bound on piecewise segments in the cursor position expression. */
export const MAX_CURSOR_SEGMENTS = 600;

export interface RippleWindow {
  /** Timeline ms. */
  readonly startMs: number;
  readonly endMs: number;
  /** Normalized 0..1 click position. */
  readonly nx: number;
  readonly ny: number;
}

export interface CursorTrack {
  /** Smoothed, normalized path on the timeline clock. Empty when there is no trail. */
  readonly path: readonly TimedPoint[];
  readonly ripples: readonly RippleWindow[];
}

export interface CursorTrackInput {
  readonly flow: WalkthroughFlow;
  readonly cursor: CursorStyle;
  readonly timeline: RenderTimeline;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Normalizes, spring-smooths, and re-times the recorded pointer trail onto
 * the composited timeline.
 *
 * Smoothing happens in NORMALIZED space, not in recorded pixels, so a kit's
 * spring settings feel the same at every preset: the same stiffness has to
 * mean the same responsiveness whether the output is 1080p wide or 1080p
 * tall.
 */
export function buildCursorTrack(input: CursorTrackInput): CursorTrack {
  const { flow, cursor, timeline } = input;
  if (!cursor.enabled) {
    return { path: [], ripples: [] };
  }

  const viewport = viewportSize(flow.waggle.recordedViewport);
  const normalizedTrail: TimedPoint[] = flow.waggle.cursorTrail.map((sample) => {
    const normalized = toNormalized({ x: sample.x, y: sample.y }, viewport);
    return { t: sample.t, x: clamp01(normalized.nx), y: clamp01(normalized.ny) };
  });

  const smoothed = springSmoothPath(normalizedTrail, {
    spring: cursor.spring,
    startMs: 0,
    endMs: timeline.bodyDurationMs,
    maxSamples: MAX_CURSOR_SEGMENTS + 1,
  });

  const path: TimedPoint[] = smoothed.map((point) => ({
    t: toClampedTimelineMs(timeline, point.t),
    x: clamp01(point.x),
    y: clamp01(point.y),
  }));

  const ripples: RippleWindow[] = cursor.ripple.enabled
    ? flow.waggle.clicks
        .filter((click) => click.down)
        .map((click) => {
          const normalized = toNormalized({ x: click.x, y: click.y }, viewport);
          const startMs = toClampedTimelineMs(timeline, click.t);
          return {
            startMs,
            endMs: Math.min(timeline.totalMs, startMs + cursor.ripple.durationMs),
            nx: clamp01(normalized.nx),
            ny: clamp01(normalized.ny),
          };
        })
        .filter((ripple) => ripple.endMs > ripple.startMs)
    : [];

  return { path, ripples };
}

export interface CursorOverlayExpressions {
  /** Overlay x for the cursor sprite, with its tip at the tracked point. */
  readonly x: string;
  readonly y: string;
}

function toKeyframes(path: readonly TimedPoint[], axis: 'x' | 'y'): Keyframe[] {
  return path.map((point) => ({ atMs: point.t, value: axis === 'x' ? point.x : point.y }));
}

/**
 * Turns the smoothed path into `overlay` x/y expressions in output-frame
 * pixels, projected through the same zoom and crop the base video went
 * through so the cursor stays pinned to the content it is pointing at.
 *
 * The sprite's hot spot is its top-left pixel (see ../ffmpeg/sprites.ts,
 * which draws the arrow tip there), so the projected point is used
 * directly with no offset.
 */
export function buildCursorOverlayExpressions(
  track: CursorTrack,
  zoom: ZoomExpressions,
): CursorOverlayExpressions | null {
  if (track.path.length === 0) {
    return null;
  }
  const nx = piecewise(toKeyframes(track.path, 'x'), 'linear');
  const ny = piecewise(toKeyframes(track.path, 'y'), 'linear');
  return {
    x: projectNormalizedX(zoom, nx),
    y: projectNormalizedY(zoom, ny),
  };
}
