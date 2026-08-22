// SPDX-License-Identifier: AGPL-3.0-or-later
import type { HeatmapDocument, PreDraftDocument } from '@waggle/ingest';
import type { CredentialSet, WalkthroughFlow } from '@waggle/ir';
import type { NarrationScript } from '@waggle/narrate';
import type { StudioSettings } from './schemas/studio-settings.js';

/**
 * The shared, client-safe shape of everything Studio's UI reads. Every
 * field here is either a plain data type or a type re-exported from a
 * workspace package (`@waggle/ir`, `@waggle/ingest`, `@waggle/narrate`) -
 * all `import type`, so nothing runtime from those packages, and nothing
 * from `$lib/server/*`, ever reaches the client bundle through this file.
 */

export interface BrandKitSummary {
  readonly id: string;
  readonly name: string;
  readonly source: 'project' | 'built-in';
}

/** One extracted sample frame at a known offset from the step's action (AC3's scrubber timeline). */
export interface FrameSample {
  readonly fileName: string;
  readonly offsetMs: number;
}

export interface StudioProjectState {
  readonly projectName: string;
  readonly irVersion: number | null;
  readonly flow: WalkthroughFlow | null;
  readonly heatmap: HeatmapDocument | null;
  readonly predraft: PreDraftDocument | null;
  readonly narration: NarrationScript | null;
  readonly settings: StudioSettings;
  readonly brandKits: readonly BrandKitSummary[];
  readonly credentialRefs: readonly CredentialSet[];
  /** Built-in render preset ids plus any this project's `waggle.json` declares (AC6 checklist). */
  readonly presetChoices: readonly string[];
  /** AC3 scrubber samples per step index; empty for a step with no extracted frames yet. */
  readonly frameSamples: Readonly<Record<number, readonly FrameSample[]>>;
}
