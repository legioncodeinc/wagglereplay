import { z } from 'zod';

/**
 * `credentials.json` REFERENCE shapes (AC6, ADR-008). Pure schema, no
 * `node:fs`: the read side lives in `./server/credentials-store.ts` and
 * imports this rather than redeclaring it, so client code can safely
 * import the TYPE without pulling in server-only file I/O.
 *
 * ADR-008: "A walkthrough's credential set stores only references:
 * {label, username_env, secret_env, totp_seed_env}. Values resolve from
 * the environment at replay time... inside packages/replay only." This
 * schema, and every consumer of it, must never carry a resolved value -
 * only the reference names an author configured.
 *
 * Deliberately not `.strict()`: `credentials.json` is owned by prd-010
 * (`waggle creds`, not yet built), and rejecting a forward-compatible
 * field here would make Studio crash on a perfectly valid project file it
 * merely doesn't know about yet.
 */
export const CredentialRefSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  username_env: z.string().min(1).optional(),
  secret_env: z.string().min(1).optional(),
  totp_seed_env: z.string().min(1).optional(),
});

export type CredentialRef = z.infer<typeof CredentialRefSchema>;

export const CredentialsFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  credentials: z.array(CredentialRefSchema),
});

export type CredentialsFile = z.infer<typeof CredentialsFileSchema>;
