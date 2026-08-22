// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { CredentialSetSchema } from '@waggle/ir';
import { z } from 'zod';
import {
  CredentialsStoreError,
  listCredentialRefs,
  updateCredentialMarking,
} from '$lib/server/credentials-store.js';
import { getProjectDir } from '$lib/server/project-context.js';
import { readStudioSettings, StudioSettingsError } from '$lib/server/settings-store.js';

const MarkingPatchSchema = z.strictObject({
  selector: z.string().trim().min(1).max(4096),
  kind: z.enum(['username', 'secret', 'totp']).nullable(),
});

function activeMarkings(projectDir: string): {
  credentialSetId: string | null;
  markings: { selector: string; kind: 'username' | 'secret' | 'totp' }[];
} {
  const credentialSetId = readStudioSettings(projectDir).credentialSetId;
  if (credentialSetId === null) return { credentialSetId: null, markings: [] };

  const credentialSet = listCredentialRefs(projectDir).find(
    (entry) => entry.id === credentialSetId,
  );
  if (credentialSet === undefined) {
    throw new CredentialsStoreError(`Bound credential set "${credentialSetId}" does not exist.`);
  }
  return {
    credentialSetId,
    markings: (
      [
        ['username', credentialSet.applies_to.username],
        ['secret', credentialSet.applies_to.secret],
        ['totp', credentialSet.applies_to.totp],
      ] as const
    ).flatMap(([kind, selectors]) => selectors.map((selector) => ({ selector, kind }))),
  };
}

/** Safe capture bootstrap data: selector roles only, never env refs or values. */
export const GET = (() => {
  try {
    return json(activeMarkings(getProjectDir()), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    if (err instanceof CredentialsStoreError || err instanceof StudioSettingsError) {
      error(400, err.message);
    }
    throw err;
  }
}) satisfies RequestHandler;

/** Persists one marking into the bound set's canonical `applies_to` object. */
export const PUT: RequestHandler = async ({ request }) => {
  const parsed = MarkingPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    error(
      400,
      `Invalid credential marking: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }

  const projectDir = getProjectDir();
  try {
    const credentialSetId = readStudioSettings(projectDir).credentialSetId;
    if (credentialSetId === null) error(409, 'Bind a credential set before marking a field.');
    const updated = CredentialSetSchema.parse(
      updateCredentialMarking(projectDir, credentialSetId, parsed.data.selector, parsed.data.kind),
    );
    return json({ credentialSetId, appliesTo: updated.applies_to });
  } catch (err) {
    if (err instanceof CredentialsStoreError || err instanceof StudioSettingsError) {
      error(400, err.message);
    }
    throw err;
  }
};
