import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { SensitiveTextLiterals, WalkthroughFlow } from '@waggle/ir';
import type { PreDraftImage } from './adapter-types.js';
import { createPreDraftAdapter } from './create-adapter.js';
import { resolvePreDraftConfig } from './env-config.js';
import { buildFailureEntry, buildPlaceholderEntry } from './placeholder.js';
import { createPreDraftTextScrubber, PreDraftPrivacyConfigError } from './privacy.js';
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
  /** Extra flagged literals for the mandatory text scrubber, primarily test canaries. */
  readonly sensitiveText?: SensitiveTextLiterals;
  /**
   * Project-relative PNG refs produced by this ingest run's extractor.
   * No image is readable by pre-draft unless extraction attested it here.
   */
  readonly verifiedImageRefs?: ReadonlySet<string>;
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

function isWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

async function resolveProjectImage(projectDir: string, reference: string): Promise<string | null> {
  if (path.isAbsolute(reference)) return null;

  const projectRoot = path.resolve(projectDir);
  const candidate = path.resolve(projectRoot, reference);
  if (!isWithinDirectory(projectRoot, candidate)) return null;

  try {
    const [realRoot, realCandidate] = await Promise.all([
      realpath(projectRoot),
      realpath(candidate),
    ]);
    return isWithinDirectory(realRoot, realCandidate) ? realCandidate : null;
  } catch {
    // Missing or unreadable frames already degrade to a text-only prompt.
    // Fail closed when canonicalization cannot prove confinement.
    return null;
  }
}

/** Reads only extractor-verified `before`/`click` PNGs. Missing or unverified refs degrade to no images. */
async function loadStepImages(
  projectDir: string,
  step: WalkthroughFlow['steps'][number],
  verifiedImageRefs: ReadonlySet<string>,
): Promise<PreDraftImage[]> {
  const refs = [step.waggle.assets?.before, step.waggle.assets?.click].filter(
    (ref): ref is string => typeof ref === 'string',
  );
  const images: PreDraftImage[] = [];
  for (const ref of refs) {
    if (!verifiedImageRefs.has(ref)) continue;
    try {
      const imagePath = await resolveProjectImage(projectDir, ref);
      if (imagePath === null) continue;
      const bytes = await readFile(imagePath);
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
  let scrubText: (text: string) => string;
  try {
    scrubText = createPreDraftTextScrubber(options.projectDir, options.flow, options.sensitiveText);
  } catch (error) {
    if (!(error instanceof PreDraftPrivacyConfigError)) throw error;
    const reason = error.message;
    warnings.push(reason);
    return {
      document: {
        schemaVersion: PREDRAFT_SCHEMA_VERSION,
        irVersion: options.irVersion,
        steps: options.flow.steps.map((_, index) => buildFailureEntry(index, reason)),
      },
      warnings,
    };
  }

  if (resolved.kind === 'unavailable') {
    const safeReason = scrubText(resolved.reason);
    const safeMissingEnvVar = scrubText(resolved.missingEnvVar);
    warnings.push(`AI pre-draft unavailable: ${safeReason} Set ${safeMissingEnvVar}.`);
    const steps: PreDraftEntry[] = options.flow.steps.map((_, index) =>
      buildPlaceholderEntry(index, safeMissingEnvVar),
    );
    return {
      document: { schemaVersion: PREDRAFT_SCHEMA_VERSION, irVersion: options.irVersion, steps },
      warnings,
    };
  }

  const adapter = createPreDraftAdapter(resolved.config, options.fetchImpl);
  const steps: PreDraftEntry[] = [];
  const verifiedImageRefs = options.verifiedImageRefs ?? new Set<string>();

  for (const [stepIndex, step] of options.flow.steps.entries()) {
    const images = await loadStepImages(options.projectDir, step, verifiedImageRefs);
    const promptInput = promptInputForStep(step, stepIndex, totalSteps, images.length > 0);

    try {
      const reply = await adapter.generate({
        systemPrompt: scrubText(PREDRAFT_SYSTEM_PROMPT),
        userPrompt: scrubText(buildPreDraftPrompt(promptInput)),
        images,
      });
      steps.push({
        stepIndex,
        description: scrubText(reply.description),
        machineDrafted: true,
        confidence: reply.confidence,
        provider: adapter.provider,
      });
    } catch (error) {
      const reason = scrubText(error instanceof Error ? error.message : String(error));
      warnings.push(`Step ${String(stepIndex)}: AI pre-draft failed, using placeholder: ${reason}`);
      steps.push(buildFailureEntry(stepIndex, reason));
    }
  }

  return {
    document: { schemaVersion: PREDRAFT_SCHEMA_VERSION, irVersion: options.irVersion, steps },
    warnings,
  };
}
