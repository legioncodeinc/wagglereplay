import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  type CredentialAppliesTo,
  type CredentialSet,
  type CredentialsFile,
  CredentialsFileSchema,
  credentialsPath,
} from '@waggle/ir';

/**
 * Server-only access to canonical `credentials.json` references and selector
 * markings. The runtime schema comes from `@waggle/ir`, the project-format
 * owner, so Studio cannot accept a looser duplicate shape.
 *
 * No function in this module reads `process.env`. The only credential data it
 * can return or persist is an environment variable name and a selector.
 */

export type CredentialFieldKind = keyof CredentialAppliesTo;

export class CredentialsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsStoreError';
  }
}

export function readCredentialsFile(projectDir: string): CredentialsFile | null {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) return null;

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
  return result.data;
}

/** Lists reference names and selector markings. Resolved values never enter Studio. */
export function listCredentialRefs(projectDir: string): CredentialSet[] {
  return readCredentialsFile(projectDir)?.credentials ?? [];
}

/**
 * Assigns one selector to at most one field kind for the bound credential set.
 * A `null` kind removes the selector from the set. The complete file is
 * validated before an atomic same-directory replace.
 */
export function updateCredentialMarking(
  projectDir: string,
  credentialSetId: string,
  selector: string,
  kind: CredentialFieldKind | null,
): CredentialSet {
  const current = readCredentialsFile(projectDir);
  if (current === null) {
    throw new CredentialsStoreError('credentials.json does not exist for this project.');
  }

  const index = current.credentials.findIndex((entry) => entry.id === credentialSetId);
  const existing = current.credentials[index];
  if (existing === undefined) {
    throw new CredentialsStoreError(`Credential set "${credentialSetId}" does not exist.`);
  }

  const appliesTo: CredentialAppliesTo = {
    username: existing.applies_to.username.filter((entry) => entry !== selector),
    secret: existing.applies_to.secret.filter((entry) => entry !== selector),
    totp: existing.applies_to.totp.filter((entry) => entry !== selector),
  };
  if (kind !== null) appliesTo[kind] = [...appliesTo[kind], selector];

  const updated: CredentialSet = { ...existing, applies_to: appliesTo };
  const credentials = [...current.credentials];
  credentials[index] = updated;
  const validated = CredentialsFileSchema.parse({ ...current, credentials });

  const filePath = credentialsPath(projectDir);
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  );
  writeFileSync(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(temporaryPath, filePath);
  return updated;
}
