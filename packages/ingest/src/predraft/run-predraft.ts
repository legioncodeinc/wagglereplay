import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { WalkthroughFlow } from '@waggle/ir';
import type { PreDraftImage } from './adapter-types.js';
import { createPreDraftAdapter } from './create-adapter.js';
import { resolvePreDraftConfig } from './env-config.js';
import { buildFailureEntry, buildPlaceholderEntry } from './placeholder.js';
import { buildPreDraftPrompt, PREDRAFT_SYSTEM_PROMPT, type PreDraftPromptInput } from './prompt.js';
import { PREDRAFT_SCHEMA_VERSION, type PreDraftDocument, type PreDraftEntry } from './schema.js';
import type { FetchLike } from './shared-http.js';

export interface RunPreDraftOptions {
  readonly flow: WalkthroughFlow;
  readonly projectDir: string;
  readonly irVersion: number;
  /** Defaults to `process.env`; injectable for tests. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Defaults to real `fetch` inside the provider adapter; injectable for tests. */
  readonly fetchImpl?: FetchLike;
}

export interface RunPreDraftResult {
  readonly document: PreDraftDocument;
  readonly warnings: readonly string[];
}

function promptInputForStep(
  step: WalkthroughFlow['steps'][number],
  stepIndex: number,
  totalSteps: number,
  hasImages: boolean,
): PreDraftPromptInput {
  return {
    stepIndex,
    totalSteps,
    stepType: step.type,
    classification: step.waggle.classification,
    routeBefore: step.waggle.routeBefore,
    routeAfter: step.waggle.routeAfter,
    elementRole: step.waggle.element?.role,
    elementName: step.waggle.element?.name,
    elementText: step.waggle.element?.text,
    domDeltaSummary: step.waggle.domDelta?.summary,
    hasImages,
  };
}

/** Reads a step's `before`/`click` frame PNGs as base64, if they exist. Missing files degrade to no images, never a crash. */
async function loadStepImages(
  projectDir: string,
  step: WalkthroughFlow['steps'][number],
): Promise<PreDraftImage[]> {
  const refs = [step.waggle.assets?.before, step.waggle.assets?.click].filter(
    (ref): ref is string => typeof ref === 'string',
  );
  const images: PreDraftImage[] = [];
  for (const ref of refs) {
    try {
      const bytes = await readFile(path.join(projectDir, ref));
      images.push({ base64: bytes.toString('base64'), mimeType: 'image/png' });
    } catch {
      // Frame extraction (AC2) may not have produced this file (e.g. a
      // step whose settle time equals its click time and the caller
      // skipped that duplicate), or a caller may run pre-drafting before
      // extraction. Either way, degrade to a text-only prompt rather than
      // failing the whole step.
    }
  }
  return images;
}

/**
 * AC4: drafts one description per step. Never throws: an unconfigured
 * provider degrades every step to a placeholder
 * (../predraft/placeholder.ts's `buildPlaceholderEntry`), and a per-step
 * adapter failure (network, or two unparseable replies) degrades just
 * that step (`buildFailureEntry`) while the rest of the run continues.
 */
export async function runPreDraft(options: RunPreDraftOptions): Promise<RunPreDraftResult> {
  const env = options.env ?? process.env;
  const resolved = resolvePreDraftConfig(env);
  const warnings: string[] = [];
  const totalSteps = options.flow.steps.length;

  if (resolved.kind === 'unavailable') {
    warnings.push(`AI pre-draft unavailable: ${resolved.reason} Set ${resolved.missingEnvVar}.`);
    const steps: PreDraftEntry[] = options.flow.steps.map((_, index) =>
      buildPlaceholderEntry(index, resolved.missingEnvVar),
    );
    return {
      document: { schemaVersion: PREDRAFT_SCHEMA_VERSION, irVersion: options.irVersion, steps },
      warnings,
    };
  }

  const adapter = createPreDraftAdapter(resolved.config, options.fetchImpl);
  const steps: PreDraftEntry[] = [];

  for (const [stepIndex, step] of options.flow.steps.entries()) {
    const images = await loadStepImages(options.projectDir, step);
    const promptInput = promptInputForStep(step, stepIndex, totalSteps, images.length > 0);

    try {
      const reply = await adapter.generate({
        systemPrompt: PREDRAFT_SYSTEM_PROMPT,
        userPrompt: buildPreDraftPrompt(promptInput),
        images,
      });
      steps.push({
        stepIndex,
        description: reply.description,
        machineDrafted: true,
        confidence: reply.confidence,
        provider: adapter.provider,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`Step ${String(stepIndex)}: AI pre-draft failed, using placeholder: ${reason}`);
      steps.push(buildFailureEntry(stepIndex, reason));
    }
  }

  return {
    document: { schemaVersion: PREDRAFT_SCHEMA_VERSION, irVersion: options.irVersion, steps },
    warnings,
  };
}
