import type { StepTiming } from '../segment/types.js';

/** AC2 defaults: a +-5s window around the action, sampled at 1 fps. */
export const DEFAULT_WINDOW_MS = 5_000;
export const DEFAULT_SAMPLE_INTERVAL_MS = 1_000;

export type FrameRole = 'before' | 'click' | 'settled' | 'sample';

export interface FrameRequest {
  readonly role: FrameRole;
  /** Milliseconds relative to the step's own action, already clamped into `[0, durationMs]`. */
  readonly relMs: number;
  /** File name within the step's directory, e.g. `click.png`, `frame_t-5000.png`. */
  readonly fileName: string;
}

export interface StepFramePlan {
  readonly stepIndex: number;
  /** Directory name for this step's frames, e.g. `step-003`. */
  readonly dirName: string;
  readonly requests: readonly FrameRequest[];
}

export interface ExtractionPlanOptions {
  readonly windowMs?: number;
  readonly sampleIntervalMs?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Zero-padded to 3 digits: `step-000` .. `step-999`, sorting correctly by name up to 1000 steps. */
export function stepDirName(stepIndex: number): string {
  return `step-${String(stepIndex).padStart(3, '0')}`;
}

function sampleFileName(offsetMs: number): string {
  const sign = offsetMs >= 0 ? '+' : '-';
  return `frame_t${sign}${Math.abs(offsetMs)}.png`;
}

/**
 * AC2: the pure planning half of keyframe extraction (no ffmpeg, no
 * filesystem - see ./extract-keyframes.ts for the half that actually
 * shells out). For every step, plans:
 *
 *  - `before.png` at `action - windowMs` (clamped to the video bounds)
 *  - `click.png` at the exact action time (clamped)
 *  - `settled.png` at the exact settle time (clamped), only when the step
 *    has one (`StepTiming.settledRelMs !== null`)
 *  - a `frame_t<+-offset>.png` at each `sampleIntervalMs` step across
 *    `[action - windowMs, action + windowMs]` (also clamped)
 *
 * Every requested time is clamped into `[0, durationMs]` rather than
 * rejected: a step whose action happens in the first or last `windowMs`
 * of the recording (the common case for the very first and very last
 * step) still gets a full, valid asset set, just with some of its window
 * flattened against the edge - which is the only sane behavior for a
 * fixed-length recording, and keeps the plan a pure function of its
 * inputs (no step is ever skipped), which idempotency depends on.
 */
export function buildExtractionPlan(
  stepTimings: readonly StepTiming[],
  durationMs: number,
  options: ExtractionPlanOptions = {},
): StepFramePlan[] {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;

  return stepTimings.map((timing): StepFramePlan => {
    const requests: FrameRequest[] = [];

    requests.push({
      role: 'before',
      relMs: clamp(timing.actionRelMs - windowMs, 0, durationMs),
      fileName: 'before.png',
    });
    requests.push({
      role: 'click',
      relMs: clamp(timing.actionRelMs, 0, durationMs),
      fileName: 'click.png',
    });
    if (timing.settledRelMs !== null) {
      requests.push({
        role: 'settled',
        relMs: clamp(timing.settledRelMs, 0, durationMs),
        fileName: 'settled.png',
      });
    }

    for (let offset = -windowMs; offset <= windowMs; offset += sampleIntervalMs) {
      requests.push({
        role: 'sample',
        relMs: clamp(timing.actionRelMs + offset, 0, durationMs),
        fileName: sampleFileName(offset),
      });
    }

    return { stepIndex: timing.stepIndex, dirName: stepDirName(timing.stepIndex), requests };
  });
}
