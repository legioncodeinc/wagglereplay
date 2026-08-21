import type { WalkthroughFlow } from '@waggle/ir';
import { toNormalized, viewportSize } from '@waggle/ir';
import type { ZoomStyle } from '../brand/schema.js';
import type { Keyframe } from '../expr/piecewise.js';
import type { ReframeMode } from '../presets.js';
import type { RenderTimeline } from '../timeline.js';
import { toClampedTimelineMs } from '../timeline.js';

/**
 * Click-driven auto-zoom segments (AC5) and the ADR-011 smart-reframe
 * focus track, derived from the same IR data by the same code.
 *
 * They are one module because they are one mechanism. ADR-011: "the render
 * engine replays at the 16:9 master viewport and the compositor drives an
 * animated crop window whose focus point follows IR click coordinates and
 * element centers, eased between steps. Deterministic, no model in the
 * loop." Auto-zoom is that same crop window with its SIZE animated as well
 * as its position. Implementing them separately would have produced two
 * crop windows fighting over the same frame.
 */

/** A moment the viewer's attention is known to be somewhere specific. */
export interface FocusEvent {
  /** Body time, in ms relative to `flow.waggle.startEpochMs`. */
  readonly atMs: number;
  /** Normalized 0..1 position, so it survives any preset re-projection. */
  readonly nx: number;
  readonly ny: number;
}

/** One merged zoom window on the body timeline. */
export interface ZoomWindow {
  readonly inStartMs: number;
  readonly peakStartMs: number;
  readonly peakEndMs: number;
  readonly outEndMs: number;
}

export interface ZoomTrack {
  /** Magnification over time. Always contains at least two keyframes. */
  readonly zoom: readonly Keyframe[];
  /** Normalized focus x over time. */
  readonly focusX: readonly Keyframe[];
  readonly focusY: readonly Keyframe[];
  readonly windows: readonly ZoomWindow[];
  readonly focusEvents: readonly FocusEvent[];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * The moments attention is pinned, newest information first: a pointer
 * press is the strongest signal the IR carries, so click-downs are used
 * alone when there are any.
 *
 * When there are none (a scroll-only or navigation-only walkthrough) and
 * the preset needs reframing anyway, the smoothed pointer trail is the
 * next best deterministic signal. When there is neither, the focus track
 * collapses to the frame centre, which is an honest centre crop and is
 * labelled `reframed` in the render metadata all the same.
 */
export function collectFocusEvents(flow: WalkthroughFlow, maxTrailEvents = 24): FocusEvent[] {
  const viewport = viewportSize(flow.waggle.recordedViewport);

  const clicks = flow.waggle.clicks
    .filter((click) => click.down)
    .map((click) => {
      const normalized = toNormalized({ x: click.x, y: click.y }, viewport);
      return { atMs: click.t, nx: clamp01(normalized.nx), ny: clamp01(normalized.ny) };
    });
  if (clicks.length > 0) {
    return clicks;
  }

  const trail = flow.waggle.cursorTrail;
  if (trail.length === 0) {
    return [];
  }
  const stride = Math.max(1, Math.ceil(trail.length / maxTrailEvents));
  const events: FocusEvent[] = [];
  for (let i = 0; i < trail.length; i += stride) {
    const sample = trail[i];
    if (sample === undefined) {
      continue;
    }
    const normalized = toNormalized({ x: sample.x, y: sample.y }, viewport);
    events.push({ atMs: sample.t, nx: clamp01(normalized.nx), ny: clamp01(normalized.ny) });
  }
  return events;
}

/**
 * Builds one zoom window per click and merges any that overlap, so two
 * clicks in quick succession hold a single zoom rather than pumping in and
 * out between them (the single most obvious auto-zoom artifact).
 */
export function buildZoomWindows(
  focusEvents: readonly FocusEvent[],
  zoom: ZoomStyle,
): ZoomWindow[] {
  if (!zoom.enabled || zoom.level <= 1 || focusEvents.length === 0) {
    return [];
  }
  const raw: ZoomWindow[] = focusEvents
    .map((event) => {
      const peakStartMs = event.atMs - zoom.leadMs;
      return {
        inStartMs: peakStartMs - zoom.easeMs,
        peakStartMs,
        peakEndMs: peakStartMs + zoom.holdMs,
        outEndMs: peakStartMs + zoom.holdMs + zoom.easeMs,
      };
    })
    .sort((a, b) => a.inStartMs - b.inStartMs);

  const merged: ZoomWindow[] = [];
  for (const window of raw) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && window.inStartMs <= previous.outEndMs) {
      merged[merged.length - 1] = {
        inStartMs: previous.inStartMs,
        peakStartMs: previous.peakStartMs,
        peakEndMs: Math.max(previous.peakEndMs, window.peakEndMs),
        outEndMs: Math.max(previous.outEndMs, window.outEndMs),
      };
      continue;
    }
    merged.push(window);
  }
  return merged;
}

export interface ZoomTrackInput {
  readonly flow: WalkthroughFlow;
  readonly zoom: ZoomStyle;
  readonly timeline: RenderTimeline;
  readonly reframe: ReframeMode;
}

/**
 * Produces the timeline-time keyframes the crop expressions are built
 * from.
 *
 * Both tracks are clamped into the body's span and shifted onto the
 * timeline here, once, so no expression builder downstream has to know
 * that an intro card exists.
 */
export function buildZoomTrack(input: ZoomTrackInput): ZoomTrack {
  const { flow, zoom, timeline, reframe } = input;
  const focusEvents = collectFocusEvents(flow);
  const windows = buildZoomWindows(focusEvents, zoom);

  const zoomKeyframes: Keyframe[] = [{ atMs: 0, value: 1 }];
  for (const window of windows) {
    zoomKeyframes.push(
      { atMs: toClampedTimelineMs(timeline, window.inStartMs), value: 1 },
      { atMs: toClampedTimelineMs(timeline, window.peakStartMs), value: zoom.level },
      { atMs: toClampedTimelineMs(timeline, window.peakEndMs), value: zoom.level },
      { atMs: toClampedTimelineMs(timeline, window.outEndMs), value: 1 },
    );
  }
  zoomKeyframes.push({ atMs: timeline.totalMs, value: 1 });

  const focusX: Keyframe[] = [];
  const focusY: Keyframe[] = [];
  if (focusEvents.length === 0) {
    focusX.push({ atMs: 0, value: 0.5 });
    focusY.push({ atMs: 0, value: 0.5 });
  } else {
    for (const event of focusEvents) {
      const atMs = toClampedTimelineMs(timeline, event.atMs);
      focusX.push({ atMs, value: event.nx });
      focusY.push({ atMs, value: event.ny });
    }
    // Native presets have no pan room at zoom 1, so an early focus
    // keyframe is inert there; reframed presets need the frame to already
    // be looking at the first point of interest when the video starts,
    // rather than sliding into place from the centre.
    const firstX = focusX[0];
    const firstY = focusY[0];
    if (firstX !== undefined && firstX.atMs > 0 && reframe === 'reframed') {
      focusX.unshift({ atMs: 0, value: firstX.value });
    }
    if (firstY !== undefined && firstY.atMs > 0 && reframe === 'reframed') {
      focusY.unshift({ atMs: 0, value: firstY.value });
    }
  }

  return {
    zoom: dedupeSorted(zoomKeyframes),
    focusX: dedupeSorted(focusX),
    focusY: dedupeSorted(focusY),
    windows,
    focusEvents,
  };
}

/**
 * Sorts by time and drops keyframes that repeat an instant, keeping the
 * last. Stability matters: the piecewise builder assumes sorted input and
 * silently produces a mis-ordered expression otherwise.
 */
function dedupeSorted(keyframes: readonly Keyframe[]): Keyframe[] {
  const sorted = [...keyframes].sort((a, b) => a.atMs - b.atMs);
  const result: Keyframe[] = [];
  for (const keyframe of sorted) {
    const previous = result[result.length - 1];
    if (previous !== undefined && previous.atMs === keyframe.atMs) {
      result[result.length - 1] = keyframe;
      continue;
    }
    result.push(keyframe);
  }
  return result;
}
