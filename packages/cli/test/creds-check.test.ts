// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDefaultManifest, credentialsPath, manifestPath } from '@waggle/ir';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { checkCredentialRefs, loadCredentialsFile } from '../src/commands/creds.js';
import { CliExitError } from '../src/errors.js';
import { ExitCode } from '../src/exit-codes.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-creds-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath(dir), JSON.stringify(createDefaultManifest('t')), 'utf8');
  return dir;
}

function writeCredentials(dir: string, body: unknown): string {
  const file = credentialsPath(dir);
  writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  return file;
}

describe('checkCredentialRefs', () => {
  it('reports which refs resolve, by NAME only', () => {
    const file = {
      schemaVersion: 1,
      credentials: [
        {
          id: 'demo',
          label: 'Demo',
          username_env: 'SET_VAR',
          secret_env: 'UNSET_VAR',
        },
      ],
    };
    const checks = checkCredentialRefs(
      // schema-parsed shape
      { schemaVersion: 1, credentials: file.credentials } as Parameters<
        typeof checkCredentialRefs
      >[0],
      { SET_VAR: 'super-secret-value' },
    );
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({ envName: 'SET_VAR', resolves: true });
    expect(checks[1]).toMatchObject({ envName: 'UNSET_VAR', resolves: false });
    // The check result never carries the value.
    expect(JSON.stringify(checks)).not.toContain('super-secret-value');
  });

  it('treats empty-string env values as unresolved', () => {
    const checks = checkCredentialRefs(
      {
        schemaVersion: 1,
        credentials: [{ id: 'x', label: 'x', username_env: 'EMPTY' }],
      } as Parameters<typeof checkCredentialRefs>[0],
      { EMPTY: '' },
    );
    expect(checks[0]?.resolves).toBe(false);
  });
});

describe('loadCredentialsFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the project has no credentials.json', () => {
    expect(loadCredentialsFile(dir)).toBeNull();
  });

  it('throws CREDS_INVALID for bad JSON', () => {
    writeCredentials(dir, '{not json');
    expect(() => loadCredentialsFile(dir)).toThrow(CliExitError);
    try {
      loadCredentialsFile(dir);
    } catch (error) {
      expect((error as CliExitError).code).toBe(ExitCode.CREDS_INVALID);
    }
  });

  it('throws CREDS_INVALID for a schema violation, naming the path', () => {
    writeCredentials(dir, { schemaVersion: 1, credentials: [{ id: 'x', password: 'v' }] });
    try {
      loadCredentialsFile(dir);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as CliExitError).code).toBe(ExitCode.CREDS_INVALID);
      expect((error as CliExitError).message).toContain('credentials.0');
    }
  });
});

describe('waggle creds check via the CLI', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeProject();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function runCredsCheck(env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;
    const previousEnv = { ...process.env };
    try {
      Object.assign(process.env, env);
      const code = await runCli(['node', 'waggle', 'creds', 'check', '--project', dir]);
      return { code, out: chunks.join('') };
    } finally {
      process.stdout.write = originalWrite;
      process.env = previousEnv;
    }
  }

  it('exits 0 with no credentials.json and says so', async () => {
    const result = await runCredsCheck({});
    expect(result.code).toBe(0);
    expect(result.out).toContain('nothing to check');
  });

  it('exits 0 when every ref resolves, printing names only', async () => {
    writeCredentials(dir, {
      schemaVersion: 1,
      credentials: [{ id: 'demo', label: 'Demo', username_env: 'A', secret_env: 'B' }],
    });
    const result = await runCredsCheck({ A: 'value-a', B: 'value-b' });
    expect(result.code).toBe(0);
    expect(result.out).toContain('A (username_env');
    expect(result.out).not.toContain('value-a');
    expect(result.out).not.toContain('value-b');
  });

  it('exits CREDS_UNRESOLVED naming the missing refs, never values', async () => {
    const resolvedCanary = 'waggle-resolved-secret-canary-94f38d';
    writeCredentials(dir, {
      schemaVersion: 1,
      credentials: [{ id: 'demo', label: 'Demo', username_env: 'PRESENT', secret_env: 'ABSENT' }],
    });
    const result = await runCredsCheck({ PRESENT: resolvedCanary });
    expect(result.code).toBe(ExitCode.CREDS_UNRESOLVED);
    expect(result.out).toContain('MISSING');
    expect(result.out).toContain('ABSENT');
    expect(result.out).not.toContain(resolvedCanary);
  });
});
