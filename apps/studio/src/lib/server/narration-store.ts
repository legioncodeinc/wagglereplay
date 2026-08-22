// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import type { PreDraftDocument } from '@waggle/ingest';
import { subdirPath, type WalkthroughFlow } from '@waggle/ir';
import {
  draftNarrationScript,
  type NarrationScript,
  type NarrationSegmentDraft,
  narrationScriptExists,
  readNarrationScript,
  writeNarrationScript,
} from '@waggle/narrate';

/**
 * AC4: the description editor's storage. Edits land in
 * `narration/script.json`, the exact file `@waggle/narrate`'s own
 * `runNarration` already reads and refuses to synthesize past until every
 * segment is approved (see `packages/narrate/src/narrate/run-narration.ts`
 * and its `NarrationDraftPendingApprovalError`, which literally tells the
 * author to "edit approvedText, set approved: true... via Studio,
 * prd-005"). Studio does not invent a second, competing description store.
 *
 * "Machine-drafted" (the PRD-005 AC4 language) is `approved === false`
 * (equivalently `approvedText === null`): the segment shows only
 * `draftText`, nothing a human has signed off on. The flag "clears on
 * human edit" by this module's `applyHumanEdit` setting `approvedText` and
 * `approved: true` in the same write - there is no separate boolean to
 * forget to flip.
 *
 * The initial draft text a fresh segment shows is upgraded from
 * `predraft.json`'s per-step AI description (prd-004 AC4, vision-model
 * generated from the step's own frames) when one exists, rather than
 * `@waggle/narrate`'s own deterministic DOM-delta text, because a
 * description written by looking at the actual screenshot is the better
 * starting point for a human editor. `targetDurationMs` still comes from
 * `draftNarrationScript`'s pacing model: only the visible text is
 * upgraded, not the timing hint that model computes from settle times.
 */

export function narrationScriptPath(projectDir: string): string {
  return path.join(subdirPath(projectDir, 'narration'), 'script.json');
}

function predraftDescriptionByStep(predraft: PreDraftDocument | null): Map<number, string> {
  const byStep = new Map<number, string>();
  if (predraft === null) return byStep;
  for (const entry of predraft.steps) {
    byStep.set(entry.stepIndex, entry.description);
  }
  return byStep;
}

function withPredraftText(
  segments: readonly NarrationSegmentDraft[],
  predraftByStep: Map<number, string>,
): NarrationSegmentDraft[] {
  return segments.map((segment) => {
    const predraftText = predraftByStep.get(segment.stepIndex);
    if (predraftText === undefined || segment.approved) {
      return segment;
    }
    return { ...segment, draftText: predraftText };
  });
}

/**
 * Merges a freshly-drafted script (the current IR's shape) against one
 * already on disk: an existing segment's approval survives by
 * `narrationSegmentId`; a step the IR now has that the saved script does
 * not (a re-record added steps) arrives as a new, unapproved segment. The
 * same reconciliation `runNarration` performs, kept local here rather than
 * imported because it is not part of `@waggle/narrate`'s public API
 * (intentionally: only that package decides when synthesis is safe to
 * run, this module only decides what text an author sees to edit).
 */
function mergeScripts(existing: NarrationScript, fresh: NarrationScript): NarrationScript {
  const existingById = new Map(
    existing.segments.map((segment) => [segment.narrationSegmentId, segment]),
  );
  const segments = fresh.segments.map(
    (freshSegment) => existingById.get(freshSegment.narrationSegmentId) ?? freshSegment,
  );
  return { schemaVersion: existing.schemaVersion, segments };
}

/**
 * Ensures `narration/script.json` reflects the current IR's steps and
 * returns it: drafts it if missing, reconciles it if the step set changed
 * since it was last written, or returns it unchanged otherwise. Never
 * downgrades an already-approved segment's text.
 */
export function ensureNarrationScript(
  projectDir: string,
  flow: WalkthroughFlow,
  predraft: PreDraftDocument | null,
): NarrationScript {
  const scriptPath = narrationScriptPath(projectDir);
  const predraftByStep = predraftDescriptionByStep(predraft);
  const freshDraft = draftNarrationScript(flow);
  const upgraded: NarrationScript = {
    schemaVersion: freshDraft.schemaVersion,
    segments: withPredraftText(freshDraft.segments, predraftByStep),
  };

  if (!narrationScriptExists(scriptPath)) {
    writeNarrationScript(scriptPath, upgraded);
    return upgraded;
  }

  const existing = readNarrationScript(scriptPath);
  if (
    existing.segments.length === upgraded.segments.length &&
    existing.segments.every(
      (segment, index) =>
        segment.narrationSegmentId === upgraded.segments[index]?.narrationSegmentId,
    )
  ) {
    return existing;
  }

  const merged = mergeScripts(existing, upgraded);
  writeNarrationScript(scriptPath, merged);
  return merged;
}

export class DescriptionNotFoundError extends Error {
  constructor(stepIndex: number) {
    super(`No narration segment for step ${String(stepIndex)}.`);
    this.name = 'DescriptionNotFoundError';
  }
}

/**
 * AC4's write path: an author's edited text lands as `approvedText`, and
 * `approved` flips to `true` in the same write - "the machine-drafted flag
 * clears on human edit."
 */
export function applyHumanEdit(
  projectDir: string,
  stepIndex: number,
  text: string,
): NarrationSegmentDraft {
  const scriptPath = narrationScriptPath(projectDir);
  const script = readNarrationScript(scriptPath);
  const index = script.segments.findIndex((segment) => segment.stepIndex === stepIndex);
  if (index === -1) {
    throw new DescriptionNotFoundError(stepIndex);
  }

  const trimmed = text.trim();
  const existingSegment = script.segments[index];
  if (existingSegment === undefined) {
    throw new DescriptionNotFoundError(stepIndex);
  }
  const updatedSegment: NarrationSegmentDraft = {
    ...existingSegment,
    approvedText: trimmed.length > 0 ? trimmed : existingSegment.draftText,
    approved: true,
  };

  const segments = [...script.segments];
  segments[index] = updatedSegment;
  writeNarrationScript(scriptPath, { schemaVersion: script.schemaVersion, segments });
  return updatedSegment;
}
