// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CaptureEvent, CaptureEventDraft } from './events.js';
import { CaptureEventSchema } from './events.js';

/**
 * In-memory accumulator for one capture session's event stream.
 *
 * Owns nothing but the ordered event list and the sequence counter; the
 * background service worker feeds it every telemetry, route, state-change,
 * and settle event it receives, and hands the accumulated state to
 * `./finalizer.ts` when the user stops the recording. Kept free of any
 * `chrome.*` dependency so it, and the finalizer downstream of it, can run
 * (and be tested) outside a browser entirely - which is exactly what the
 * seam-injected AC8 proof does (test/e2e/run-alignment-e2e.ts).
 */

export interface SessionInfo {
  sessionId: string;
  tabId: number;
  startEpochMs: number;
  initialUrl: string;
  userAgent: string;
  recordedViewport: { w: number; h: number; dpr: number };
  fixtureVariant?: string;
}

export class CaptureSession {
  readonly info: SessionInfo;
  private nextSeq = 0;
  private readonly events: CaptureEvent[] = [];

  constructor(info: SessionInfo) {
    this.info = info;
  }

  /**
   * Records one event. `seq`/`tabId` are filled in here so callers never
   * have to track the counter themselves; the result is validated against
   * `CaptureEventSchema` before being kept, so a malformed event throws
   * immediately at the point it was produced rather than surfacing later
   * as an unreadable `events.jsonl` line.
   */
  record(event: CaptureEventDraft): CaptureEvent {
    const withEnvelope = {
      ...event,
      seq: this.nextSeq,
      tabId: this.info.tabId,
    } as CaptureEvent;
    const validated = CaptureEventSchema.parse(withEnvelope);
    this.events.push(validated);
    this.nextSeq += 1;
    return validated;
  }

  get eventCount(): number {
    return this.events.length;
  }

  /** A defensive copy of the accumulated events, ordered by `seq`. */
  snapshot(): CaptureEvent[] {
    return [...this.events];
  }
}
