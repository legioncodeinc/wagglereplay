// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

/**
 * The canonical `credentials.json` schema (prd-010 AC1, ADR-008).
 *
 * ADR-008: "A walkthrough's credential set stores only references:
 * {label, username_env, secret_env, totp_seed_env}. Values resolve from
 * the environment at replay time... inside packages/replay only."
 *
 * This file lives in `packages/ir` because `credentials.json` is an
 * ADR-015 project file and this package is the workspace's lowest layer:
 * the CLI (`waggle creds check`), Studio (the marking UI, prd-010 AC4),
 * and `packages/replay` (fill-time resolution, AC2) all consume one
 * definition instead of three drifting copies. Studio's looser reading
 * schema (apps/studio/src/lib/schemas/credential-ref.ts) deliberately
 * deferred to prd-010; this module is that owner.
 *
 * The schema is REFERENCE-ONLY by construction: every field is either an
 * id, a human label, or the NAME of an environment variable. There is no
 * field a secret value could legally occupy, and the canary battery
 * (prd-010 AC2) enforces that no value ever reaches a project file.
 */

/** Bumped when a breaking change lands in the credentials file shape. */
export const CREDENTIALS_SCHEMA_VERSION = 1;

/**
 * Which fields a credential set applies to, as CSS selector lists. The
 * studio marking UI (prd-010 AC4) writes these; replay fill (AC2) reads
 * them to decide which `change` steps resolve which env ref. Splitting
 * them by kind keeps fill deterministic without DOM sniffing: the author
 * has already said which field is the username and which is the secret.
 */
export const CredentialAppliesToSchema = z.strictObject({
  /** Selectors for the fields this set fills with `username_env`'s value. */
  username: z.array(z.string().trim().min(1, 'applies_to selector must not be empty')).default([]),
  /** Selectors for the fields this set fills with `secret_env`'s value. */
  secret: z.array(z.string().trim().min(1, 'applies_to selector must not be empty')).default([]),
  /** Selectors for the fields this set fills with a TOTP code (AC3). */
  totp: z.array(z.string().trim().min(1, 'applies_to selector must not be empty')).default([]),
});

export type CredentialAppliesTo = z.infer<typeof CredentialAppliesToSchema>;

const ENV_REF_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/**
 * An environment variable NAME. Constrained to the traditional upper
 * snake case so a typo'd literal value (lowercase, spaces, an accidental
 * `=`) is rejected at validation time rather than silently failing to
 * resolve on every machine.
 */
const EnvRefNameSchema = z
  .string()
  .regex(
    ENV_REF_PATTERN,
    'env refs must be environment variable names (upper snake case, e.g. DEMO_USER), never values',
  );

const CREDENTIAL_FIELDS = ['username', 'secret', 'totp'] as const;

export const CredentialSetSchema = z
  .strictObject({
    /** Unique within the file; what studio settings and reports refer to. */
    id: z.string().trim().min(1, 'credential set id must not be empty'),
    /** Human label shown in `waggle creds` output and studio. */
    label: z.string().trim().min(1, 'label must not be empty'),
    username_env: EnvRefNameSchema.optional(),
    secret_env: EnvRefNameSchema.optional(),
    totp_seed_env: EnvRefNameSchema.optional(),
    applies_to: CredentialAppliesToSchema.default({ username: [], secret: [], totp: [] }),
  })
  .superRefine((credentialSet, ctx) => {
    if (
      credentialSet.username_env === undefined &&
      credentialSet.secret_env === undefined &&
      credentialSet.totp_seed_env === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'credential set must declare at least one environment reference',
        path: ['username_env'],
      });
    }

    const envRefFor = {
      username: credentialSet.username_env,
      secret: credentialSet.secret_env,
      totp: credentialSet.totp_seed_env,
    } as const;
    const selectorOwner = new Map<string, (typeof CREDENTIAL_FIELDS)[number]>();

    for (const field of CREDENTIAL_FIELDS) {
      const selectors = credentialSet.applies_to[field];
      if (selectors.length > 0 && envRefFor[field] === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `${field} selectors require the matching environment reference`,
          path: ['applies_to', field],
        });
      }

      for (const [selectorIndex, selector] of selectors.entries()) {
        const priorOwner = selectorOwner.get(selector);
        if (priorOwner !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message:
              priorOwner === field
                ? `selector is duplicated in applies_to.${field}`
                : `selector is ambiguous between applies_to.${priorOwner} and applies_to.${field}`,
            path: ['applies_to', field, selectorIndex],
          });
          continue;
        }
        selectorOwner.set(selector, field);
      }
    }
  });

export type CredentialSet = z.infer<typeof CredentialSetSchema>;

export const CredentialsFileSchema = z
  .strictObject({
    schemaVersion: z.literal(CREDENTIALS_SCHEMA_VERSION),
    credentials: z.array(CredentialSetSchema),
  })
  .superRefine((file, ctx) => {
    const seenIds = new Set<string>();
    for (const [index, credentialSet] of file.credentials.entries()) {
      if (seenIds.has(credentialSet.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `credential set id "${credentialSet.id}" must be unique`,
          path: ['credentials', index, 'id'],
        });
      }
      seenIds.add(credentialSet.id);
    }
  });

export type CredentialsFile = z.infer<typeof CredentialsFileSchema>;

/**
 * Builds a validated example set, used by `waggle init`'s template and by
 * tests. Reference-only by construction; there is no value parameter to
 * misuse.
 */
export function exampleCredentialSet(): CredentialSet {
  return CredentialSetSchema.parse({
    id: 'example',
    label: 'Example demo login',
    username_env: 'DEMO_USER',
    secret_env: 'DEMO_PASSWORD',
    applies_to: { username: [], secret: [], totp: [] },
  });
}
