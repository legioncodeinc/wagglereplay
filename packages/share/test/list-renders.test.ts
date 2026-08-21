import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listRenderOutputs, renderOutputsForVersion } from '../src/list-renders.js';
import { renderPresets, stageProject } from './fixtures.js';

describe('listRenderOutputs / renderOutputsForVersion', () => {
  it('lists real renders and ignores the .work and share subdirectories plus stray files', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9', '9x16']);

    const rendersDir = path.join(projectDir, 'renders');
    mkdirSync(path.join(rendersDir, 'share', 'v1'), { recursive: true });
    writeFileSync(path.join(rendersDir, 'share', 'v1', 'index.html'), '<html></html>');
    writeFileSync(path.join(rendersDir, 'README.txt'), 'not a render');

    const outputs = listRenderOutputs(projectDir);
    const filenames = outputs.map((o) => o.filename).sort();
    expect(filenames).toEqual([
      'walkthrough.v1.default.16x9.mp4',
      'walkthrough.v1.default.9x16.mp4',
    ]);

    for (const output of outputs) {
      expect(output.sizeBytes).toBeGreaterThan(0);
      expect(output.irVersion).toBe(1);
      expect(output.brandKitId).toBe('default');
    }
  });

  it('renderOutputsForVersion filters to one IR version and sorts by filename', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['9x16', '16x9']);

    const outputs = renderOutputsForVersion(projectDir, 1);
    expect(outputs.map((o) => o.presetId)).toEqual(['16x9', '9x16']);
    expect(renderOutputsForVersion(projectDir, 2)).toEqual([]);
  });

  it('returns an empty array for a project with no renders/ directory', () => {
    expect(listRenderOutputs('/definitely/not/a/real/project')).toEqual([]);
  });
});
