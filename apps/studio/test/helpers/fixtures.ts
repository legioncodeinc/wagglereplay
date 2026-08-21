import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultManifest, manifestPath } from '@waggle/ir';

/**
 * Test fixtures for `apps/studio`'s server-side modules. Rather than
 * inventing a second synthetic capture recording, these helpers read the
 * SAME real six-step recording `@waggle/ingest`'s own test suite uses
 * (`packages/ingest/test/fixtures/six-step-session`, generated from a real
 * `@waggle/extension` capture against the real fixture app - see that
 * package's `test/helpers/load-fixture.ts`). Reading the checked-in JSON
 * files directly (no import of `@waggle/extension` or `@waggle/ingest`'s
 * test helpers) keeps this package's dependency graph exactly what
 * production code needs, while still exercising Studio's upload pipeline
 * against a genuine recording end to end.
 */

const SIX_STEP_FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/ingest/test/fixtures/six-step-session',
);

export function readSixStepEventsJsonl(): string {
  return readFileSync(path.join(SIX_STEP_FIXTURE_DIR, 'events.jsonl'), 'utf8');
}

export function readSixStepMeta(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(SIX_STEP_FIXTURE_DIR, 'meta.json'), 'utf8'));
}

/** A fresh temp Waggle project directory with a valid `waggle.json` and nothing else. */
export function seedProjectDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-project-'));
  writeFileSync(
    manifestPath(dir),
    `${JSON.stringify(createDefaultManifest('demo'), null, 2)}\n`,
    'utf8',
  );
  return dir;
}

/**
 * A short, deterministic-content-irrelevant synthetic video, exactly the
 * pattern `packages/ingest/test/helpers/synthetic-video.ts` uses: only the
 * DURATION is asserted on anywhere in these tests, never pixel content.
 */
export function createSyntheticVideo(outPath: string, durationSeconds: number): void {
  const args = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=320x240:rate=2:duration=${String(durationSeconds)}`,
    '-pix_fmt',
    'yuv420p',
    outPath,
  ];
  const result = spawnSync('ffmpeg', args, { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg testsrc generation failed (status ${String(result.status)}): ${result.stderr.toString('utf8')}`,
    );
  }
}
