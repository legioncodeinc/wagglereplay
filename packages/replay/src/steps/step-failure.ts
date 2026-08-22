// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The structured step failure (prd-009 AC1).
 *
 * "Failures produce a structured step failure, never a crash." A replay of
 * a stale IR against a changed app EXPECTS failures; they are the input
 * to prd-011's self-heal proposals and to the run report's failure
 * section, so they carry everything a downstream needs: which step, which
 * phase died, every selector tried, and a scrubbed message.
 *
 * The message a failure detail carries MUST be safe to write into a run
 * report: replay of authenticated targets resolves credential values at
 * fill time (prd-010 AC2), and a `fill` failure whose message echoes the
 * value would leak the secret into a committed project file. Scrubbing is
 * applied where the detail is BUILT (replay-step.ts runs every message
 * through its `scrubMessage` option before constructing the detail), not
 * by any carrier type: details are plain JSON from that point on.
 *
 * Removed 2026-08-21 (Run 4 guardrail pass): a `StepFailure extends
 * Error` class used to live here but was never constructed anywhere; its
 * doc comment claimed it scrubbed messages at construction time, which
 * was false (scrubbing happens in replay-step.ts as described above).
 * `StepFailureDetail` is the canonical, JSON-serializable shape.
 */

/** Which phase of step execution failed. */
export const STEP_FAILURE_PHASES = [
  'locate',
  'act',
  'settle',
  'screenshot',
  'unsupported',
] as const;
export type StepFailurePhase = (typeof STEP_FAILURE_PHASES)[number];

export interface StepFailureDetail {
  /** Index into `flow.steps`. */
  readonly stepIndex: number;
  /** The IR step type, e.g. `click`, `change`. */
  readonly stepType: string;
  readonly phase: StepFailurePhase;
  /**
   * Human-readable, scrubbed reason. Never contains a resolved
   * credential value (ADR-008): replay-step.ts scrubs every message
   * before a detail is constructed.
   */
  readonly message: string;
  /** Selector candidates attempted before the failure, in order. */
  readonly attemptedSelectors: readonly string[];
  /** The underlying error's name, when there was one, for triage. */
  readonly causeName?: string;
  /** True when the failure was a fallback-selector drift that could not recover. */
  readonly afterDrift: boolean;
}
