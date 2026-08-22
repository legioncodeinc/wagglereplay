// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Epoch alignment (the "two-clocks trap", corpus: capture-layer.md).
 *
 * `event.timeStamp` is relative to each document's own time origin, and
 * every extension context (tab, offscreen document, service worker) has a
 * different one. Everything on the master timeline is converted to a true
 * epoch value (milliseconds since 1970-01-01) via
 * `performance.timeOrigin + event.timeStamp`, which is monotonic and
 * drift-free within a context. The video's own t0 is anchored the same
 * way, at `MediaRecorder.onstart` (see offscreen/recorder.ts), so a click
 * event and the video frame it caused share one clock.
 */

/** Converts a `performance`-relative timestamp to a true epoch (ms since 1970-01-01). */
export function epochFromTimeOrigin(timeOrigin: number, timeStampMs: number): number {
  return timeOrigin + timeStampMs;
}

export interface EpochSource {
  now(): number;
}

/** The real `performance`-backed epoch source used in production. */
export function createPerformanceEpochSource(perf: Performance = performance): EpochSource {
  return {
    now: () => perf.timeOrigin + perf.now(),
  };
}
