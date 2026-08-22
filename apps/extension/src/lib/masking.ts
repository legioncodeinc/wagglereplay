// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Input masking (ADR-008, AC3).
 *
 * A walkthrough project is git-committable by design, so a raw input value
 * captured here would eventually be committed. This module is the single
 * place a keystroke's characters ever pass through, and the only shape
 * that leaves it is `{ placeholder: '[REDACTED]', masked: true }`: never
 * the value itself, its length, a hash, or a partial prefix. `credential` marks fields
 * the recorder believes carry a secret (password inputs, or any input
 * whose name/autocomplete attributes suggest one) so the finalizer and,
 * later, the Studio UI (prd-005) can render a redaction box instead of the
 * real content, per ADR-008's "capture masks credential-marked inputs as
 * placeholder events" clause.
 */

export const FIXED_INPUT_PLACEHOLDER = '[REDACTED]' as const;

export interface MaskedInput {
  readonly placeholder: typeof FIXED_INPUT_PLACEHOLDER;
  readonly masked: true;
}

/** Masks a raw input value. This is the only function allowed to read `value`. */
export function maskInputValue(_value: string): MaskedInput {
  return { placeholder: FIXED_INPUT_PLACEHOLDER, masked: true };
}

const CREDENTIAL_INPUT_TYPES = new Set(['password']);
const CREDENTIAL_AUTOCOMPLETE_HINTS = new Set([
  'current-password',
  'new-password',
  'one-time-code',
]);
const CREDENTIAL_NAME_HINTS = ['password', 'passwd', 'pwd', 'secret', 'token', 'totp', 'otp'];

/**
 * Best-effort classification of whether an input element carries a
 * credential. Used to decide whether a step's frame assets get a
 * redaction box (ADR-008); never affects whether the value gets masked,
 * every input value is always masked regardless of this classification.
 */
export function isCredentialField(el: {
  getAttribute(name: string): string | null;
  tagName?: string;
}): boolean {
  const type = (el.getAttribute('type') ?? '').toLowerCase();
  if (CREDENTIAL_INPUT_TYPES.has(type)) return true;

  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase();
  if (CREDENTIAL_AUTOCOMPLETE_HINTS.has(autocomplete)) return true;

  const name = (el.getAttribute('name') ?? '').toLowerCase();
  const id = (el.getAttribute('id') ?? '').toLowerCase();
  return CREDENTIAL_NAME_HINTS.some((hint) => name.includes(hint) || id.includes(hint));
}
