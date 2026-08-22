// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  createProjectTextScrubber,
  ProjectTextScrubberConfigError,
  type SensitiveTextLiterals,
  type SensitiveTextScrubber,
  type WalkthroughFlow,
} from '@waggle/ir';

export class NarrationPrivacyConfigError extends Error {
  constructor() {
    super('Project credential references could not be validated for narration text scrubbing.');
    this.name = 'NarrationPrivacyConfigError';
  }
}

/**
 * Mandatory text scrubber for script, TTS request, transcript, words, and
 * caption boundaries. It does not modify audio or image bytes.
 *
 * Literal resolution (credential env names plus masked placeholders) lives
 * in @waggle/ir's shared project-literals module since the 2026-08-21 Run 4
 * guardrail pass; this wrapper keeps narrate's public error type.
 */
export function createNarrationTextScrubber(
  projectDir: string,
  flow: WalkthroughFlow,
  additional: SensitiveTextLiterals = {},
): SensitiveTextScrubber {
  try {
    return createProjectTextScrubber(projectDir, flow, additional);
  } catch (error) {
    if (error instanceof ProjectTextScrubberConfigError) {
      throw new NarrationPrivacyConfigError();
    }
    throw error;
  }
}
