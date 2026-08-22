// SPDX-License-Identifier: AGPL-3.0-or-later
import { createSensitiveTextScrubber, type SensitiveTextScrubber } from '@waggle/ir';

/**
 * Builds the replay-side scrubber only after an env value has been resolved
 * inside the act-time callback. The returned function must not be persisted.
 */
export function createActTimeCredentialScrubber(
  envName: string,
  resolvedValue: string,
): SensitiveTextScrubber {
  return createSensitiveTextScrubber({ envNames: [envName], values: [resolvedValue] });
}

/** Converts an unknown thrown value into text and removes act-time credentials. */
export function scrubActTimeCredentialError(
  error: unknown,
  envName: string,
  resolvedValue: string,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return createActTimeCredentialScrubber(envName, resolvedValue)(message);
}
