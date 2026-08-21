import type { StepClassification } from '@waggle/ir';

/**
 * AC4 prompt construction. ADR-008 applies: this module reads ONLY the
 * fields listed below, and deliberately never accepts a step's masked
 * `value` (a `change` step's value is already a same-length placeholder
 * of a single repeated character with no information content - see
 * ../segment/build-steps.ts's `maskedPlaceholder` - but this module does
 * not even take that field as an input, so there is no code path by which
 * a masked value, or its length, could ever reach a prompt). No env
 * value, credential, or raw captured input character crosses this
 * boundary. test/predraft/prompt.test.ts asserts this directly by
 * poisoning a fixture with a fake secret and proving it is absent from
 * every prompt this module can produce.
 */

export interface PreDraftPromptInput {
  readonly stepIndex: number;
  readonly totalSteps: number;
  /** The IR step type: 'click' | 'change' | 'scroll' | 'navigate' | ... */
  readonly stepType: string;
  readonly classification: StepClassification;
  readonly routeBefore?: string | undefined;
  readonly routeAfter?: string | undefined;
  readonly elementRole?: string | undefined;
  readonly elementName?: string | undefined;
  readonly elementText?: string | undefined;
  readonly domDeltaSummary?: string | undefined;
  /** Whether before/click frame images are attached to this request (see ./adapter-types.ts). */
  readonly hasImages: boolean;
}

export const PREDRAFT_SYSTEM_PROMPT =
  'You are drafting a short, one-sentence caption for one step of a recorded product ' +
  'walkthrough video. The caption will be read aloud as narration and shown as a subtitle, ' +
  'so keep it concrete, present tense, and under 20 words. Reply with ONLY a single JSON ' +
  'object matching this exact shape, no markdown fences, no extra text: ' +
  '{"description": string, "confidence": "low" | "medium" | "high"}.';

function classificationLabel(classification: StepClassification): string {
  switch (classification) {
    case 'navigate':
      return 'navigated to a new page';
    case 'state-change':
      return 'caused an in-page change';
    case 'input':
      return 'typed into a field';
    case 'scroll':
      return 'scrolled the page';
  }
}

/** Builds the user-turn text. Pure: no I/O, no env read, no `Date.now()` - deterministic given the same input (AC5). */
export function buildPreDraftPrompt(input: PreDraftPromptInput): string {
  const lines: string[] = [
    `Step ${String(input.stepIndex + 1)} of ${String(input.totalSteps)} in the walkthrough.`,
    `The user ${classificationLabel(input.classification)} (IR step type: "${input.stepType}").`,
  ];

  if (input.elementRole || input.elementName) {
    const role = input.elementRole ?? 'element';
    const name = input.elementName ? ` named "${input.elementName}"` : '';
    lines.push(`They acted on a ${role}${name}.`);
    if (input.elementText && input.elementText !== input.elementName) {
      lines.push(`Its visible text reads: "${input.elementText}".`);
    }
  }

  if (input.routeBefore && input.routeAfter && input.routeBefore !== input.routeAfter) {
    lines.push(`The page navigated from "${input.routeBefore}" to "${input.routeAfter}".`);
  } else if (input.routeAfter) {
    lines.push(`The page is at "${input.routeAfter}".`);
  }

  if (input.domDeltaSummary) {
    lines.push(`What visibly changed: ${input.domDeltaSummary}.`);
  }

  lines.push(
    input.hasImages
      ? 'Two frames are attached: the page just before this step, and the page at the moment of the action. Use them to describe what is actually visible.'
      : 'No frame images are available for this step; draft the caption from the metadata above alone.',
  );

  return lines.join('\n');
}
