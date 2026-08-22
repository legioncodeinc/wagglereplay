// SPDX-License-Identifier: AGPL-3.0-or-later
import type { BrandKit } from './brand/schema.js';

/**
 * The composited timeline.
 *
 * Intro and outro cards EXTEND the timeline rather than covering the first
 * and last seconds of the recording, so every other layer has to be shifted
 * by the intro's duration. Getting that offset wrong is the single easiest
 * way to desynchronize captions from audio, so it is computed once, here,
 * and threaded through every generator rather than recomputed per layer.
 *
 * Two clocks exist and they are never mixed:
 *
 *  - BODY time: milliseconds relative to `flow.waggle.startEpochMs`. This
 *    is what the IR stores (cursor trail, clicks) and what `words.json`
 *    stores (relative to the start of the narration audio).
 *  - TIMELINE time: milliseconds from the first frame of the output file.
 *
 * `toTimelineMs` is the only conversion, and everything downstream of the
 * graph builder speaks timeline time exclusively.
 */
export interface RenderTimeline {
  readonly introMs: number;
  readonly outroMs: number;
  /** Where the recording's own first frame lands on the timeline. */
  readonly bodyStartMs: number;
  readonly bodyDurationMs: number;
  readonly bodyEndMs: number;
  readonly outroStartMs: number;
  readonly totalMs: number;
}

export function buildTimeline(kit: BrandKit, bodyDurationMs: number): RenderTimeline {
  const introMs = kit.intro !== null && kit.intro.enabled ? kit.intro.durationMs : 0;
  const outroMs = kit.outro !== null && kit.outro.enabled ? kit.outro.durationMs : 0;
  const bodyStartMs = introMs;
  const bodyEndMs = bodyStartMs + bodyDurationMs;
  return {
    introMs,
    outroMs,
    bodyStartMs,
    bodyDurationMs,
    bodyEndMs,
    outroStartMs: bodyEndMs,
    totalMs: bodyEndMs + outroMs,
  };
}

/** Body time (IR or narration relative ms) to timeline time. */
export function toTimelineMs(timeline: RenderTimeline, bodyMs: number): number {
  return timeline.bodyStartMs + bodyMs;
}

/** Clamps a body-time value into the recording's own span before shifting it. */
export function toClampedTimelineMs(timeline: RenderTimeline, bodyMs: number): number {
  const clamped = Math.min(Math.max(bodyMs, 0), timeline.bodyDurationMs);
  return toTimelineMs(timeline, clamped);
}
