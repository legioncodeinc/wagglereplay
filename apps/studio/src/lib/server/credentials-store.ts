import { existsSync, readFileSync } from 'node:fs';
import { credentialsPath } from '@waggle/ir';
import { type CredentialRef, CredentialsFileSchema } from '$lib/schemas/credential-ref.js';

/**
 * Read-only access to `credentials.json` (AC6, ADR-008). Studio is not
 * `packages/replay`: it must never resolve an env var's value, only ever
 * display the reference names an author picked at
 * `packages/cli/src/commands/init.ts`'s template time (`id`,
 * `username_env`, `secret_env`) or added by hand.
 */

export class CredentialsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsStoreError';
  }
}

/**
 * Lists the credential set REFERENCES available to bind a project to.
 * Never reads `process.env`, never returns anything that could be a
 * secret value: only the ids and the env-var NAMES the author configured.
 */
export function listCredentialRefs(projectDir: string): CredentialRef[] {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new CredentialsStoreError(`"${filePath}" is not valid JSON: ${(error as Error).message}`);
  }

  const result = CredentialsFileSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new CredentialsStoreError(`"${filePath}" failed credentials validation:\n${detail}`);
  }
  return result.data.credentials;
}
