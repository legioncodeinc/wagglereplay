// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { credentialsPath } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CredentialsStoreError,
  listCredentialRefs,
  updateCredentialMarking,
} from '../../../src/lib/server/credentials-store.js';

/** AC6, ADR-008: this store must only ever surface reference NAMES, never a resolved secret value. */
describe('credentials-store (AC6, ADR-008 refs only)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function seedDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-creds-'));
    cleanup.push(dir);
    return dir;
  }

  it('returns an empty list when credentials.json does not exist', () => {
    const dir = seedDir();
    expect(listCredentialRefs(dir)).toEqual([]);
  });

  it('lists reference names only, exactly as written by "waggle init"\'s template', () => {
    const dir = seedDir();
    writeFileSync(
      credentialsPath(dir),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'example',
            label: 'Demo login',
            username_env: 'DEMO_USER',
            secret_env: 'DEMO_PASSWORD',
          },
        ],
      }),
      'utf8',
    );
    const refs = listCredentialRefs(dir);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      id: 'example',
      label: 'Demo login',
      username_env: 'DEMO_USER',
      secret_env: 'DEMO_PASSWORD',
      applies_to: { username: [], secret: [], totp: [] },
    });
    // Never a value: the schema has no field that could carry one, and this
    // asserts the parsed object has no unexpected extra keys smuggling one in.
    expect(Object.keys(refs[0] ?? {}).sort()).toEqual(
      ['applies_to', 'id', 'label', 'secret_env', 'username_env'].sort(),
    );
  });

  it("accepts a totp_seed_env reference (ADR-008's full shape)", () => {
    const dir = seedDir();
    writeFileSync(
      credentialsPath(dir),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'mfa-account',
            label: 'MFA test account',
            username_env: 'MFA_USER',
            secret_env: 'MFA_PASSWORD',
            totp_seed_env: 'MFA_TOTP_SEED',
          },
        ],
      }),
      'utf8',
    );
    expect(listCredentialRefs(dir)[0]?.totp_seed_env).toBe('MFA_TOTP_SEED');
  });

  it('rejects malformed JSON', () => {
    const dir = seedDir();
    writeFileSync(credentialsPath(dir), '{not json', 'utf8');
    expect(() => listCredentialRefs(dir)).toThrow(CredentialsStoreError);
  });

  it('persists a selector under exactly one field kind', () => {
    const dir = seedDir();
    writeFileSync(
      credentialsPath(dir),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'example',
            label: 'Demo login',
            username_env: 'DEMO_USER',
            secret_env: 'DEMO_PASSWORD',
            applies_to: { username: [], secret: ['#login'], totp: [] },
          },
        ],
      }),
      'utf8',
    );

    const updated = updateCredentialMarking(dir, 'example', '#login', 'username');
    expect(updated.applies_to).toEqual({ username: ['#login'], secret: [], totp: [] });
    const persisted = JSON.parse(readFileSync(credentialsPath(dir), 'utf8')) as {
      credentials: { applies_to: unknown }[];
    };
    expect(persisted.credentials[0]?.applies_to).toEqual(updated.applies_to);
    expect(JSON.stringify(persisted)).not.toContain('resolved-secret-value');
  });

  it('rejects a credentials file that fails schema validation', () => {
    const dir = seedDir();
    writeFileSync(
      credentialsPath(dir),
      JSON.stringify({ schemaVersion: 1, credentials: [{}] }),
      'utf8',
    );
    expect(() => listCredentialRefs(dir)).toThrow(CredentialsStoreError);
  });
});
