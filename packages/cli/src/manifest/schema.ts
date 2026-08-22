// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Schema for waggle.json, the project manifest described in ADR-015.
 *
 * The definition moved to `@waggle/ir` in prd-002. The IR version writer
 * writes `walkthrough.v(n+1).json` and repoints `currentIrVersion` in the
 * same operation, so splitting the manifest shape away from the IR package
 * would have created two definitions of one contract that could drift.
 * This module stays as the CLI's import site.
 *
 * `currentIrVersion` is `null` until the first IR version exists (a
 * freshly-`init`ed project has no recording yet).
 */

export type { WaggleManifest } from '@waggle/ir';
export {
  createDefaultManifest,
  WAGGLE_MANIFEST_SCHEMA_VERSION,
  WaggleManifestSchema,
} from '@waggle/ir';
