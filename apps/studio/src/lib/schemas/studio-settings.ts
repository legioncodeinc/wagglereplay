import { z } from 'zod';

/**
 * `studio.json`: Studio's own project settings file (AC6).
 *
 * Not part of the Walkthrough IR (`packages/ir` owns that schema and is
 * locked) and not part of `waggle.json`'s manifest either: the manifest's
 * `presets` / `defaults` shape is explicitly documented as
 * "owned by prd-007" (`packages/ir/src/project/manifest.ts`), and adding
 * brand/voice/credential-binding fields there would mean a second PRD
 * editing a schema it does not own. `studio.json` is a new, additively
 * named sibling project file at the project root, the exact pattern
 * `heatmap.json` and `predraft.json` (both prd-004, `@waggle/ingest`)
 * already use for the same reason. Flagged here for cross-PRD gate review
 * like those two were.
 *
 * Holds only REFERENCES, never values: `credentialSetId` names an entry in
 * `credentials.json` (ADR-008), it never carries `username_env`/
 * `secret_env` contents, let alone a resolved secret.
 *
 * This module is import-safe from client code (no `node:fs`, no server
 * secrets): the actual file I/O lives in `./server/settings-store.ts`,
 * which imports the schema from here rather than redeclaring it, so the
 * shape is defined exactly once.
 */

export const STUDIO_SETTINGS_FILENAME = 'studio.json';
export const STUDIO_SETTINGS_SCHEMA_VERSION = 1;

export const StudioSettingsSchema = z.strictObject({
  schemaVersion: z.literal(STUDIO_SETTINGS_SCHEMA_VERSION),
  /** Brand kit id (`brand/<id>.json` stem), or `null` to use the built-in default kit. */
  brandKitId: z.string().min(1).nullable(),
  /** TTS voice id passed to `@waggle/narrate` at synthesis time, or `null` to use the brand kit's own `voiceId`. */
  voiceId: z.string().min(1).nullable(),
  /** Render preset ids selected in the settings panel's checklist (AC6). */
  presetIds: z.array(z.string().min(1)),
  /** `credentials.json` entry id this project replays with, or `null` if unbound. */
  credentialSetId: z.string().min(1).nullable(),
});

export type StudioSettings = z.infer<typeof StudioSettingsSchema>;

export function defaultStudioSettings(): StudioSettings {
  return {
    schemaVersion: STUDIO_SETTINGS_SCHEMA_VERSION,
    brandKitId: null,
    voiceId: null,
    presetIds: [],
    credentialSetId: null,
  };
}
