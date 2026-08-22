// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PreDraftEntry } from './schema.js';

/**
 * AC4's graceful-degradation path: when no provider is configured (the
 * ONLY reachable path in this environment - there is no LLM API key, see
 * ../../../../library/requirements/backlog/prd-004-ingest-pipeline), every
 * step gets a clearly-marked placeholder instead of a real draft. Ingest
 * never crashes for a missing key; it produces a valid, honestly-labeled
 * `predraft.json` and moves on.
 */
export function buildPlaceholderEntry(stepIndex: number, missingEnvVar: string): PreDraftEntry {
  return {
    stepIndex,
    description: `[Machine draft unavailable: set ${missingEnvVar} to enable AI pre-drafting for this step.]`,
    machineDrafted: true,
    confidence: null,
    provider: null,
  };
}

/**
 * The other placeholder path: a provider WAS configured, but the call for
 * this specific step failed (network error after retries, or two
 * consecutive unparseable replies). Ingest still never crashes; it
 * degrades this one step to a placeholder and keeps going, recording why
 * in the run's warnings.
 */
export function buildFailureEntry(stepIndex: number, reason: string): PreDraftEntry {
  return {
    stepIndex,
    description: `[Machine draft failed for this step: ${reason}]`,
    machineDrafted: true,
    confidence: null,
    provider: null,
  };
}
