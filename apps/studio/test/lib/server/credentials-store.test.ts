import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { credentialsPath } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CredentialsStoreError,
  listCredentialRefs,
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
        credentials: [{ id: 'example', username_env: 'DEMO_USER', secret_env: 'DEMO_PASSWORD' }],
      }),
      'utf8',
    );
    const refs = listCredentialRefs(dir);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      id: 'example',
      username_env: 'DEMO_USER',
      secret_env: 'DEMO_PASSWORD',
    });
    // Never a value: the schema has no field that could carry one, and this
    // asserts the parsed object has no unexpected extra keys smuggling one in.
    expect(Object.keys(refs[0] ?? {}).sort()).toEqual(['id', 'secret_env', 'username_env']);
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
