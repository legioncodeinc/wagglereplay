import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { subdirPath } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import { buildFrameSampleMap } from '../../../src/lib/server/step-frames.js';
import { buildTwoStepFlow } from '../../helpers/flow-fixture.js';

describe('buildFrameSampleMap (AC3 scrubber timeline)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('parses and sorts frame_t sample files, ignoring before/click/settled and unrelated files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-frames-'));
    cleanup.push(dir);

    const stepDir = path.join(subdirPath(dir, 'steps'), 'v1', 'step-000');
    mkdirSync(stepDir, { recursive: true });
    for (const fileName of [
      'frame_t+2000.png',
      'frame_t-1000.png',
      'frame_t+0.png',
      'before.png',
      'click.png',
      'settled.png',
      'notes.txt',
    ]) {
      writeFileSync(path.join(stepDir, fileName), '');
    }

    const flow = buildTwoStepFlow();
    const map = buildFrameSampleMap(dir, 1, flow);

    expect(map[0]).toEqual([
      { fileName: 'frame_t-1000.png', offsetMs: -1000 },
      { fileName: 'frame_t+0.png', offsetMs: 0 },
      { fileName: 'frame_t+2000.png', offsetMs: 2000 },
    ]);
    // step 1 has no frame directory on disk at all yet.
    expect(map[1]).toEqual([]);
  });
});
