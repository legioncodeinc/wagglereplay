import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import { BUILT_IN_PRESETS, DEFAULT_PRESET_ID, PresetError, resolvePreset } from '../src/presets.js';
import {
  immutableRenderInputs,
  loadNarration,
  RenderInputError,
  renderFilename,
  renderProject,
  resolveSourceVideo,
} from '../src/render/render-project.js';
import { makeFlow, makeProject, makeTempDir } from './fixtures.js';

/** prd-007 AC7: project resolution, and the prd-009 seam. */

describe('presets', () => {
  it('ships the four aspect ratios a walkthrough gets cut to', () => {
    expect(Object.keys(BUILT_IN_PRESETS).sort()).toEqual(['16x9', '1x1', '4x5', '9x16']);
    expect(DEFAULT_PRESET_ID).toBe('16x9');
  });

  it('lets a project override a built-in id without inventing a new one', () => {
    const resolved = resolvePreset('16x9', { '16x9': { width: 1280, height: 720 } });
    expect(resolved.source).toBe('manifest');
    expect(resolved.preset).toEqual({ id: '16x9', width: 1280, height: 720, fps: 30 });
  });

  it('carries a preset-level brand kit choice', () => {
    const resolved = resolvePreset('social', {
      social: { width: 1080, height: 1080, fps: 24, brandKit: 'punchy' },
    });
    expect(resolved.brandKitId).toBe('punchy');
    expect(resolved.preset.fps).toBe(24);
  });

  it('names the known presets when asked for one that does not exist', () => {
    expect(() => resolvePreset('vertical')).toThrow(PresetError);
    expect(() => resolvePreset('vertical')).toThrow(/Known presets: 16x9, 1x1, 4x5, 9x16/);
  });

  it('reports which field of a malformed manifest preset is wrong', () => {
    expect(() => resolvePreset('16x9', { '16x9': { width: 0, height: 720 } })).toThrow(/width/);
    expect(() => resolvePreset('16x9', { '16x9': 'wide' })).toThrow(/not a valid preset/);
  });
});

describe('AC7: the prd-009 source-video seam', () => {
  it('reads the original recording the IR points at, labelled by kind', async () => {
    const fixture = await makeProject({ withNarration: false, durationMs: 2000 });
    const source = await resolveSourceVideo(fixture.projectDir, fixture.flow);
    // `kind` is what prd-009 flips. Everything downstream needs only the
    // probed geometry, which is why the swap is one call site.
    expect(source.kind).toBe('original-recording');
    expect(source.width).toBe(640);
    expect(source.height).toBe(360);
    expect(source.hasAudio).toBe(true);
    expect(source.durationMs).toBeGreaterThan(1800);
  });

  it('explains itself when the IR has no source recording', async () => {
    const flow = makeFlow();
    const withoutRecording = {
      ...flow,
      waggle: { ...flow.waggle, sourceRecording: undefined },
    };
    const dir = makeTempDir('no-recording');
    await expect(resolveSourceVideo(dir, withoutRecording)).rejects.toThrow(RenderInputError);
    await expect(resolveSourceVideo(dir, withoutRecording)).rejects.toThrow(/prd-009/);
  });

  it('names the missing file when the IR points at a recording that is gone', async () => {
    const fixture = await makeProject({ withNarration: false, durationMs: 1500 });
    rmSync(fixture.videoPath);
    await expect(resolveSourceVideo(fixture.projectDir, fixture.flow)).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('AC7: narration loading', () => {
  it('returns null for a project that has not been narrated', async () => {
    const fixture = await makeProject({ withNarration: false, durationMs: 1500 });
    expect(loadNarration(fixture.projectDir)).toBeNull();
  });

  it('loads words.json and its paired audio together', async () => {
    const fixture = await makeProject({ durationMs: 2000 });
    const narration = loadNarration(fixture.projectDir);
    expect(narration).not.toBeNull();
    expect(narration?.audioPath.endsWith('audio.mp3')).toBe(true);
    expect(narration?.words.words.length).toBeGreaterThan(0);
  });

  it('refuses audio without timings rather than rendering uncaptioned', async () => {
    const fixture = await makeProject({ durationMs: 1500 });
    rmSync(path.join(fixture.projectDir, 'narration', 'words.json'));
    expect(() => loadNarration(fixture.projectDir)).toThrow(/Captions cannot be timed/);
  });

  it('refuses timings without audio', async () => {
    const fixture = await makeProject({ durationMs: 1500 });
    rmSync(path.join(fixture.projectDir, 'narration', 'audio.mp3'));
    expect(() => loadNarration(fixture.projectDir)).toThrow(/no narration audio was found/);
  });

  it('validates against the shared words.json contract from @waggle/narrate', async () => {
    const fixture = await makeProject({ durationMs: 1500 });
    writeFileSync(
      path.join(fixture.projectDir, 'narration', 'words.json'),
      JSON.stringify({ schemaVersion: 1, provider: 'broken', words: [] }),
      'utf8',
    );
    expect(() => loadNarration(fixture.projectDir)).toThrow(/words.json contract/);
  });
});

describe('AC7: render orchestration', () => {
  it('names the output for the exact (IR, kit, preset) triple it came from', () => {
    expect(renderFilename(3, DEFAULT_BRAND_KIT, '9x16')).toBe('walkthrough.v3.default.9x16.mp4');
  });

  it('refuses to render a project with no recorded IR', async () => {
    const projectDir = makeTempDir('empty');
    mkdirSync(path.join(projectDir, 'renders'), { recursive: true });
    writeFileSync(
      path.join(projectDir, 'waggle.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'empty',
        createdAt: '2026-08-20T00:00:00.000Z',
        currentIrVersion: null,
        presets: {},
        defaults: {},
      }),
      'utf8',
    );
    await expect(renderProject({ projectDir })).rejects.toThrow(/no recorded Walkthrough IR/);
  });

  it('reports the full command without encoding under dryRun', async () => {
    const fixture = await makeProject({
      presets: { '16x9': { width: 640, height: 360, fps: 24 } },
      durationMs: 1500,
    });
    const result = await renderProject({
      projectDir: fixture.projectDir,
      presetId: '16x9',
      dryRun: true,
    });
    expect(result.encoded).toBe(false);
    expect(result.command[0]).toMatch(/ffmpeg/);
    expect(result.command).toContain('-/filter_complex');
    expect(result.filterGraph.length).toBeGreaterThan(0);
    expect(result.irVersion).toBe(fixture.irVersion);
  });

  it('lists exactly the files a render must never touch', async () => {
    const fixture = await makeProject({ durationMs: 1500 });
    const immutable = immutableRenderInputs(fixture.projectDir, fixture.irVersion)
      .map((file) => path.relative(fixture.projectDir, file).replace(/\\/g, '/'))
      .sort();
    expect(immutable).toEqual([
      'narration/audio.mp3',
      'narration/words.json',
      'waggle.json',
      'walkthrough.v1.json',
    ]);
  });
});
