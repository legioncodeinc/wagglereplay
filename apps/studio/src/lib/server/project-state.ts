// SPDX-License-Identifier: AGPL-3.0-or-later
import { BUILT_IN_PRESETS } from '@waggle/compose';
import type { StudioProjectState } from '$lib/types.js';
import { listBrandKits } from './brand-store.js';
import { listCredentialRefs } from './credentials-store.js';
import { loadCurrentProjectState } from './ir-store.js';
import { readManifest } from './manifest-store.js';
import { ensureNarrationScript } from './narration-store.js';
import { readStudioSettings } from './settings-store.js';
import { buildFrameSampleMap } from './step-frames.js';

/**
 * Assembles the one payload `+page.server.ts`'s `load` returns and the
 * `/api/watch` reload cycle refreshes: everything AC2-AC6 render from,
 * read fresh off disk on every call so a change made by `waggle record`,
 * another Studio tab, or a hand edit is never stale for longer than one
 * file-watcher tick (`./watcher.ts`).
 */
export function loadStudioProjectState(projectDir: string): StudioProjectState {
  const manifest = readManifest(projectDir);
  const current = loadCurrentProjectState(projectDir);
  const narration =
    current.flow === null
      ? null
      : ensureNarrationScript(projectDir, current.flow, current.predraft);

  const presetChoices = Array.from(
    new Set([...Object.keys(BUILT_IN_PRESETS), ...Object.keys(manifest.presets)]),
  );

  const frameSamples =
    current.flow === null || current.irVersion === null
      ? {}
      : buildFrameSampleMap(projectDir, current.irVersion, current.flow);

  return {
    projectName: manifest.name,
    irVersion: current.irVersion,
    flow: current.flow,
    heatmap: current.heatmap,
    predraft: current.predraft,
    narration,
    settings: readStudioSettings(projectDir),
    brandKits: listBrandKits(projectDir),
    credentialRefs: listCredentialRefs(projectDir),
    presetChoices,
    frameSamples,
  };
}
