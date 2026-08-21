import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256File } from '../src/checksum.js';
import {
  buildRenderManifest,
  ensureRenderManifest,
  RenderManifestError,
  RenderManifestSchema,
  readRenderManifest,
} from '../src/manifest.js';
import { shareManifestPath } from '../src/naming.js';
import { renderPresets, stageProject } from './fixtures.js';

/**
 * prd-008 AC1: the sidecar records IR version, brand kit, preset,
 * native-vs-reframed label, duration, and checksum. These tests run a
 * REAL render through `@waggle/compose`'s real `renderProject` (real
 * ffmpeg encode), so the manifest this package builds is checked against
 * an actual file on disk, not a hand-built fixture standing in for one.
 */
describe('AC1: buildRenderManifest / ensureRenderManifest', () => {
  it('reads compose metadata, computes a real checksum, and matches the schema', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);

    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    expect(existsSync(outputPath)).toBe(true);

    const manifest = await buildRenderManifest(outputPath);
    expect(() => RenderManifestSchema.parse(manifest)).not.toThrow();

    expect(manifest.irVersion).toBe(1);
    expect(manifest.brandKitId).toBe('default');
    expect(manifest.preset.id).toBe('16x9');
    expect(manifest.reframe).toBe('native');
    expect(manifest.durationMs).toBeGreaterThan(0);
    expect(manifest.checksum.algorithm).toBe('sha256');
    expect(manifest.checksum.value).toBe(await sha256File(outputPath));
  });

  it("carries no timestamp field, matching the compositor sidecar's determinism contract", async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');

    const manifest = await buildRenderManifest(outputPath);
    expect(Object.keys(manifest)).not.toContain('generatedAt');
    expect(Object.keys(manifest)).not.toContain('timestamp');
    expect(JSON.stringify(manifest)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('throws a named error when no compositor metadata sidecar exists', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    const { rmSync } = await import('node:fs');
    rmSync(`${outputPath}.render.json`);

    await expect(buildRenderManifest(outputPath)).rejects.toThrow(RenderManifestError);
  });

  it('ensureRenderManifest writes the sidecar once and skips the rewrite when nothing changed', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');

    const first = await ensureRenderManifest(outputPath);
    expect(first.wrote).toBe(true);
    expect(existsSync(shareManifestPath(outputPath))).toBe(true);

    const second = await ensureRenderManifest(outputPath);
    expect(second.wrote).toBe(false);
    expect(second.manifest).toEqual(first.manifest);
  });

  it('ensureRenderManifest rewrites the sidecar when the file on disk no longer matches the recorded checksum', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');

    const first = await ensureRenderManifest(outputPath);
    expect(first.wrote).toBe(true);

    // Simulate a re-render: same filename, different bytes, refreshed compose metadata.
    writeFileSync(outputPath, Buffer.concat([readFileSync(outputPath), Buffer.from('x')]));

    const second = await ensureRenderManifest(outputPath);
    expect(second.wrote).toBe(true);
    expect(second.manifest.checksum.value).not.toBe(first.manifest.checksum.value);
  });

  it('readRenderManifest returns null before a sidecar has been written', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);
    const outputPath = path.join(projectDir, 'renders', 'walkthrough.v1.default.16x9.mp4');
    expect(readRenderManifest(outputPath)).toBeNull();
  });
});
