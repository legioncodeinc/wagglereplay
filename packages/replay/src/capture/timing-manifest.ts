// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import { z } from 'zod';
import type { StepExecutionResult } from '../steps/replay-step.js';
import { REPLAY_SETTLE_SOURCES } from '../steps/settle.js';

/**
 * The per-step timing manifest (prd-009 AC3): the capture's companion
 * document. The video is A/V-free pixels; the manifest is what lets the
 * compositor and the run report know WHEN each step happened, WHICH
 * selector carried it, and WHERE attention sat (the focus track, AC5).
 *
 * Times are milliseconds relative to the capture session's start, the
 * same convention the IR uses relative to `flow.waggle.startEpochMs`, so
 * a consumer never converts between clocks.
 */

export const ReplayStepRecordSchema = z.strictObject({
  stepIndex: z.number().int().nonnegative(),
  stepType: z.string(),
  ok: z.boolean(),
  startOffsetMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  settleSource: z.enum(REPLAY_SETTLE_SOURCES).nullable(),
  /** The recorded selector alternative that resolved, when one did. */
  selectorUsed: z
    .strictObject({
      recorded: z.string(),
      playwright: z.string(),
      engine: z.string(),
      alternativeIndex: z.number().int().nonnegative(),
      drift: z.boolean(),
    })
    .nullable(),
  attemptedSelectors: z.array(z.string()),
  screenshotRef: z.string().nullable(),
  failure: z
    .strictObject({
      phase: z.string(),
      message: z.string(),
      afterDrift: z.boolean(),
    })
    .nullable(),
});

export type ReplayStepRecord = z.infer<typeof ReplayStepRecordSchema>;

/** One point on the eased focus track (AC5), normalized 0..1. */
export const FocusPointSchema = z.strictObject({
  atMs: z.number().nonnegative(),
  nx: z.number().min(0).max(1),
  ny: z.number().min(0).max(1),
});

export type FocusPoint = z.infer<typeof FocusPointSchema>;

export const ReplayManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** The IR version this capture replayed. */
  irVersion: z.number().int().positive(),
  /** The replay preset id (from this package's registry). */
  replayPresetId: z.string().min(1),
  /** The compose preset the capture composites into. */
  composePresetId: z.string().min(1),
  /** native when captured at the preset viewport, reframed when captured at the master (ADR-011). */
  reflow: z.enum(['native', 'reframed']),
  reflowReason: z.string(),
  capture: z.strictObject({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().positive(),
    durationMs: z.number().nonnegative(),
    framesReceived: z.number().int().nonnegative(),
    framesWritten: z.number().int().nonnegative(),
  }),
  steps: z.array(ReplayStepRecordSchema),
  /** Emitted for reframed captures (AC5); empty for native ones. */
  focusTrack: z.array(FocusPointSchema),
});

export type ReplayManifest = z.infer<typeof ReplayManifestSchema>;

/** Builds the manifest data object from a capture session's raw results. */
export function buildReplayManifest(input: {
  irVersion: number;
  replayPresetId: string;
  composePresetId: string;
  reflow: 'native' | 'reframed';
  reflowReason: string;
  capture: {
    width: number;
    height: number;
    fps: number;
    durationMs: number;
    framesReceived: number;
    framesWritten: number;
  };
  steps: readonly StepExecutionResult[];
  focusTrack: readonly FocusPoint[];
  /** Directory the manifest is written into; screenshot refs stay portable from here. */
  screenshotBaseDir: string;
}): ReplayManifest {
  return ReplayManifestSchema.parse({
    schemaVersion: 1,
    irVersion: input.irVersion,
    replayPresetId: input.replayPresetId,
    composePresetId: input.composePresetId,
    reflow: input.reflow,
    reflowReason: input.reflowReason,
    capture: input.capture,
    focusTrack: input.focusTrack,
    steps: input.steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepType: step.stepType,
      ok: step.ok,
      startOffsetMs: Math.max(0, step.startOffsetMs),
      durationMs: step.durationMs,
      settleSource: step.settle?.source ?? null,
      selectorUsed:
        step.selector === null
          ? null
          : {
              recorded: step.selector.recorded,
              playwright: step.selector.playwright,
              engine: step.selector.engine,
              alternativeIndex: step.selector.alternativeIndex,
              drift: step.selector.drift,
            },
      attemptedSelectors: [...step.attemptedSelectors],
      screenshotRef:
        step.screenshotPath === null
          ? null
          : path.relative(input.screenshotBaseDir, step.screenshotPath).split(path.sep).join('/'),
      failure:
        step.failure === null
          ? null
          : {
              phase: step.failure.phase,
              message: step.failure.message,
              afterDrift: step.failure.afterDrift,
            },
    })),
  });
}
