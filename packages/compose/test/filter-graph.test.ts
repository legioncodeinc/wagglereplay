// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAudioChain } from '../src/audio/mix.js';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import { type BrandKit, BrandKitSchema } from '../src/brand/schema.js';
import type { CompositorInputs } from '../src/compositor.js';
import {
  buildEncodeArgs,
  DETERMINISTIC_THREADS,
  GRAPH_FILENAME,
} from '../src/ffmpeg/encode-args.js';
import { buildFilterGraph } from '../src/graph/build-graph.js';
import { resolvePreset } from '../src/presets.js';
import { buildTimeline } from '../src/timeline.js';
import { absoluteTestPath, makeFlow, makeWords } from './fixtures.js';

/**
 * prd-007 AC4: the filter-graph builder, and the determinism claim it
 * rests on.
 *
 * "Graph text is deterministic for identical inputs" is only a testable
 * claim if the graph is a pure function. These tests hash it, diff it
 * against a golden file, and check the two things that would silently
 * break the claim in the field: an absolute path leaking into a filter,
 * and a clock or a random value reaching a number.
 */

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');
const PRESET = resolvePreset('16x9', { '16x9': { width: 1280, height: 720, fps: 30 } }).preset;

// Built from the platform's own filesystem root rather than a `C:/` literal,
// so `path.resolve` inside the graph builder behaves identically on Windows
// and POSIX. See `absoluteTestPath` in ./fixtures.ts.
const PROJECT_DIR = absoluteTestPath('project');
const WORK_DIR = path.join(PROJECT_DIR, 'renders', '.work', 'golden');
const OUTPUT_PATH = path.join(PROJECT_DIR, 'renders', 'out.mp4');

function assertGolden(name: string, actual: string): void {
  // Golden files are a flat directory of bare filenames; basename enforces
  // that contract (a name carrying a separator can never escape golden/).
  const goldenPath = path.join(GOLDEN_DIR, path.basename(name));
  if (process.env.WAGGLE_UPDATE_GOLDEN === '1') {
    writeFileSync(goldenPath, actual, 'utf8');
    return;
  }
  expect(actual).toBe(readFileSync(goldenPath, 'utf8'));
}

function fullKit(): BrandKit {
  return BrandKitSchema.parse({
    ...DEFAULT_BRAND_KIT,
    id: 'golden',
    name: 'Golden kit',
    logo: {
      source: 'brand/logo.png',
      anchor: 'top-left',
      widthPct: 0.12,
      marginPct: 0.03,
      opacity: 0.9,
    },
    watermark: {
      kind: 'text',
      text: 'waggle',
      anchor: 'top-right',
      fontSizePct: 0.05,
      color: '#f5b301',
      outlineColor: '#101820',
      marginPct: 0.03,
      opacity: 0.9,
    },
    intro: {
      enabled: true,
      durationMs: 1200,
      backgroundColor: '#101820',
      title: 'Filter the dashboard',
      subtitle: 'A short walkthrough',
      titleColor: '#ffffff',
      subtitleColor: '#f5b301',
      titleSizePct: 0.11,
    },
    outro: {
      enabled: true,
      durationMs: 900,
      backgroundColor: '#101820',
      title: 'Try it yourself',
      subtitle: 'wagglereplay.dev',
      titleColor: '#ffffff',
      subtitleColor: '#f5b301',
      titleSizePct: 0.1,
    },
  });
}

function inputsFor(overrides: Partial<CompositorInputs> = {}): CompositorInputs {
  return {
    source: {
      kind: 'original-recording',
      path: path.join(PROJECT_DIR, 'steps', 'recording.mp4'),
      width: 1280,
      height: 720,
      durationMs: 6000,
      hasAudio: true,
    },
    flow: makeFlow({ durationMs: 6000, clickTimesMs: [1500, 4200] }),
    narration: {
      audioPath: path.join(PROJECT_DIR, 'narration', 'audio.mp3'),
      words: makeWords('Open the dashboard and apply a filter to narrow the results.', 6000),
    },
    brandKit: fullKit(),
    assetBaseDir: PROJECT_DIR,
    preset: PRESET,
    output: { path: OUTPUT_PATH, workDir: WORK_DIR },
    pictureInPicture: null,
    ...overrides,
  };
}

describe('AC4: the filter graph is deterministic', () => {
  it('is byte-identical across repeated builds', () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 5; i += 1) {
      const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
      hashes.add(createHash('sha256').update(graph.text).digest('hex'));
    }
    expect(hashes.size).toBe(1);
  });

  it('is identical for two independently constructed but equal input sets', () => {
    // Not the same object graph: a fresh flow, a fresh kit, a fresh
    // everything. Equal INPUTS must give equal text, or the "cacheable by
    // input hash" property the corpus claims does not hold.
    const first = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const second = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    expect(first.text).toBe(second.text);
    expect(first.inputs).toEqual(second.inputs);
    expect(first.layers).toEqual(second.layers);
  });

  it('changes when, and only when, an input changes', () => {
    const base = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 }).text;

    const differentZoom = buildFilterGraph({
      inputs: inputsFor({
        brandKit: BrandKitSchema.parse({
          ...fullKit(),
          zoom: { ...fullKit().zoom, level: 1.8 },
        }),
      }),
      captionCueCount: 2,
    }).text;
    expect(differentZoom).not.toBe(base);

    const differentPreset = buildFilterGraph({
      inputs: inputsFor({
        preset: resolvePreset('9x16', { '9x16': { width: 720, height: 1280, fps: 30 } }).preset,
      }),
      captionCueCount: 2,
    }).text;
    expect(differentPreset).not.toBe(base);
  });

  it('contains no absolute path, so the text is machine-independent', () => {
    // The only path inside a filter is the ASS file, referenced by a bare
    // relative name because ffmpeg runs with the work directory as its
    // cwd. That is what makes a golden file portable, and it sidesteps the
    // subtitles filter's Windows drive-letter escaping entirely.
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    // Checked against the ACTUAL paths this graph was built from rather
    // than against a regex for an absolute path. A generic POSIX-root
    // pattern cannot be used here: ffmpeg expressions are full of `/` as
    // division (`asetpts=N/SR/TB`, `out_w/2`), so such a regex either
    // false-positives on arithmetic or is written so loosely it catches
    // nothing. Comparing against the known inputs is exact, and means the
    // same thing on Windows and on POSIX.
    const absoluteInputs = graph.inputs
      .map((input) => input.path)
      .filter((candidate) => path.isAbsolute(candidate));
    expect(absoluteInputs.length).toBeGreaterThan(0);
    for (const absolute of absoluteInputs) {
      expect(graph.text).not.toContain(absolute);
    }
    for (const directory of [PROJECT_DIR, WORK_DIR, OUTPUT_PATH]) {
      expect(graph.text).not.toContain(directory);
    }

    // Belt and braces for a stray hardcoded Windows literal, which the
    // path comparison above would not catch if someone typed one in.
    expect(graph.text).not.toMatch(/[A-Za-z]:[/\\]/);
    expect(graph.text).toContain('subtitles=filename=captions.ass:fontsdir=fonts');
  });

  it('contains no timestamp, uuid, or exponent-formatted number', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    expect(graph.text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(graph.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(graph.text).not.toMatch(/\de[+-]\d/);
  });

  it('matches the golden graph', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    assertGolden('filtergraph-full.txt', graph.text);
  });
});

describe('AC4: layer assembly', () => {
  it('assembles every layer in a fixed bottom-to-top paint order', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    expect(graph.layers.map((layer) => layer.name)).toEqual([
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
  });

  it('emits one overlay chain entry per click, as the corpus specifies', () => {
    const graph = buildFilterGraph({
      inputs: inputsFor({
        flow: makeFlow({ durationMs: 6000, clickTimesMs: [1000, 2000, 3000] }),
      }),
      captionCueCount: 1,
    });
    const rippleOverlays = graph.text
      .split('\n')
      .filter((line) => line.includes('overlay=') && line.includes('overlay_w/2'));
    expect(rippleOverlays.length).toBe(3);
    // Each carries its own enable window rather than running the whole time.
    for (const overlay of rippleOverlays) {
      expect(overlay).toMatch(/enable='between\(t,[\d.]+,[\d.]+\)'/);
    }
  });

  it('extends the timeline with tpad rather than covering the recording', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    expect(graph.text).toContain('tpad=start_duration=1.2:start_mode=add:color=0x101820');
    expect(graph.text).toContain('stop_duration=0.9:stop_mode=add');
    // 6000ms of recording plus a 1200ms intro plus a 900ms outro.
    expect(graph.timeline.totalMs).toBe(8100);
  });

  it('omits tpad entirely when neither card is enabled', () => {
    const graph = buildFilterGraph({
      inputs: inputsFor({ brandKit: DEFAULT_BRAND_KIT }),
      captionCueCount: 0,
    });
    expect(graph.text).not.toContain('tpad');
    expect(graph.timeline.totalMs).toBe(6000);
  });

  it('resolves kit asset paths to absolute -i arguments, not graph text', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const logo = graph.inputs.find((input) => input.role === 'logo image');
    expect(logo).toBeDefined();
    // The kit stores `brand/logo.png` project-relative so it stays
    // committable; the builder must resolve it against `assetBaseDir` into
    // a real absolute path for `-i`. The expectation is composed with the
    // same path primitives rather than written as a literal, so it means
    // the same thing on Windows and on POSIX.
    expect(path.isAbsolute(logo?.path ?? '')).toBe(true);
    expect(logo?.path).toBe(path.join(PROJECT_DIR, 'brand', 'logo.png'));

    // And the other half of the claim: it reaches ffmpeg as an argument,
    // never as text inside the graph.
    expect(graph.text).not.toContain(logo?.path ?? '');
    expect(graph.text).not.toContain('logo.png');
  });

  it('gives the ripple input a real frame rate, since its size is animated', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const ripple = graph.inputs.find((input) => input.role === 'click ripple sprite');
    expect(ripple?.options).toEqual(['-loop', '1', '-framerate', '30']);
  });

  it('skips the subtitles pass when there is no text at all', () => {
    const graph = buildFilterGraph({
      inputs: inputsFor({ narration: null, brandKit: DEFAULT_BRAND_KIT }),
      captionCueCount: 0,
    });
    expect(graph.text).not.toContain('subtitles=');
  });
});

describe('AC4 / ADR-007: the reserved picture-in-picture slot', () => {
  it('is wired and reports itself present-but-empty when nothing fills it', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const slot = graph.layers.find((layer) => layer.name === 'picture-in-picture');
    expect(slot).toBeDefined();
    expect(slot?.present).toBe(false);
    // The slot still reports its reserved geometry, which is exactly what
    // ADR-007 buys: prd-017 needs no compositor refactor.
    expect(slot?.detail).toContain('reserved slot (ADR-007)');
    expect(slot?.detail).toContain('bottom-right');
  });

  it('composites an alpha input with the right decoder and blend', () => {
    const graph = buildFilterGraph({
      inputs: inputsFor({
        pictureInPicture: {
          path: path.join(PROJECT_DIR, 'avatar.webm'),
          hasAlpha: true,
          alphaMode: 'premultiplied',
          startMs: 500,
          endMs: 5000,
        },
      }),
      captionCueCount: 2,
    });
    const pip = graph.inputs.find((input) => input.role === 'picture-in-picture');
    // The corpus: "force -c:v libvpx-vp9 on input or alpha silently drops".
    expect(pip?.options).toEqual(['-c:v', 'libvpx-vp9']);
    // And: "overlay alpha=straight vs premultiplied mismatches fringe".
    expect(graph.text).toContain('unpremultiply=inplace=1');
    expect(graph.text).toContain("enable='between(t,0.5,5)'");
    expect(graph.layers.find((layer) => layer.name === 'picture-in-picture')?.present).toBe(true);
  });

  it('does not name a decoder for an opaque PiP', () => {
    const graph = buildFilterGraph({
      inputs: inputsFor({
        pictureInPicture: {
          path: path.join(PROJECT_DIR, 'avatar.mp4'),
          hasAlpha: false,
          alphaMode: 'straight',
          startMs: 0,
          endMs: null,
        },
      }),
      captionCueCount: 2,
    });
    expect(graph.inputs.find((input) => input.role === 'picture-in-picture')?.options).toEqual([]);
    expect(graph.text).not.toContain('unpremultiply');
  });
});

describe('AC6: narration audio and ducking', () => {
  const timeline = buildTimeline(DEFAULT_BRAND_KIT, 6000);

  it('reports no audio when there is neither a source track nor narration', () => {
    const chain = buildAudioChain({
      sourceLabel: null,
      narrationLabel: null,
      style: DEFAULT_BRAND_KIT.audio,
      timeline,
      outputLabel: 'aout',
    });
    expect(chain.hasAudio).toBe(false);
    expect(chain.chains).toEqual([]);
  });

  it('ducks the source under the narration with a sidechain compressor', () => {
    const chain = buildAudioChain({
      sourceLabel: '0:a',
      narrationLabel: '5:a',
      style: DEFAULT_BRAND_KIT.audio,
      timeline,
      outputLabel: 'aout',
    });
    const text = chain.chains.join('\n');
    // A sidechain, not a static cut: the app's own sound only drops while
    // a voice is actually present.
    expect(text).toContain('sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300');
    // The narration is split so the same signal is both key and mix.
    expect(text).toContain('asplit=2[wnarr][wkey]');
    expect(text).toContain('[wsrc][wkey]sidechaincompress');
    expect(text).toContain('[wducked][wnarr]amix=inputs=2');
    expect(chain.detail).toContain('sidechain ducking');
  });

  it('mixes without a compressor when ducking is switched off', () => {
    const chain = buildAudioChain({
      sourceLabel: '0:a',
      narrationLabel: '5:a',
      style: {
        ...DEFAULT_BRAND_KIT.audio,
        ducking: { ...DEFAULT_BRAND_KIT.audio.ducking, enabled: false },
      },
      timeline,
      outputLabel: 'aout',
    });
    const text = chain.chains.join('\n');
    expect(text).not.toContain('sidechaincompress');
    expect(text).toContain('amix=inputs=2');
    expect(chain.detail).toContain('ducking off');
  });

  it('pads and trims every track to the exact composited duration', () => {
    const kit = BrandKitSchema.parse({
      ...DEFAULT_BRAND_KIT,
      intro: {
        enabled: true,
        durationMs: 1500,
        backgroundColor: '#101820',
        title: 'Hello',
        subtitle: '',
        titleColor: '#ffffff',
        subtitleColor: '#f5b301',
        titleSizePct: 0.1,
      },
    });
    const chain = buildAudioChain({
      sourceLabel: '0:a',
      narrationLabel: '5:a',
      style: kit.audio,
      timeline: buildTimeline(kit, 6000),
      outputLabel: 'aout',
    });
    const text = chain.chains.join('\n');
    // Delayed onto the timeline by the intro, padded to reach the end,
    // then trimmed so the duration cannot depend on which input is longest.
    expect(text).toContain('adelay=delays=1500:all=1');
    expect(text).toContain('apad,atrim=start=0:end=7.5');
  });

  it('handles a silent recording and a narration-free project', () => {
    const narrationOnly = buildAudioChain({
      sourceLabel: null,
      narrationLabel: '5:a',
      style: DEFAULT_BRAND_KIT.audio,
      timeline,
      outputLabel: 'aout',
    });
    expect(narrationOnly.hasAudio).toBe(true);
    expect(narrationOnly.chains.length).toBe(1);
    expect(narrationOnly.detail).toContain('narration only');

    const sourceOnly = buildAudioChain({
      sourceLabel: '0:a',
      narrationLabel: null,
      style: DEFAULT_BRAND_KIT.audio,
      timeline,
      outputLabel: 'aout',
    });
    expect(sourceOnly.detail).toContain('source audio only');
    expect(sourceOnly.chains[0]).toContain('volume=-6dB');
  });

  it('maps no audio stream at all when the render is silent', () => {
    const graph = buildFilterGraph({
      inputs: inputsFor({
        narration: null,
        source: { ...inputsFor().source, hasAudio: false },
      }),
      captionCueCount: 0,
    });
    expect(graph.audioLabel).toBeNull();
    expect(
      buildEncodeArgs({
        graph,
        preset: PRESET,
        durationMs: graph.timeline.totalMs,
        outputPath: 'out.mp4',
      }),
    ).toContain('-an');
  });
});

describe('AC4 / AC7: the encode arguments', () => {
  it('sets every flag the idempotency claim depends on', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const args = buildEncodeArgs({
      graph,
      preset: PRESET,
      durationMs: graph.timeline.totalMs,
      outputPath: 'out.mp4',
    });
    const joined = args.join(' ');
    // Encoder version strings out of the bitstream.
    expect(joined).toContain('-fflags +bitexact');
    expect(joined).toContain('-flags:v +bitexact');
    expect(joined).toContain('-flags:a +bitexact');
    // creation_time and encoder tags out of the container.
    expect(joined).toContain('-map_metadata -1');
    // libx264 is deterministic for a GIVEN thread count, and its default
    // is derived from the host CPU count. Unpinned, a render is
    // reproducible on one machine and not across two.
    expect(args).toContain('-threads');
    expect(args).toContain(String(DETERMINISTIC_THREADS));
    // Looping sprite inputs never end on their own.
    expect(joined).toContain('-t 8.1');
  });

  it('passes the graph as a file, not as a command-line argument', () => {
    // A cursor expression for a long walkthrough runs to tens of
    // kilobytes and would blow past Windows' 32767-character limit.
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const args = buildEncodeArgs({
      graph,
      preset: PRESET,
      durationMs: graph.timeline.totalMs,
      outputPath: 'out.mp4',
    });
    expect(args).toContain('-/filter_complex');
    expect(args).toContain(GRAPH_FILENAME);
    expect(args.join(' ')).not.toContain('overlay=');
  });

  it('orders inputs exactly as the graph declared them', () => {
    const graph = buildFilterGraph({ inputs: inputsFor(), captionCueCount: 2 });
    const args = buildEncodeArgs({
      graph,
      preset: PRESET,
      durationMs: graph.timeline.totalMs,
      outputPath: 'out.mp4',
    });
    const inputPaths = args.filter((arg, index) => args[index - 1] === '-i');
    expect(inputPaths).toEqual(graph.inputs.map((input) => input.path));
  });
});
