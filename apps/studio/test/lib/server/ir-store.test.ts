// SPDX-License-Identifier: AGPL-3.0-or-later
import { rmSync } from 'node:fs';
import { writeHeatmap, writePreDraft } from '@waggle/ingest';
import { writeNextIrVersion } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCurrentProjectState } from '../../../src/lib/server/ir-store.js';
import { seedProjectDir } from '../../helpers/fixtures.js';
import { buildTwoStepFlow } from '../../helpers/flow-fixture.js';

describe('ir-store (AC2/AC5 reads)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('returns all nulls for a project with no recorded IR yet', () => {
    const dir = seedProjectDir();
    cleanup.push(dir);
    expect(loadCurrentProjectState(dir)).toEqual({
      irVersion: null,
      flow: null,
      heatmap: null,
      predraft: null,
    });
  });

  it('reads back the current IR, heatmap, and predraft once written', () => {
    const dir = seedProjectDir();
    cleanup.push(dir);

    const flow = buildTwoStepFlow();
    const writeResult = writeNextIrVersion(dir, flow);
    writeHeatmap(dir, {
      schemaVersion: 1,
      irVersion: writeResult.version,
      routes: [
        { route: 'https://example.test/login', points: [{ nx: 0.5, ny: 0.5, stepIndex: 0 }] },
      ],
    });
    writePreDraft(dir, {
      schemaVersion: 1,
      irVersion: writeResult.version,
      steps: [
        {
          stepIndex: 0,
          description: 'A description',
          machineDrafted: true,
          confidence: 'high',
          provider: 'test',
        },
      ],
    });

    const state = loadCurrentProjectState(dir);
    expect(state.irVersion).toBe(1);
    expect(state.flow?.steps).toHaveLength(2);
    expect(state.heatmap?.routes[0]?.route).toBe('https://example.test/login');
    expect(state.predraft?.steps[0]?.description).toBe('A description');
  });
});
