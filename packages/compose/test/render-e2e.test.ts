import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import { writeBrandKit } from '../src/brand/io.js';
import { BrandKitSchema } from '../src/brand/schema.js';
import { hashRenderedStreams } from '../src/ffmpeg/backend.js';
import { probeMedia } from '../src/ffmpeg/probe.js';
import { immutableRenderInputs, renderProject } from '../src/render/render-project.js';
import { makeProject } from './fixtures.js';

/**
 * prd-007 AC7 and AC8: a real ffmpeg render of a real fixture project.
 *
 * These tests actually encode. They are the only assurance that the graph
 * this package generates is one ffmpeg will accept, which no amount of
 * golden-file comparison can provide: a graph can be perfectly
 * deterministic and perfectly invalid.
 */

/** A small preset so a full-fidelity render still finishes in seconds. */
const FAST_PRESET = { '16x9': { width: 640, height: 360, fps: 24 } };

/** `crop=w:h:x:y` covering the alternate kit's top-right text watermark. */
const BRANDED_REGION = '120:36:508:14';
/**
 * A region no layer paints at `SAMPLE_AT_SECONDS`: above the caption
 * block, left of the watermark, and ahead of where the spring-smoothed
 * cursor has reached by then.
 */
const UNBRANDED_REGION = '120:60:0:0';
const SAMPLE_AT_SECONDS = 0.5;
/**
 * Mean absolute per-channel difference, 0..255, that two encodes of the
 * same content can differ by purely through rate-control drift.
 */
const ENCODER_NOISE_TOLERANCE = 2;

function md5File(filePath: string): string {
  return createHash('md5').update(readFileSync(filePath)).digest('hex');
}

describe('AC7: waggle render produces a watchable MP4 and is idempotent', () => {
  it('renders the fixture project at --preset 16x9 and reports every layer', async () => {
    const fixture = await makeProject({ presets: FAST_PRESET, durationMs: 3000 });

    const result = await renderProject({
      projectDir: fixture.projectDir,
      presetId: '16x9',
    });

    expect(result.encoded).toBe(true);
    expect(existsSync(result.outputPath)).toBe(true);
    expect(statSync(result.outputPath).size).toBeGreaterThan(10_000);

    const probed = await probeMedia(result.outputPath);
    expect(probed.width).toBe(640);
    expect(probed.height).toBe(360);
    expect(probed.hasAudio).toBe(true);
    // The render must be as long as the source, within one frame.
    expect(probed.durationMs).toBeGreaterThan(2900);
    expect(probed.durationMs).toBeLessThan(3200);

    const layerNames = result.layers.map((layer) => layer.name);
    expect(layerNames).toEqual([
      'base-video',
      'auto-zoom',
      'intro-outro-plates',
      'click-ripples',
      'synthetic-cursor',
      'captions',
      'watermark',
      'logo',
      'picture-in-picture',
      'audio',
    ]);

    const present = new Map(result.layers.map((layer) => [layer.name, layer.present]));
    expect(present.get('base-video')).toBe(true);
    expect(present.get('auto-zoom')).toBe(true);
    expect(present.get('click-ripples')).toBe(true);
    expect(present.get('synthetic-cursor')).toBe(true);
    expect(present.get('captions')).toBe(true);
    expect(present.get('audio')).toBe(true);
    // ADR-007: the slot is wired and reserved, and reports itself as empty.
    expect(present.get('picture-in-picture')).toBe(false);

    // ADR-011: a 640x360 preset over a 640x360 recording is native.
    expect(result.reframe).toBe('native');
    expect(result.sourceKind).toBe('original-recording');

    // The render sidecar exists and carries no clock.
    const metadata = JSON.parse(readFileSync(result.metadataPath, 'utf8')) as Record<
      string,
      unknown
    >;
    expect(metadata.reframe).toBe('native');
    expect(metadata.brandKitId).toBe('default');
    expect(JSON.stringify(metadata)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent: identical inputs give identical demuxed stream hashes', async () => {
    const fixture = await makeProject({ presets: FAST_PRESET, durationMs: 2500 });

    const first = await renderProject({
      projectDir: fixture.projectDir,
      presetId: '16x9',
      outputPath: path.join(fixture.projectDir, 'renders', 'first.mp4'),
    });
    const second = await renderProject({
      projectDir: fixture.projectDir,
      presetId: '16x9',
      outputPath: path.join(fixture.projectDir, 'renders', 'second.mp4'),
    });

    const firstHash = await hashRenderedStreams(first.outputPath);
    const secondHash = await hashRenderedStreams(second.outputPath);

    expect(firstHash).toBe(secondHash);
    // Per-stream, not one opaque number: the video and audio tracks are
    // each reported, so a difference names which one moved.
    expect(firstHash.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(firstHash).toMatch(/^0,v,MD5=[0-9a-f]{32}$/m);

    // The metadata-stripping flags in ../src/ffmpeg/encode-args.ts go
    // further than AC7 requires: even the container bytes match.
    expect(md5File(first.outputPath)).toBe(md5File(second.outputPath));

    // And the graph text is byte-identical, which is what AC4 claims.
    expect(first.filterGraph).toBe(second.filterGraph);
  });
});

describe('AC8: a second brand kit changes only branded elements', () => {
  it('changes branded pixels, leaves unbranded pixels alone, and writes no IR or narration file', async () => {
    const fixture = await makeProject({
      presets: FAST_PRESET,
      durationMs: 2500,
      // A single click late in the clip keeps the zoom (which moves every
      // pixel) away from the frames this test samples.
      clickTimesMs: [2200],
    });

    // A second kit that differs ONLY in branded colour choices. Geometry,
    // timing, zoom, and the cursor path are held identical on purpose: any
    // difference in those would move unbranded pixels too and the test
    // would prove nothing.
    const alternate = BrandKitSchema.parse({
      ...DEFAULT_BRAND_KIT,
      id: 'alternate',
      name: 'Alternate kit',
      palette: { ...DEFAULT_BRAND_KIT.palette, primary: '#00b3ff', accent: '#00b3ff' },
      captions: {
        ...DEFAULT_BRAND_KIT.captions,
        highlightColor: '#00b3ff',
        textColor: '#ffe600',
      },
      cursor: {
        ...DEFAULT_BRAND_KIT.cursor,
        color: '#00b3ff',
        ripple: { ...DEFAULT_BRAND_KIT.cursor.ripple, color: '#00b3ff' },
      },
      watermark: {
        kind: 'text',
        text: 'ALTERNATE',
        anchor: 'top-right',
        fontSizePct: 0.05,
        color: '#00b3ff',
        outlineColor: '#101820',
        marginPct: 0.03,
        opacity: 0.9,
      },
    });
    writeBrandKit(fixture.projectDir, alternate);

    const before = hashImmutableInputs(fixture.projectDir, fixture.irVersion);

    const defaultRender = await renderProject({
      projectDir: fixture.projectDir,
      presetId: '16x9',
      brandKitId: 'default',
    });
    const alternateRender = await renderProject({
      projectDir: fixture.projectDir,
      presetId: '16x9',
      brandKitId: 'alternate',
    });

    expect(defaultRender.outputPath).not.toBe(alternateRender.outputPath);

    // --- The no-write claim, proved rather than asserted ----------------
    const after = hashImmutableInputs(fixture.projectDir, fixture.irVersion);
    expect(after).toEqual(before);
    expect(Object.keys(before).length).toBeGreaterThanOrEqual(3);

    // --- Frame sampling --------------------------------------------------
    // Decoded pixels are compared with a tolerance rather than by hash,
    // and the reason is worth stating: both files are lossy H.264, so a
    // change anywhere in the frame redistributes x264's bit budget and
    // perturbs "untouched" regions by a fraction of a level. An exact
    // pixel match between two different encodes is unachievable; what IS
    // meaningful is that an unbranded region stays inside encoder noise
    // while a branded one moves by an order of magnitude more.
    const brandedDiff = await regionMeanAbsDiff(
      defaultRender.outputPath,
      alternateRender.outputPath,
      SAMPLE_AT_SECONDS,
      BRANDED_REGION,
    );
    const plainDiff = await regionMeanAbsDiff(
      defaultRender.outputPath,
      alternateRender.outputPath,
      SAMPLE_AT_SECONDS,
      UNBRANDED_REGION,
    );

    expect(plainDiff).toBeLessThan(ENCODER_NOISE_TOLERANCE);
    expect(brandedDiff).toBeGreaterThan(ENCODER_NOISE_TOLERANCE * 4);
  });
});

function hashImmutableInputs(projectDir: string, irVersion: number): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const filePath of immutableRenderInputs(projectDir, irVersion)) {
    entries[path.relative(projectDir, filePath).replace(/\\/g, '/')] = md5File(filePath);
  }
  return entries;
}

/**
 * Decodes one rectangular region of one frame as raw RGB.
 *
 * `rawvideo` rather than PNG so the comparison is of decoded pixel values
 * with no second compression step in between.
 */
async function sampleRegionPixels(
  videoPath: string,
  atSeconds: number,
  region: string,
): Promise<Buffer> {
  const { resolveFfmpegPath } = await import('../src/ffmpeg/run-ffmpeg.js');
  const { execFileSync } = await import('node:child_process');
  return execFileSync(
    resolveFfmpegPath(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(atSeconds),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-vf',
      `crop=${region}`,
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

/** Mean absolute per-channel difference between the same region of two renders, 0..255. */
async function regionMeanAbsDiff(
  aPath: string,
  bPath: string,
  atSeconds: number,
  region: string,
): Promise<number> {
  const [a, b] = await Promise.all([
    sampleRegionPixels(aPath, atSeconds, region),
    sampleRegionPixels(bPath, atSeconds, region),
  ]);
  if (a.length === 0 || a.length !== b.length) {
    throw new Error(
      `Sampled regions do not match in size (${a.length} vs ${b.length} bytes); the crop is probably outside the frame.`,
    );
  }
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return total / a.length;
}
