// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

/**
 * `narration/script.json`: the drafted-then-approved narration script.
 *
 * AC1's hard constraint is "author-approved text is the ONLY input to
 * TTS." This schema encodes that as data, not just as prose: a segment's
 * `draftText` (what the segmenter wrote) is a SEPARATE field from
 * `approvedText` (what the author signed off on, possibly after editing
 * the draft in Studio, prd-005). `getApprovedSegmentTexts` below is the
 * only function in this package that hands text to a TTS adapter, and it
 * throws if any segment is not approved rather than silently falling back
 * to the draft.
 */

export const NARRATION_SCRIPT_SCHEMA_VERSION = 1;

export const NarrationSegmentDraftSchema = z.strictObject({
  /** Matches `WaggleStepExtension.narrationSegmentId` when the step already carries one. */
  narrationSegmentId: z.string().min(1),
  /** Index of the step this segment narrates, in `flow.steps`. */
  stepIndex: z.number().int().nonnegative(),
  /** What the segmenter drafted. Never sent to a TTS adapter directly. */
  draftText: z.string().min(1),
  /** `null` until the author approves (possibly editing the text) in Studio. */
  approvedText: z.string().min(1).nullable(),
  approved: z.boolean(),
  targetDurationMs: z.number().nonnegative(),
});

export type NarrationSegmentDraft = z.infer<typeof NarrationSegmentDraftSchema>;

export const NarrationScriptSchema = z.strictObject({
  schemaVersion: z.literal(NARRATION_SCRIPT_SCHEMA_VERSION),
  segments: z.array(NarrationSegmentDraftSchema),
});

export type NarrationScript = z.infer<typeof NarrationScriptSchema>;

/** Thrown by `getApprovedSegmentTexts` when the script has any unapproved segment. */
export class NarrationNotApprovedError extends Error {
  readonly unapprovedSegmentIds: readonly string[];

  constructor(unapprovedSegmentIds: readonly string[]) {
    super(
      `${unapprovedSegmentIds.length} narration segment(s) are not yet author-approved: ${unapprovedSegmentIds.join(', ')}. ` +
        'Review and approve every segment in narration/script.json (or via Studio, prd-005) before synthesizing audio. ' +
        'Author-approved text is the only input this package will ever send to a TTS provider.',
    );
    this.name = 'NarrationNotApprovedError';
    this.unapprovedSegmentIds = unapprovedSegmentIds;
  }
}

/**
 * The ONLY function in this package that extracts text destined for a TTS
 * adapter. Throws `NarrationNotApprovedError` if any segment lacks
 * `approvedText`, which is the enforcement point for AC1's "author-approved
 * text is the ONLY input to TTS."
 */
export function getApprovedSegmentTexts(script: NarrationScript): string[] {
  const unapproved = script.segments.filter(
    (segment) => !segment.approved || segment.approvedText === null,
  );
  if (unapproved.length > 0) {
    throw new NarrationNotApprovedError(unapproved.map((segment) => segment.narrationSegmentId));
  }
  // Narrowed by the check above: every segment here is approved and has approvedText.
  return script.segments.map((segment) => segment.approvedText ?? segment.draftText);
}
