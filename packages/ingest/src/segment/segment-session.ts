import type { CaptureEvent, SessionMeta } from '@waggle/extension';
import { assertWalkthroughFlow, WAGGLE_IR_SCHEMA_VERSION, type WalkthroughFlow } from '@waggle/ir';
import type { FrameRedaction } from '../frames/redaction.js';
import { buildSteps } from './build-steps.js';
import { groupEvents } from './group-events.js';
import type { StepTiming } from './types.js';

export interface SegmentationResult {
  readonly flow: WalkthroughFlow;
  readonly stepTimings: readonly StepTiming[];
  readonly frameRedactions: readonly FrameRedaction[];
  readonly warnings: readonly string[];
}

/**
 * AC1: the top-level segmenter. Turns a session's validated event stream
 * plus its metadata into a Walkthrough IR flow (no `assets` populated
 * yet - see ../frames/extract-keyframes.ts, which fills them in before
 * the flow is written) and the parallel step-timing data the frame
 * extractor and heatmap aggregator need.
 *
 * Deterministic by construction: every value in the output is derived
 * from `events`/`meta` alone (no `Date.now()`, no `Math.random()`, no
 * environment read), which is what PRD-004 AC1's "deterministic output on
 * the fixture recordings" and AC5's "ingest is idempotent" both rest on -
 * see test/segment-session.test.ts's byte-for-byte determinism assertion
 * and test/pipeline/run-ingest.test.ts's idempotency assertion.
 */
export function segmentSession(
  events: readonly CaptureEvent[],
  meta: SessionMeta,
): SegmentationResult {
  const { groups, warnings: groupWarnings } = groupEvents(events, meta.initialUrl);
  const { steps, stepTimings, warnings: stepWarnings } = buildSteps(groups, meta.startEpochMs);

  const cursorTrail = events
    .filter((event): event is Extract<CaptureEvent, { type: 'pointermove' }> => {
      return event.type === 'pointermove';
    })
    .map((event) => ({ t: event.epochMs - meta.startEpochMs, x: event.x, y: event.y }));

  // Documented assumption (no separate press/release telemetry exists on
  // the wire - see ../../apps/extension/src/lib/events.ts's `ClickEvent`,
  // which is a single combined click, not a down/up pair): each click
  // becomes an instantaneous down-then-up pair in the cursor-click trail,
  // both at the same relative time, so the compositor's cursor renderer
  // (prd-007) still sees a press-and-release transition to animate.
  const clicks = events
    .filter((event): event is Extract<CaptureEvent, { type: 'click' }> => event.type === 'click')
    .flatMap((event) => {
      const t = event.epochMs - meta.startEpochMs;
      return [
        { t, x: event.x, y: event.y, down: true },
        { t, x: event.x, y: event.y, down: false },
      ];
    });

  const frameRedactions: FrameRedaction[] = events.flatMap((event) => {
    if (event.type !== 'input' || !event.credential) return [];
    return [
      {
        // ffmpeg seeks within the recording, whose frame zero is the
        // MediaRecorder anchor rather than the earlier session start.
        // Clamp pre-anchor events to zero so redaction fails closed from
        // the first encoded frame instead of producing a negative offset.
        startRelMs: Math.max(0, event.epochMs - meta.video.anchorEpochMs),
        geometry: event.redaction,
      },
    ];
  });

  const flow: WalkthroughFlow = {
    title: `Recording ${meta.sessionId}`,
    steps,
    waggle: {
      schemaVersion: WAGGLE_IR_SCHEMA_VERSION,
      recordedViewport: meta.recordedViewport,
      ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
      startEpochMs: meta.startEpochMs,
      cursorTrail,
      clicks,
      sourceRecording: { videoRef: meta.video.filename, durationMs: meta.video.durationMs },
    },
  };

  const validated = assertWalkthroughFlow(flow, 'segmented Walkthrough IR flow');

  return {
    flow: validated,
    stepTimings,
    frameRedactions,
    warnings: [...groupWarnings, ...stepWarnings],
  };
}
