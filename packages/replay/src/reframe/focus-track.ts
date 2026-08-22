// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FocusPoint } from '../capture/timing-manifest.js';
import type { StepExecutionResult } from '../steps/replay-step.js';

/**
 * The smart-reframe focus-point track (prd-009 AC5, ADR-011).
 *
 * ADR-011: the compositor drives "an animated crop window whose focus
 * point follows IR click coordinates and element centers, eased between
 * steps." For a replay-sourced capture the REPLAY knows better than the
 * recorded IR where attention sat: elements moved, fallback selectors
 * resolved to different nodes, and the act-time centers were measured
 * live. This module turns a capture session's step results into that
 * track, normalized 0..1 so the compositor can re-project it onto any
 * preset.
 *
 * Easing: focus points hold while a step settles (the viewer reads the
 * outcome), then glide to the next point over a fixed ease window rather
 * than teleporting. The ease is the same family the compositor uses
 * (smoothstep), so the emitted track and the crop window's motion agree
 * in character even though the compositor re-eases at render time.
 */

/** Ease window between two consecutive focus points, in ms. */
export const FOCUS_EASE_MS = 400;

/** Samples per eased segment; the compositor re-eases, this only paces it. */
export const FOCUS_EASE_SAMPLES = 4;

/** The smoothstep family: deterministic, symmetric, no model in the loop. */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

export interface FocusTrackOptions {
  /** Viewport the capture ran at, for normalizing pixel centers. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Total capture duration, so the final hold runs to the end. */
  readonly durationMs: number;
  /** Ease window override. Default FOCUS_EASE_MS. */
  readonly easeMs?: number;
}

export function buildFocusTrack(
  steps: readonly StepExecutionResult[],
  options: FocusTrackOptions,
): FocusPoint[] {
  const easeMs = options.easeMs ?? FOCUS_EASE_MS;

  // Anchor points: one per step that knows where attention sat.
  const anchors: FocusPoint[] = [];
  for (const step of steps) {
    if (step.center === null) {
      continue;
    }
    const nx = clamp01(step.center.x / options.viewportWidth);
    const ny = clamp01(step.center.y / options.viewportHeight);
    const atMs = Math.max(0, step.startOffsetMs + step.durationMs / 2);
    const previous = anchors[anchors.length - 1];
    if (previous !== undefined && previous.atMs === atMs) {
      // Two steps inside the same tick: keep the later one.
      anchors[anchors.length - 1] = { atMs, nx, ny };
      continue;
    }
    anchors.push({ atMs, nx, ny });
  }

  if (anchors.length === 0) {
    // No element centers at all (a navigation-only walkthrough): the
    // honest track is the frame centre, which is what the compositor
    // would default to anyway; emitting it explicitly keeps the
    // manifest's contract unconditional.
    return [{ atMs: 0, nx: 0.5, ny: 0.5 }];
  }

  // Duplicate the first anchor to t=0 when it starts late, so the crop
  // window opens already looking at the first point of interest.
  const first = anchors[0];
  if (first !== undefined && first.atMs > 0) {
    anchors.unshift({ atMs: 0, nx: first.nx, ny: first.ny });
  }

  const track: FocusPoint[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const current = anchors[i];
    const next = anchors[i + 1];
    if (current === undefined) {
      continue;
    }
    track.push(current);
    if (next === undefined) {
      break;
    }
    // Hold at the current point for the gap minus the ease window, then
    // emit samples gliding to the next anchor.
    const gap = next.atMs - current.atMs;
    const window = Math.min(easeMs, gap);
    if (window <= 0) {
      continue;
    }
    const startEase = next.atMs - window;
    for (let sample = 1; sample < FOCUS_EASE_SAMPLES; sample += 1) {
      const t = sample / FOCUS_EASE_SAMPLES;
      const atMs = startEase + window * t;
      const eased = smoothstep(t);
      track.push({
        atMs,
        nx: clamp01(current.nx + (next.nx - current.nx) * eased),
        ny: clamp01(current.ny + (next.ny - current.ny) * eased),
      });
    }
  }

  // Hold the last anchor to the end of the capture.
  const last = anchors[anchors.length - 1];
  if (last !== undefined && options.durationMs > last.atMs) {
    track.push({ atMs: options.durationMs, nx: last.nx, ny: last.ny });
  }

  return track.sort((a, b) => a.atMs - b.atMs);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
