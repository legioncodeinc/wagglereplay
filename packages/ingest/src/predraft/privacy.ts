// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  createProjectTextScrubber,
  ProjectTextScrubberConfigError,
  type SensitiveTextLiterals,
  type SensitiveTextScrubber,
  type WalkthroughFlow,
} from '@waggle/ir';

export class PreDraftPrivacyConfigError extends Error {
  constructor() {
    super('Project credential references could not be validated for text scrubbing.');
    this.name = 'PreDraftPrivacyConfigError';
  }
}

/**
 * Builds the text-only scrubber invoked for every pre-draft provider request,
 * provider reply, warning, and persisted description. Image bytes are not
 * modified by this text utility.
 *
 * Literal resolution (credential env names plus masked placeholders) lives
 * in @waggle/ir's shared project-literals module since the 2026-08-21 Run 4
 * guardrail pass; this wrapper keeps ingest's public error type.
 */
export function createPreDraftTextScrubber(
  projectDir: string,
  flow: WalkthroughFlow,
  additional: SensitiveTextLiterals = {},
): SensitiveTextScrubber {
  try {
    return createProjectTextScrubber(projectDir, flow, additional);
  } catch (error) {
    if (error instanceof ProjectTextScrubberConfigError) {
      throw new PreDraftPrivacyConfigError();
    }
    throw error;
  }
}
