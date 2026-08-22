// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import { CredentialsFileSchema } from '../project/credentials.js';
import { credentialsPath } from '../project/layout.js';
import type { WalkthroughFlow } from '../schema/flow.js';
import type { SensitiveTextLiterals, SensitiveTextScrubber } from './scrub.js';
import { createSensitiveTextScrubber } from './scrub.js';

/**
 * Project-file-backed literal resolution for text scrubbing (extracted
 * 2026-08-21, Run 4 guardrail pass, from the byte-identical private copies
 * in packages/ingest/src/predraft/privacy.ts and
 * packages/narrate/src/privacy/project-text.ts, so prd-011's vision path
 * can consume a third caller instead of growing a third copy).
 *
 * ADR-008 boundary note: this module reads NAMES from the project's
 * credentials.json (env-var references and masked placeholders) and never
 * reads any environment VALUE. Value resolution stays in packages/replay's
 * act-time callback, exactly as scrub.ts's header demands for this package.
 */

export class ProjectTextScrubberConfigError extends Error {
  constructor() {
    super('Project credential references could not be validated for text scrubbing.');
    this.name = 'ProjectTextScrubberConfigError';
  }
}

/** Env-var names declared by every credential set in the project's credentials.json. */
export function projectCredentialEnvNames(projectDir: string): string[] {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) return [];

  try {
    const result = CredentialsFileSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf8')));
    if (!result.success) throw new ProjectTextScrubberConfigError();
    return result.data.credentials.flatMap((credentialSet) =>
      [credentialSet.username_env, credentialSet.secret_env, credentialSet.totp_seed_env].filter(
        (envName): envName is string => envName !== undefined,
      ),
    );
  } catch (error) {
    if (error instanceof ProjectTextScrubberConfigError) throw error;
    throw new ProjectTextScrubberConfigError();
  }
}

/** Placeholder values of every masked `change` step in the flow. */
export function flaggedPlaceholders(flow: WalkthroughFlow): string[] {
  return flow.steps.flatMap((step) =>
    step.type === 'change' && step.waggle.masked ? [step.value] : [],
  );
}

/**
 * The common scrubber factory: project credential env names plus masked
 * step placeholders, merged with any caller-supplied literals, behind the
 * shared deterministic literal scrubber.
 */
export function createProjectTextScrubber(
  projectDir: string,
  flow: WalkthroughFlow,
  additional: SensitiveTextLiterals = {},
): SensitiveTextScrubber {
  return createSensitiveTextScrubber({
    envNames: [...projectCredentialEnvNames(projectDir), ...(additional.envNames ?? [])],
    values: additional.values,
    placeholders: [...flaggedPlaceholders(flow), ...(additional.placeholders ?? [])],
    canaries: additional.canaries,
  });
}
