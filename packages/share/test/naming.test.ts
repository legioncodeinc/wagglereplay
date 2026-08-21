import { describe, expect, it } from 'vitest';
import { composeMetadataPath, parseRenderFilename, shareManifestPath } from '../src/naming.js';

describe('AC1: render output naming scheme', () => {
  it('parses a well-formed render filename', () => {
    expect(parseRenderFilename('walkthrough.v3.default.16x9.mp4')).toEqual({
      filename: 'walkthrough.v3.default.16x9.mp4',
      irVersion: 3,
      brandKitId: 'default',
      presetId: '16x9',
    });
  });

  it('parses brand kit and preset ids with hyphens and underscores', () => {
    expect(parseRenderFilename('walkthrough.v12.acme-corp.9x16_tall.mp4')).toEqual({
      filename: 'walkthrough.v12.acme-corp.9x16_tall.mp4',
      irVersion: 12,
      brandKitId: 'acme-corp',
      presetId: '9x16_tall',
    });
  });

  it('rejects a leading-zero version, matching the immutable IR filename rule', () => {
    expect(parseRenderFilename('walkthrough.v01.default.16x9.mp4')).toBeNull();
  });

  it('rejects sidecar and unrelated filenames', () => {
    expect(parseRenderFilename('walkthrough.v1.default.16x9.mp4.render.json')).toBeNull();
    expect(parseRenderFilename('walkthrough.v1.default.16x9.mp4.manifest.json')).toBeNull();
    expect(parseRenderFilename('notes.txt')).toBeNull();
    expect(parseRenderFilename('walkthrough.v1.default.mp4')).toBeNull();
  });

  it('derives sidecar paths deterministically from the output path', () => {
    const output = '/project/renders/walkthrough.v1.default.16x9.mp4';
    expect(composeMetadataPath(output)).toBe(
      '/project/renders/walkthrough.v1.default.16x9.mp4.render.json',
    );
    expect(shareManifestPath(output)).toBe(
      '/project/renders/walkthrough.v1.default.16x9.mp4.manifest.json',
    );
  });
});
