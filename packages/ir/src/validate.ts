// SPDX-License-Identifier: AGPL-3.0-or-later
import type { z } from 'zod';
import { type WalkthroughFlow, WalkthroughFlowSchema } from './schema/flow.js';
import { type UserFlowCore, UserFlowCoreSchema } from './schema/step-core.js';

/**
 * Validation entry points for the Walkthrough IR.
 *
 * Every failure is reported with a JSON path precise enough to point at the
 * exact offending value, for example `steps[2].selectors[0]` or
 * `waggle.recordedViewport.h`. A validator that only says "invalid input"
 * makes a 200-step IR unfixable by hand, and hand-fixing an IR is a first
 * class workflow: IR files are committed to git and reviewed in PRs
 * (ADR-015).
 */

export interface IrValidationIssue {
  /** JSON path of the offending value, e.g. `steps[2].waggle.settle.ms`. */
  readonly path: string;
  readonly message: string;
  /** The underlying zod issue code, e.g. `invalid_type`, `unrecognized_keys`. */
  readonly code: string;
}

/**
 * Renders a zod issue path as a JSON path: numeric segments become
 * `[n]` and string segments become `.name`, so an array element reads
 * `steps[2].selectors[0]` rather than `steps.2.selectors.0`.
 */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  let rendered = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      rendered += `[${segment}]`;
    } else if (rendered === '') {
      rendered += String(segment);
    } else {
      rendered += `.${String(segment)}`;
    }
  }
  return rendered === '' ? '(root)' : rendered;
}

function toIssues(error: z.ZodError): IrValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Thrown by the `assert*` helpers and by the version writer. Carries the
 * full issue list, so a caller can render every problem at once instead of
 * making the user fix one field per run.
 */
export class IrValidationError extends Error {
  readonly issues: readonly IrValidationIssue[];

  constructor(subject: string, issues: readonly IrValidationIssue[]) {
    const detail = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n');
    super(`${subject} failed Walkthrough IR validation:\n${detail}`);
    this.name = 'IrValidationError';
    this.issues = issues;
  }
}

export type IrValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly IrValidationIssue[] };

/** Validates a full Walkthrough IR flow (step core plus required Waggle keys). */
export function validateWalkthroughFlow(input: unknown): IrValidationResult<WalkthroughFlow> {
  const result = WalkthroughFlowSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: toIssues(result.error) };
}

/** As `validateWalkthroughFlow`, but throws `IrValidationError` on failure. */
export function assertWalkthroughFlow(input: unknown, subject = 'Walkthrough IR'): WalkthroughFlow {
  const result = validateWalkthroughFlow(input);
  if (result.ok) {
    return result.value;
  }
  throw new IrValidationError(subject, result.issues);
}

/**
 * Validates a bare Puppeteer Replay / Chrome Recorder user flow: the step
 * core with no Waggle keys. Use this on a raw Recorder export before
 * handing it to `importChromeRecorderFlow`, and on the output of
 * `exportToPuppeteerReplay` as a cheap local check before the real
 * `@puppeteer/replay` `parse()`.
 */
export function validateUserFlowCore(input: unknown): IrValidationResult<UserFlowCore> {
  const result = UserFlowCoreSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, issues: toIssues(result.error) };
}

/** As `validateUserFlowCore`, but throws `IrValidationError` on failure. */
export function assertUserFlowCore(
  input: unknown,
  subject = 'Puppeteer Replay user flow',
): UserFlowCore {
  const result = validateUserFlowCore(input);
  if (result.ok) {
    return result.value;
  }
  throw new IrValidationError(subject, result.issues);
}
