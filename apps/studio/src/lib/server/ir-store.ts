// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import {
  type HeatmapDocument,
  HeatmapDocumentSchema,
  heatmapPath,
  type PreDraftDocument,
  PreDraftDocumentSchema,
  predraftPath,
} from '@waggle/ingest';
import { latestIrVersion, readCurrentIr, readIrVersion, type WalkthroughFlow } from '@waggle/ir';

/**
 * Read access to the project state PRD-004's ingest produces and PRD-005
 * (this app) renders: the current Walkthrough IR (AC2), the click heatmap
 * (AC5), and the AI pre-draft step descriptions (AC4's seed text).
 *
 * Everything here is a pure read: mutation of the IR itself is out of
 * scope for Studio (IR versions are immutable, ADR-015; only ingest and
 * replay ever write a new one). Studio only ever writes its OWN
 * additively-named files (`narration/script.json` via `@waggle/narrate`,
 * `studio.json` via ./settings-store.ts).
 */

export interface CurrentProjectState {
  readonly irVersion: number | null;
  readonly flow: WalkthroughFlow | null;
  readonly heatmap: HeatmapDocument | null;
  readonly predraft: PreDraftDocument | null;
}

/** Reads the manifest-pointed IR version, or a specific one when `version` is given (AC7 history browsing). */
export function loadCurrentProjectState(projectDir: string, version?: number): CurrentProjectState {
  const current =
    version === undefined ? readCurrentIr(projectDir) : loadSpecificVersion(projectDir, version);

  if (current === null) {
    return { irVersion: null, flow: null, heatmap: null, predraft: null };
  }

  return {
    irVersion: current.version,
    flow: current.flow,
    heatmap: readHeatmap(projectDir),
    predraft: readPredraft(projectDir),
  };
}

function loadSpecificVersion(
  projectDir: string,
  version: number,
): { readonly version: number; readonly flow: WalkthroughFlow } | null {
  const latest = latestIrVersion(projectDir);
  if (latest === null || version < 1 || version > latest) {
    return null;
  }
  return { version, flow: readIrVersion(projectDir, version) };
}

function readHeatmap(projectDir: string): HeatmapDocument | null {
  const filePath = heatmapPath(projectDir);
  if (!existsSync(filePath)) return null;
  return HeatmapDocumentSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
}

function readPredraft(projectDir: string): PreDraftDocument | null {
  const filePath = predraftPath(projectDir);
  if (!existsSync(filePath)) return null;
  return PreDraftDocumentSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
}
