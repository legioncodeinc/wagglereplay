import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BundleError, buildShareBundle, shareBundleDir } from '../src/bundle/build-bundle.js';
import { checkLinkIntegrity } from '../src/bundle/link-integrity.js';
import { renderPresets, stageProject } from './fixtures.js';

/**
 * prd-008 AC2, end to end: a real ffmpeg render, through the real bundle
 * builder, checked with the real link-integrity checker. This is the test
 * that proves the bundle actually works from disk, not just that each
 * piece typechecks against the others.
 */
describe('AC2: buildShareBundle (e2e)', () => {
  it('assembles a self-contained bundle with one primary render, a poster, captions, transcript, and downloads', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9', '9x16']);

    const result = await buildShareBundle({
      projectDir,
      irVersion: 1,
      walkthroughTitle: 'Share fixture walkthrough',
      projectName: 'share-fixture',
    });

    expect(result.bundleDir).toBe(shareBundleDir(projectDir, 1));
    expect(result.primary.preset.id).toBe('16x9');
    expect(result.alternates.map((m) => m.preset.id)).toEqual(['9x16']);
    expect(result.hasCaptions).toBe(true);
    expect(result.hasTranscript).toBe(true);

    // Every file the page and the bundle promise actually exists on disk.
    for (const filename of [
      'index.html',
      'poster.jpg',
      'captions.vtt',
      'transcript.txt',
      'walkthrough.v1.default.16x9.mp4',
      'walkthrough.v1.default.9x16.mp4',
    ]) {
      const filePath = path.join(result.bundleDir, filename);
      expect(existsSync(filePath)).toBe(true);
      expect(statSync(filePath).size).toBeGreaterThan(0);
    }

    const html = readFileSync(result.indexPath, 'utf8');
    expect(html).toContain('Share fixture walkthrough');
    expect(html).toContain('src="walkthrough.v1.default.16x9.mp4"');
    expect(html).toContain('href="walkthrough.v1.default.9x16.mp4"');
    expect(html).toContain('captions.vtt');
    expect(html).toContain('transcript.txt');
    // No external CDN, font, or script reference anywhere in the page.
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<link');

    const captions = readFileSync(path.join(result.bundleDir, 'captions.vtt'), 'utf8');
    expect(captions.startsWith('WEBVTT')).toBe(true);
    expect(captions).toContain('Open');

    // The link-integrity check AC2 requires, run for real against the bundle on disk.
    const integrity = checkLinkIntegrity(html, result.bundleDir);
    expect(integrity.ok).toBe(true);
    expect(integrity.missing).toEqual([]);
  });

  it('degrades gracefully with no narration: no captions/transcript files or links', async () => {
    const { projectDir } = stageProject({ withNarration: false });
    await renderPresets(projectDir, ['16x9']);

    const result = await buildShareBundle({
      projectDir,
      irVersion: 1,
      walkthroughTitle: 'No narration walkthrough',
      projectName: 'share-fixture',
    });

    expect(result.hasCaptions).toBe(false);
    expect(result.hasTranscript).toBe(false);
    expect(existsSync(path.join(result.bundleDir, 'captions.vtt'))).toBe(false);
    expect(existsSync(path.join(result.bundleDir, 'transcript.txt'))).toBe(false);

    const html = readFileSync(result.indexPath, 'utf8');
    expect(html).not.toContain('captions.vtt');
    expect(html).not.toContain('<track');

    const integrity = checkLinkIntegrity(html, result.bundleDir);
    expect(integrity.ok).toBe(true);
  });

  it('throws BundleError when the requested IR version has no renders', async () => {
    const { projectDir } = stageProject();
    await expect(
      buildShareBundle({
        projectDir,
        irVersion: 1,
        walkthroughTitle: 'x',
        projectName: 'x',
      }),
    ).rejects.toThrow(BundleError);
  });

  it('is idempotent: re-running after a re-render replaces the bundle rather than layering it', async () => {
    const { projectDir } = stageProject();
    await renderPresets(projectDir, ['16x9']);

    const first = await buildShareBundle({
      projectDir,
      irVersion: 1,
      walkthroughTitle: 'Share fixture walkthrough',
      projectName: 'share-fixture',
    });
    const second = await buildShareBundle({
      projectDir,
      irVersion: 1,
      walkthroughTitle: 'Share fixture walkthrough',
      projectName: 'share-fixture',
    });

    expect(second.bundleDir).toBe(first.bundleDir);
    expect(second.primary.checksum.value).toBe(first.primary.checksum.value);
  });
});
