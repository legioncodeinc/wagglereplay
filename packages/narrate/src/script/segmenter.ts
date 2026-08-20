import type { WalkthroughFlow, WalkthroughStep } from '@waggle/ir';
import { computeDurationHintMs, TARGET_WORDS_PER_MINUTE } from './pace.js';
import {
  NARRATION_SCRIPT_SCHEMA_VERSION,
  type NarrationScript,
  NarrationScriptSchema,
} from './script-schema.js';

/**
 * AC1's script generator. Drafts one narration segment per IR step from
 * the step's own recorded metadata (classification, element identity, the
 * DOM-delta summary, and route transitions) rather than calling an LLM:
 * this environment has no LLM API access either (same constraint as every
 * TTS provider in this package), and a deterministic drafter is fully
 * testable, which an LLM call is not. The output shape (`NarrationScript`,
 * ./script-schema.ts) is designed so an LLM-backed drafter could replace
 * this function later without changing anything downstream: every
 * consumer only ever reads `approvedText` after a human (or a future LLM
 * step feeding the same `draftText` field) has signed off.
 */

function capitalizeSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  const capitalized = trimmed[0]?.toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function elementLabel(step: WalkthroughStep): string | null {
  const element = step.waggle.element;
  if (element === undefined) {
    return null;
  }
  const name = element.name.trim();
  return name.length > 0 ? name : element.role;
}

/** Drafts the narration text for one step. Exported so callers/tests can inspect drafting in isolation. */
export function draftSegmentText(step: WalkthroughStep, index: number): string {
  const { classification, domDelta, routeAfter } = step.waggle;
  const label = elementLabel(step);

  switch (classification) {
    case 'navigate':
      return routeAfter
        ? capitalizeSentence(`Navigate to ${routeAfter}`)
        : 'Navigate to the next page.';
    case 'input':
      return label ? capitalizeSentence(`Enter a value in "${label}"`) : 'Enter a value.';
    case 'scroll':
      return label
        ? capitalizeSentence(`Scroll to reveal "${label}"`)
        : 'Scroll to reveal more content.';
    case 'state-change':
      if (domDelta !== undefined && domDelta.summary.trim().length > 0) {
        return capitalizeSentence(domDelta.summary);
      }
      return label ? capitalizeSentence(`Click "${label}"`) : `Step ${index + 1}.`;
    default:
      return `Step ${index + 1}.`;
  }
}

/**
 * Drafts a full `NarrationScript` from a Walkthrough IR flow: one segment
 * per step, unapproved, with a duration hint from `computeDurationHintMs`
 * (AC1: "duration hints from settle times"). Every segment's id reuses the
 * step's own `waggle.narrationSegmentId` when the IR already carries one
 * (e.g. round-tripped from a prior Studio session), and falls back to a
 * positional `step-{index}` id otherwise.
 */
export function draftNarrationScript(
  flow: WalkthroughFlow,
  wordsPerMinute: number = TARGET_WORDS_PER_MINUTE,
): NarrationScript {
  const segments = flow.steps.map((step, index) => {
    const draftText = draftSegmentText(step, index);
    const settleMs = step.waggle.settle?.ms ?? 0;
    return {
      narrationSegmentId: step.waggle.narrationSegmentId ?? `step-${index}`,
      stepIndex: index,
      draftText,
      approvedText: null,
      approved: false,
      targetDurationMs: computeDurationHintMs(draftText, settleMs, wordsPerMinute),
    };
  });

  return NarrationScriptSchema.parse({
    schemaVersion: NARRATION_SCRIPT_SCHEMA_VERSION,
    segments,
  });
}
