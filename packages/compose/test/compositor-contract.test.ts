import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import {
  assertCompositorInputs,
  type CompositorCapabilities,
  CompositorInputError,
  type CompositorInputs,
  SOURCE_VIDEO_KINDS,
} from '../src/compositor.js';
import { FFMPEG_CAPABILITIES, FfmpegCompositor } from '../src/ffmpeg/backend.js';
import { resolvePreset } from '../src/presets.js';
import { absoluteTestPath, makeFlow } from './fixtures.js';

/**
 * prd-007 AC1: the compositor interface and its declared capabilities.
 *
 * These tests treat the interface as a CONTRACT rather than as an
 * implementation detail, because two future PRDs implement against it:
 * prd-014 (Remotion) writes a second `Compositor`, and prd-017 (avatars)
 * fills the picture-in-picture slot. A change that breaks one of these
 * assertions is a change to somebody else's build plan.
 */

// Resolved through the production entry point rather than by indexing the
// preset table: `resolvePreset` returns a non-optional preset and throws a
// named `PresetError` for an unknown id, so the test exercises the same
// lookup a caller does instead of asserting one exists.
const PRESET = resolvePreset('16x9').preset;

// Composed from the platform's own filesystem root, never a `C:/` literal:
// these paths are never touched on disk here, but a hardcoded drive letter
// is not absolute on POSIX and would become a real failure the moment an
// assertion started resolving one. See `absoluteTestPath` in ./fixtures.ts.
const NOWHERE = absoluteTestPath('nowhere');

function baseInputs(overrides: Partial<CompositorInputs> = {}): CompositorInputs {
  return {
    source: {
      kind: 'original-recording',
      path: path.join(NOWHERE, 'recording.mp4'),
      width: 1280,
      height: 720,
      durationMs: 4000,
      hasAudio: true,
    },
    flow: makeFlow(),
    narration: null,
    brandKit: DEFAULT_BRAND_KIT,
    assetBaseDir: NOWHERE,
    preset: PRESET,
    output: { path: path.join(NOWHERE, 'out.mp4'), workDir: path.join(NOWHERE, 'work') },
    pictureInPicture: null,
    ...overrides,
  };
}

describe('AC1: the compositor contract', () => {
  it('declares the seam prd-009 swaps', () => {
    // The whole prd-009 change is choosing the other member of this union.
    expect(SOURCE_VIDEO_KINDS).toEqual(['original-recording', 'replay']);
  });

  it('the ffmpeg backend declares honest capabilities', () => {
    const compositor = new FfmpegCompositor();
    expect(compositor.name).toBe('ffmpeg');
    expect(compositor.capabilities).toBe(FFMPEG_CAPABILITIES);
    expect(compositor.capabilities.karaokeCaptions).toBe(true);
    expect(compositor.capabilities.autoZoom).toBe(true);
    expect(compositor.capabilities.smartReframe).toBe(true);
    expect(compositor.capabilities.pictureInPicture).toBe(true);
    expect(compositor.capabilities.deterministicOutput).toBe(true);
    expect(compositor.capabilities.containerFormats).toContain('mp4');
    expect(compositor.capabilities.videoCodecs).toContain('h264');
  });

  it('rejects a source with no duration or no size', () => {
    expect(() =>
      assertCompositorInputs(
        baseInputs({
          source: { ...baseInputs().source, durationMs: 0 },
        }),
        FFMPEG_CAPABILITIES,
      ),
    ).toThrow(CompositorInputError);

    expect(() =>
      assertCompositorInputs(
        baseInputs({ source: { ...baseInputs().source, width: 0 } }),
        FFMPEG_CAPABILITIES,
      ),
    ).toThrow(/frame size/);
  });

  it('refuses inputs a backend has declared it cannot honour', () => {
    const limited: CompositorCapabilities = {
      ...FFMPEG_CAPABILITIES,
      narrationAudio: false,
      pictureInPicture: false,
      alphaPictureInPicture: false,
    };

    expect(() =>
      assertCompositorInputs(
        baseInputs({
          narration: {
            audioPath: path.join(NOWHERE, 'audio.mp3'),
            words: {
              schemaVersion: 1,
              provider: 'fixture',
              sourceText: 'hello',
              durationMs: 100,
              words: [{ word: 'hello', startMs: 0, endMs: 100 }],
            },
          },
        }),
        limited,
      ),
    ).toThrow(/does not support narration audio/);

    expect(() =>
      assertCompositorInputs(
        baseInputs({
          pictureInPicture: {
            path: path.join(NOWHERE, 'avatar.webm'),
            hasAlpha: true,
            alphaMode: 'straight',
            startMs: 0,
            endMs: null,
          },
        }),
        limited,
      ),
    ).toThrow(/picture-in-picture/);
  });

  it('refuses an alpha PiP on a backend that would silently flatten it', () => {
    // The corpus records this exact failure mode: alpha "silently drops".
    // A capability flag turns it into a refusal instead.
    const noAlpha: CompositorCapabilities = {
      ...FFMPEG_CAPABILITIES,
      alphaPictureInPicture: false,
    };
    expect(() =>
      assertCompositorInputs(
        baseInputs({
          pictureInPicture: {
            path: path.join(NOWHERE, 'avatar.webm'),
            hasAlpha: true,
            alphaMode: 'premultiplied',
            startMs: 0,
            endMs: null,
          },
        }),
        noAlpha,
      ),
    ).toThrow(/silently drop transparency/);
  });

  it('accepts a fully populated set of inputs', () => {
    expect(() => assertCompositorInputs(baseInputs(), FFMPEG_CAPABILITIES)).not.toThrow();
  });
});
