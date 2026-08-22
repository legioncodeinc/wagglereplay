// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CaptureEvent } from '@waggle/extension';
import type { FrameRedaction } from '../frames/redaction.js';

/**
 * The three raw event types that ever start or extend a step: everything
 * else (`route`, `state-change`, `settle`) is an outcome that attaches to
 * whichever action group is open, and `pointermove` never becomes a step
 * at all (it only feeds `flow.waggle.cursorTrail`, see
 * ../coords: no, see ./segment-session.ts).
 */
export type ActionEvent = Extract<CaptureEvent, { type: 'click' | 'scroll' | 'input' }>;
export type OutcomeEvent = Extract<CaptureEvent, { type: 'route' | 'state-change' | 'settle' }>;

/**
 * One in-progress or closed run of action events plus whatever outcome
 * events landed on it while it was open. `actionEvents` holds every event
 * that coalesced into this group (see ./group-events.ts's coalescing
 * rule); `outcome` accumulates as route/state-change/settle events arrive.
 */
export interface EventGroup {
  readonly actionType: ActionEvent['type'];
  readonly actionEvents: ActionEvent[];
  outcome: {
    route: Extract<OutcomeEvent, { type: 'route' }> | null;
    stateChange: Extract<OutcomeEvent, { type: 'state-change' }> | null;
    settle: Extract<OutcomeEvent, { type: 'settle' }> | null;
  };
  /** The route the user was viewing when this group's first action fired. */
  routeAtStart: string;
}

/**
 * A route event with no group open to attach to (a full-page load or
 * back/forward navigation not immediately preceded by a captured click).
 * Segmentation still turns this into a bare `navigate` step rather than
 * silently dropping it; see ./build-steps.ts.
 */
export interface OrphanRoute {
  readonly kind: 'orphan-route';
  readonly event: Extract<OutcomeEvent, { type: 'route' }>;
  readonly routeAtStart: string;
}

export type GroupOrOrphan = EventGroup | OrphanRoute;

/**
 * Per-step timing and location data the IR itself does not carry (the
 * Puppeteer Replay step core has no timestamp field; replay executes
 * steps in order and waits via `assertedEvents`/`timeout` instead). The
 * frame extractor (../frames/extraction-plan.ts) and the heatmap
 * aggregator (../heatmap/aggregate.ts) both need it; it is never written
 * into the IR file itself.
 */
export interface StepTiming {
  readonly stepIndex: number;
  /** ms relative to `flow.waggle.startEpochMs`, this step's own action (click/scroll/input). */
  readonly actionRelMs: number;
  /** ms relative to `flow.waggle.startEpochMs` when this step's settle resolved, or `null`. */
  readonly settledRelMs: number | null;
  /** The click point in recorded-viewport CSS pixels, only for `click` steps. */
  readonly clickPoint: { readonly x: number; readonly y: number } | null;
  /** The route the user was viewing when this step's action fired. */
  readonly route: string;
}

export type { FrameRedaction };
