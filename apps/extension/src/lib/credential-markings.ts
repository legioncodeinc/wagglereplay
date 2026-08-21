import { z } from 'zod';
import type { GeneratedSelector } from './events.js';

export const CREDENTIAL_FIELD_KINDS = ['username', 'secret', 'totp'] as const;
export type CredentialFieldKind = (typeof CREDENTIAL_FIELD_KINDS)[number];

export const CredentialMarkingSchema = z.strictObject({
  selector: z.string().min(1),
  kind: z.enum(CREDENTIAL_FIELD_KINDS),
});
export type CredentialMarking = z.infer<typeof CredentialMarkingSchema>;

const CredentialMarkingsResponseSchema = z.strictObject({
  credentialSetId: z.string().min(1).nullable(),
  markings: z.array(CredentialMarkingSchema),
});

/** Reads selector roles only. The response schema has no env ref or credential value fields. */
export async function fetchCredentialMarkings(
  studioOrigin: string,
  fetchFn: typeof fetch = fetch,
): Promise<CredentialMarking[]> {
  const response = await fetchFn(`${studioOrigin}/api/credential-markings`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`credential markings request failed with HTTP ${response.status}`);
  }
  return CredentialMarkingsResponseSchema.parse(await response.json()).markings;
}

/** Exact selector matching. Generated selector order decides conflicting matches. */
export function explicitCredentialKind(
  selectors: readonly GeneratedSelector[],
  markings: readonly CredentialMarking[],
): CredentialFieldKind | null {
  const bySelector = new Map(markings.map((marking) => [marking.selector, marking.kind]));
  for (const generated of selectors) {
    const candidates = Array.isArray(generated.value) ? generated.value : [generated.value];
    for (const candidate of candidates) {
      const kind = bySelector.get(candidate);
      if (kind !== undefined) return kind;
    }
  }
  return null;
}
