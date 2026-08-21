import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDefaultManifest, manifestPath, WaggleManifestSchema } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import { createRealFfmpegRunner, type FfmpegRunner } from '../../src/frames/ffmpeg-runner.js';
import { HeatmapDocumentSchema } from '../../src/heatmap/schema.js';
import { runIngest } from '../../src/pipeline/run-ingest.js';
import { PreDraftDocumentSchema } from '../../src/predraft/schema.js';
import { loadSixStepFixture } from '../helpers/load-fixture.js';
import { createSyntheticVideo } from '../helpers/synthetic-video.js';

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function seedProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-ingest-project-'));
  writeFileSync(
    manifestPath(dir),
    `${JSON.stringify(createDefaultManifest('demo'), null, 2)}\n`,
    'utf8',
  );
  return dir;
}

/** Copies the checked-in real fixture recording into a fresh temp session dir with a synthetic video alongside it. */
async function seedSessionDir(): Promise<{ sessionDir: string; durationSeconds: number }> {
  const fixture = loadSixStepFixture();
  const sessionDir = mkdtempSync(path.join(tmpdir(), 'waggle-ingest-session-'));
  await mkdir(sessionDir, { recursive: true });

  await writeFile(
    path.join(sessionDir, 'meta.json'),
    `${JSON.stringify(fixture.meta, null, 2)}\n`,
    'utf8',
  );
  const eventsJsonl = readFileSync(path.join(fixture.dir, 'events.jsonl'), 'utf8');
  await writeFile(path.join(sessionDir, 'events.jsonl'), eventsJsonl, 'utf8');

  // Comfortably longer than the real recording's ~1.3s so every step's
  // +-5s window has real headroom on both sides, not just clamping.
  const durationSeconds = 15;
  await createSyntheticVideo(path.join(sessionDir, fixture.meta.video.filename), durationSeconds);

  return { sessionDir, durationSeconds };
}

/** A deterministic fake ffmpeg runner: writes a fixed placeholder file at the requested output path instead of decoding anything. Used only to keep the idempotency test fast; real-ffmpeg determinism is proven separately in test/frames/extract-keyframes.test.ts. */
function createFakeFfmpegRunner(): FfmpegRunner {
  return async (args) => {
    const outPath = args[args.length - 1];
    if (typeof outPath === 'string') {
      await writeFile(outPath, `fake-frame:${args.join('|')}`);
    }
    return { stdout: '', stderr: '' };
  };
}

describe('AC5: runIngest end-to-end (real ffmpeg, real fixture recording)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('lands a valid IR v1 project state from a finished capture session', async () => {
    const projectDir = seedProject();
    const { sessionDir } = await seedSessionDir();
    cleanup.push(projectDir, sessionDir);

    const result = await runIngest({
      projectDir,
      sessionDir,
      ffmpegRunner: createRealFfmpegRunner(),
      extractionOptions: { windowMs: 1_000, sampleIntervalMs: 1_000 }, // small window keeps this test's spawn count sane
      predraftEnv: {}, // no key in this environment (see this PRD's report)
    });

    expect(result.irVersion).toBe(1);
    expect(existsSync(result.irFilePath)).toBe(true);
    expect(result.stepCount).toBeGreaterThan(0);
    expect(result.framesExtracted).toBeGreaterThan(0);

    const manifest = WaggleManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath(projectDir), 'utf8')),
    );
    expect(manifest.currentIrVersion).toBe(1);

    const heatmap = HeatmapDocumentSchema.parse(
      JSON.parse(readFileSync(result.heatmapFilePath, 'utf8')),
    );
    expect(heatmap.irVersion).toBe(1);
    expect(heatmap.routes.length).toBeGreaterThan(0);

    const predraft = PreDraftDocumentSchema.parse(
      JSON.parse(readFileSync(result.predraftFilePath, 'utf8')),
    );
    expect(predraft.steps).toHaveLength(result.stepCount);
    expect(predraft.steps.every((s) => s.provider === null)).toBe(true); // no-key placeholder path

    expect(result.warnings.some((w) => w.includes('WAGGLE_PREDRAFT_PROVIDER'))).toBe(true);

    const stepDirs = readdirSync(path.join(projectDir, 'steps', 'v1'));
    expect(stepDirs.length).toBe(result.stepCount);
  }, 60_000);

  it('exits with IngestSessionError for a session directory missing meta.json', async () => {
    const projectDir = seedProject();
    const emptySessionDir = mkdtempSync(path.join(tmpdir(), 'waggle-ingest-empty-'));
    cleanup.push(projectDir, emptySessionDir);

    await expect(
      runIngest({ projectDir, sessionDir: emptySessionDir, predraftEnv: {} }),
    ).rejects.toThrow(/meta\.json/);
  });
});

describe('AC5: runIngest is idempotent given identical inputs', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('produces byte-identical IR, heatmap, and predraft output across two independent runs (hashed)', async () => {
    const { sessionDir } = await seedSessionDir();
    const projectA = seedProject();
    const projectB = seedProject();
    cleanup.push(sessionDir, projectA, projectB);

    const options = {
      ffmpegRunner: createFakeFfmpegRunner(), // see the helper's doc comment for why
      extractionOptions: { windowMs: 500, sampleIntervalMs: 500 },
      predraftEnv: {}, // the only path whose determinism ingest itself controls (see this PRD's report)
    };

    const resultA = await runIngest({ projectDir: projectA, sessionDir, ...options });
    const resultB = await runIngest({ projectDir: projectB, sessionDir, ...options });

    expect(resultB.stepCount).toBe(resultA.stepCount);
    expect(resultB.framesExtracted).toBe(resultA.framesExtracted);

    const irHashA = sha256File(resultA.irFilePath);
    const irHashB = sha256File(resultB.irFilePath);
    expect(irHashB).toBe(irHashA);

    const heatmapHashA = sha256File(resultA.heatmapFilePath);
    const heatmapHashB = sha256File(resultB.heatmapFilePath);
    expect(heatmapHashB).toBe(heatmapHashA);

    const predraftHashA = sha256File(resultA.predraftFilePath);
    const predraftHashB = sha256File(resultB.predraftFilePath);
    expect(predraftHashB).toBe(predraftHashA);

    // The IR content is identical even though it lives at two different
    // paths (two independent fresh projects) - proving idempotency is
    // about the CONTENT, not the filename, exactly as this PRD's report
    // documents.
    expect(readFileSync(resultA.irFilePath, 'utf8')).toBe(readFileSync(resultB.irFilePath, 'utf8'));
  }, 30_000);
});
