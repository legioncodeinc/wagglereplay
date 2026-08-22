// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  FIXED_INPUT_PLACEHOLDER,
  isCredentialField,
  maskInputValue,
} from '../../src/lib/masking.js';

describe('maskInputValue', () => {
  it('never exposes the raw value or its length', () => {
    const masked = maskInputValue('correct horse battery staple');
    expect(masked).toEqual({ placeholder: FIXED_INPUT_PLACEHOLDER, masked: true });
    expect(Object.values(masked)).not.toContain('correct horse battery staple');
  });

  it('masks the empty string too', () => {
    expect(maskInputValue('')).toEqual({ placeholder: FIXED_INPUT_PLACEHOLDER, masked: true });
  });
});

describe('isCredentialField', () => {
  function el(attrs: Record<string, string>): { getAttribute(name: string): string | null } {
    return { getAttribute: (name) => attrs[name] ?? null };
  }

  it('flags password inputs', () => {
    expect(isCredentialField(el({ type: 'password' }))).toBe(true);
  });

  it('flags autocomplete=current-password', () => {
    expect(isCredentialField(el({ type: 'text', autocomplete: 'current-password' }))).toBe(true);
  });

  it('flags a name/id hinting at a secret', () => {
    expect(isCredentialField(el({ type: 'text', name: 'totp_code' }))).toBe(true);
    expect(isCredentialField(el({ type: 'text', id: 'api-token' }))).toBe(true);
  });

  it('does not flag an ordinary username field', () => {
    expect(isCredentialField(el({ type: 'text', name: 'username' }))).toBe(false);
  });
});
