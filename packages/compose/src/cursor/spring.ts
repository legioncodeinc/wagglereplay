import type { CursorSpring } from '../brand/schema.js';

/**
 * Spring-damped smoothing of the recorded pointer trail (prd-007 AC3).
 *
 * A raw pointer trail is a stair: browsers deliver pointer events in
 * bursts, and the recorder samples them, so replaying the trail verbatim
 * produces a cursor that teleports and stops dead. The corpus asks for a
 * "synthetic cursor: rendered as a positioned overlay driven by the
 * spring-smoothed cursor trail, style and speed from brand config", which
 * is a mass-spring-damper chasing the raw trail:
 *
 *   a = w^2 * (target - position) - 2 * zeta * w * velocity
 *
 * `w` (the kit's `stiffness`) is the natural angular frequency in rad/s:
 * higher means the cursor catches up faster. `zeta` (`dampingRatio`) at 1
 * is critical damping, the fastest approach with no overshoot; below 1 the
 * cursor overshoots slightly and settles, which reads as a human hand.
 *
 * Determinism: semi-implicit Euler at a FIXED sub-step, never a wall-clock
 * delta. The same trail and the same kit always produce the same path, on
 * any machine, which AC7's idempotency claim depends on.
 */

/** A timed point in whatever coordinate space the caller is working in. */
export interface TimedPoint {
  /** Milliseconds, in the caller's own time base. */
  readonly t: number;
  readonly x: number;
  readonly y: number;
}

/** Integration sub-steps taken per emitted sample. */
export const SPRING_SUBSTEPS = 8;

/**
 * Upper bound on the integration sub-step, in ms.
 *
 * Semi-implicit Euler's error grows with `stiffness * dt`, so this is what
 * decouples the SHAPE of the smoothed path from `sampleHz`: at 2ms a 26
 * rad/s spring tracks its closed-form step response to within about 1%,
 * and lowering the emitted sample rate no longer changes the curve, only
 * how finely it is sampled. The cost is a few tens of thousands of float
 * operations for a whole walkthrough, which is nothing next to an encode.
 */
export const MAX_SPRING_SUBSTEP_MS = 2;

function sampleTrailAt(trail: readonly TimedPoint[], timeMs: number, cursor: number): number {
  let index = cursor;
  while (index + 1 < trail.length) {
    const next = trail[index + 1];
    if (next === undefined || next.t > timeMs) {
      break;
    }
    index += 1;
  }
  return index;
}

function interpolate(trail: readonly TimedPoint[], index: number, timeMs: number): TimedPoint {
  const current = trail[index];
  const next = trail[index + 1];
  if (current === undefined) {
    throw new RangeError(`Trail index ${index} is out of range.`);
  }
  if (next === undefined || next.t <= current.t || timeMs <= current.t) {
    return current;
  }
  const progress = Math.min(1, (timeMs - current.t) / (next.t - current.t));
  return {
    t: timeMs,
    x: current.x + (next.x - current.x) * progress,
    y: current.y + (next.y - current.y) * progress,
  };
}

export interface SpringPathOptions {
  readonly spring: CursorSpring;
  /** First emitted sample time, in the trail's own time base. Defaults to the trail's first `t`. */
  readonly startMs?: number;
  /** Last emitted sample time. Defaults to the trail's last `t`. */
  readonly endMs?: number;
  /** Hard cap on emitted samples; the effective sample rate drops to respect it. */
  readonly maxSamples?: number;
}

/**
 * Runs the spring over `trail` and returns the smoothed path resampled at
 * a fixed rate.
 *
 * An empty trail returns an empty path (the caller drops the cursor
 * layer); a single-point trail returns that point held still.
 */
export function springSmoothPath(
  trail: readonly TimedPoint[],
  options: SpringPathOptions,
): TimedPoint[] {
  if (trail.length === 0) {
    return [];
  }
  const first = trail[0];
  const last = trail[trail.length - 1];
  if (first === undefined || last === undefined) {
    return [];
  }
  if (trail.length === 1) {
    return [{ t: options.startMs ?? first.t, x: first.x, y: first.y }];
  }

  const startMs = options.startMs ?? first.t;
  const endMs = options.endMs ?? last.t;
  if (endMs <= startMs) {
    return [{ t: startMs, x: first.x, y: first.y }];
  }

  const requestedStepMs = 1000 / options.spring.sampleHz;
  const maxSamples = options.maxSamples ?? Number.POSITIVE_INFINITY;
  const spanMs = endMs - startMs;
  const stepMs = Math.max(requestedStepMs, spanMs / Math.max(1, maxSamples - 1));

  const omega = options.spring.stiffness;
  const zeta = options.spring.dampingRatio;

  let posX = first.x;
  let posY = first.y;
  let velX = 0;
  let velY = 0;
  let trailCursor = 0;

  const path: TimedPoint[] = [{ t: startMs, x: posX, y: posY }];

  const substeps = Math.max(SPRING_SUBSTEPS, Math.ceil(stepMs / MAX_SPRING_SUBSTEP_MS));
  const dt = stepMs / 1000 / substeps;

  for (let timeMs = startMs + stepMs; timeMs <= endMs + 1e-9; timeMs += stepMs) {
    for (let step = 0; step < substeps; step += 1) {
      const subTimeMs = timeMs - stepMs + ((step + 1) * stepMs) / substeps;
      trailCursor = sampleTrailAt(trail, subTimeMs, trailCursor);
      const target = interpolate(trail, trailCursor, subTimeMs);
      const accelX = omega * omega * (target.x - posX) - 2 * zeta * omega * velX;
      const accelY = omega * omega * (target.y - posY) - 2 * zeta * omega * velY;
      velX += accelX * dt;
      velY += accelY * dt;
      posX += velX * dt;
      posY += velY * dt;
    }
    path.push({ t: timeMs, x: posX, y: posY });
  }

  return path;
}
