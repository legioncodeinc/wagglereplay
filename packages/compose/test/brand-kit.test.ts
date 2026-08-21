import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT, DEFAULT_BRAND_KIT_ID } from '../src/brand/defaults.js';
import { brandKitPath, loadBrandKit, serializeBrandKit, writeBrandKit } from '../src/brand/io.js';
import { BrandKitError, BrandKitSchema, parseBrandKit } from '../src/brand/schema.js';
import { makeTempDir } from './fixtures.js';

/** prd-007 AC1: the brand kit config schema, validated with zod. */

function stageProject(): string {
  const dir = makeTempDir('brand');
  mkdirSync(path.join(dir, 'brand'), { recursive: true });
  return dir;
}

describe('AC1: brand kit schema', () => {
  it('accepts the built-in default kit', () => {
    expect(() => BrandKitSchema.parse(DEFAULT_BRAND_KIT)).not.toThrow();
    expect(DEFAULT_BRAND_KIT.id).toBe(DEFAULT_BRAND_KIT_ID);
  });

  it('rejects an unknown key rather than silently ignoring it', () => {
    expect(() => parseBrandKit({ ...DEFAULT_BRAND_KIT, cursorColour: '#fff' }, 'test kit')).toThrow(
      BrandKitError,
    );
  });

  it('rejects a colour that is not #rgb or #rrggbb', () => {
    expect(() =>
      parseBrandKit(
        { ...DEFAULT_BRAND_KIT, palette: { ...DEFAULT_BRAND_KIT.palette, primary: 'red' } },
        'test kit',
      ),
    ).toThrow(/palette\.primary/);
  });

  it('rejects an opacity outside 0..1', () => {
    expect(() =>
      parseBrandKit(
        {
          ...DEFAULT_BRAND_KIT,
          cursor: { ...DEFAULT_BRAND_KIT.cursor, opacity: 1.5 },
        },
        'test kit',
      ),
    ).toThrow(/cursor\.opacity/);
  });

  it('names every offending path in one message', () => {
    let message = '';
    try {
      parseBrandKit(
        {
          ...DEFAULT_BRAND_KIT,
          zoom: { ...DEFAULT_BRAND_KIT.zoom, level: 0.5, easeMs: -1 },
        },
        '"kit.json"',
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('"kit.json"');
    expect(message).toContain('zoom.level');
    expect(message).toContain('zoom.easeMs');
  });

  it('discriminates image and text watermarks', () => {
    const image = parseBrandKit(
      {
        ...DEFAULT_BRAND_KIT,
        watermark: {
          kind: 'image',
          source: 'brand/mark.png',
          anchor: 'bottom-right',
          widthPct: 0.1,
          marginPct: 0.02,
          opacity: 0.8,
        },
      },
      'kit',
    );
    expect(image.watermark?.kind).toBe('image');

    expect(() =>
      parseBrandKit(
        {
          ...DEFAULT_BRAND_KIT,
          // A text watermark carrying an image's `source` must not pass.
          watermark: {
            kind: 'text',
            source: 'brand/mark.png',
            text: 'waggle',
            anchor: 'bottom-right',
            fontSizePct: 0.04,
            color: '#fff',
            outlineColor: '#000',
            marginPct: 0.02,
            opacity: 0.8,
          },
        },
        'kit',
      ),
    ).toThrow(BrandKitError);
  });

  it('reserves picture-in-picture geometry even though prd-017 is deferred (ADR-007)', () => {
    expect(DEFAULT_BRAND_KIT.pictureInPicture.anchor).toBe('bottom-right');
    expect(DEFAULT_BRAND_KIT.pictureInPicture.widthPct).toBeGreaterThan(0);
  });
});

describe('AC1: brand kit files', () => {
  it('falls back to the built-in kit only for the default id', () => {
    const projectDir = stageProject();
    expect(loadBrandKit(projectDir)).toEqual(DEFAULT_BRAND_KIT);
    expect(() => loadBrandKit(projectDir, 'nope')).toThrow(/not found/);
  });

  it('round-trips a written kit', () => {
    const projectDir = stageProject();
    const kit = BrandKitSchema.parse({ ...DEFAULT_BRAND_KIT, id: 'acme', name: 'Acme' });
    const written = writeBrandKit(projectDir, kit);
    expect(written).toBe(brandKitPath(projectDir, 'acme'));
    expect(loadBrandKit(projectDir, 'acme')).toEqual(kit);
  });

  it('refuses a kit whose id does not match its filename', () => {
    const projectDir = stageProject();
    writeFileSync(
      brandKitPath(projectDir, 'acme'),
      serializeBrandKit(BrandKitSchema.parse({ ...DEFAULT_BRAND_KIT, id: 'other' })),
      'utf8',
    );
    expect(() => loadBrandKit(projectDir, 'acme')).toThrow(/must match/);
  });

  it('reports a syntax error with the file path', () => {
    const projectDir = stageProject();
    writeFileSync(brandKitPath(projectDir, 'broken'), '{ not json', 'utf8');
    expect(() => loadBrandKit(projectDir, 'broken')).toThrow(/is not valid JSON/);
  });
});
