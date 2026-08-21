/**
 * The structured step failure (prd-009 AC1).
 *
 * "Failures produce a structured StepFailure, never a crash." A replay of
 * a stale IR against a changed app EXPECTS failures; they are the input
 * to prd-011's self-heal proposals and to the run report's failure
 * section, so they carry everything a downstream needs: which step, which
 * phase died, every selector tried, and a scrubbed message.
 *
 * The message a StepFailure carries MUST be safe to write into a run
 * report: replay of authenticated targets resolves credential values at
 * fill time (prd-010 AC2), and a `fill` failure whose message echoes the
 * value would leak the secret into a committed project file. The class
 * therefore takes the message through the same scrubber the run report
 * uses, applied at construction time.
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
   * credential value (ADR-008): construction routes it through the
   * scrubber.
   */
  readonly message: string;
  /** Selector candidates attempted before the failure, in order. */
  readonly attemptedSelectors: readonly string[];
  /** The underlying error's name, when there was one, for triage. */
  readonly causeName?: string;
  /** True when the failure was a fallback-selector drift that could not recover. */
  readonly afterDrift: boolean;
}

/**
 * A structured, JSON-serializable step failure. Extends Error so it can
 * be thrown through Promise machinery when a caller wants exceptions, but
 * `toJSON()` is the canonical shape the run report stores.
 */
export class StepFailure extends Error {
  readonly detail: StepFailureDetail;

  constructor(detail: StepFailureDetail) {
    super(detail.message);
    this.name = 'StepFailure';
    this.detail = detail;
  }

  toJSON(): StepFailureDetail {
    return this.detail;
  }
}

export function isStepFailure(value: unknown): value is StepFailure {
  return value instanceof StepFailure;
}
