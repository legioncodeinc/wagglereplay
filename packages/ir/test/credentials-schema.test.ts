// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  CredentialSetSchema,
  CredentialsFileSchema,
  exampleCredentialSet,
} from '../src/project/credentials.js';

describe('CredentialSetSchema', () => {
  it('accepts the ADR-008 reference shape with applies_to selectors', () => {
    const parsed = CredentialSetSchema.parse({
      id: 'demo',
      label: 'Demo login',
      username_env: 'DEMO_USER',
      secret_env: 'DEMO_PASSWORD',
      totp_seed_env: 'DEMO_TOTP_SEED',
      applies_to: {
        username: ['[data-testid="input-username"]'],
        secret: ['[data-testid="input-password"]'],
        totp: ['[data-testid="input-code"]'],
      },
    });
    expect(parsed.applies_to.username).toEqual(['[data-testid="input-username"]']);
  });

  it('rejects value-looking env refs', () => {
    const result = CredentialSetSchema.safeParse({
      id: 'x',
      label: 'x',
      username_env: 'not an env name',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys so a stray value field fails loudly', () => {
    const result = CredentialSetSchema.safeParse({
      id: 'x',
      label: 'x',
      password: 'hunter2',
    });
    expect(result.success).toBe(false);
  });

  it('defaults applies_to to empty selector lists', () => {
    const parsed = CredentialSetSchema.parse({ id: 'x', label: 'x', username_env: 'DEMO_USER' });
    expect(parsed.applies_to).toEqual({ username: [], secret: [], totp: [] });
  });

  it('requires at least one environment reference', () => {
    expect(CredentialSetSchema.safeParse({ id: 'x', label: 'x' }).success).toBe(false);
  });

  it('rejects blank and ambiguous applies_to selectors', () => {
    const blank = CredentialSetSchema.safeParse({
      id: 'x',
      label: 'x',
      username_env: 'DEMO_USER',
      applies_to: { username: ['   '] },
    });
    expect(blank.success).toBe(false);

    const ambiguous = CredentialSetSchema.safeParse({
      id: 'x',
      label: 'x',
      username_env: 'DEMO_USER',
      secret_env: 'DEMO_SECRET',
      applies_to: { username: ['#login'], secret: ['#login'] },
    });
    expect(ambiguous.success).toBe(false);
  });

  it('requires a matching env ref for every populated selector category', () => {
    const result = CredentialSetSchema.safeParse({
      id: 'x',
      label: 'x',
      username_env: 'DEMO_USER',
      applies_to: { secret: ['#password'] },
    });
    expect(result.success).toBe(false);
  });
});

describe('CredentialsFileSchema', () => {
  it('round-trips the init template shape (label and applies_to included)', () => {
    const template = {
      schemaVersion: 1,
      credentials: [exampleCredentialSet()],
    };
    expect(CredentialsFileSchema.parse(template).credentials[0]?.label).toBe('Example demo login');
  });

  it('rejects a wrong schemaVersion', () => {
    const result = CredentialsFileSchema.safeParse({ schemaVersion: 2, credentials: [] });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate credential set ids', () => {
    const result = CredentialsFileSchema.safeParse({
      schemaVersion: 1,
      credentials: [
        { id: 'demo', label: 'First', username_env: 'FIRST_USER' },
        { id: 'demo', label: 'Second', secret_env: 'SECOND_SECRET' },
      ],
    });
    expect(result.success).toBe(false);
  });
});
