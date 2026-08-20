import { z } from 'zod';

/**
 * Schema for waggle.json, the project manifest described in ADR-015 and
 * library/knowledge/private/waggle/walkthrough-ir-and-project-format.md:
 * "waggle.json: project manifest: name, current IR version, presets,
 * defaults."
 *
 * The Walkthrough IR itself (walkthrough.v{n}.json, steps/, narration
 * timing, etc.) is prd-002's schema; this file only validates the manifest
 * that points at it. `currentIrVersion` is `null` until the first IR
 * version exists (a freshly-`init`ed project has no recording yet).
 */

export const WAGGLE_MANIFEST_SCHEMA_VERSION = 1;

export const WaggleManifestSchema = z
  .object({
    schemaVersion: z.literal(WAGGLE_MANIFEST_SCHEMA_VERSION),
    name: z.string().min(1, 'name must not be empty'),
    createdAt: z.string().datetime({ message: 'createdAt must be an ISO 8601 timestamp' }),
    currentIrVersion: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        'The IR version number this manifest currently points at, or null if no walkthrough has been recorded yet.',
      ),
    presets: z
      .record(z.string(), z.unknown())
      .describe('Named render presets (aspect ratio, brand kit, etc.). Shape is owned by prd-007.'),
    defaults: z
      .object({
        preset: z.string().optional(),
      })
      .describe('Default choices applied when a command is run without explicit flags.'),
  })
  .strict();

export type WaggleManifest = z.infer<typeof WaggleManifestSchema>;

export function createDefaultManifest(name: string): WaggleManifest {
  return WaggleManifestSchema.parse({
    schemaVersion: WAGGLE_MANIFEST_SCHEMA_VERSION,
    name,
    createdAt: new Date().toISOString(),
    currentIrVersion: null,
    presets: {},
    defaults: {},
  });
}
