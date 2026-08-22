// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';

/**
 * AC5 e2e coverage for `waggle record`: the real CLI wiring into
 * `@waggle/ingest`'s `runIngest`, run in-process exactly like
 * narrate-command.test.ts and e2e-init-and-stubs.test.ts do.
 *
 * The fixture events.jsonl/meta.json (a real, genuinely-captured 6-step
 * recording; see apps/extension/scripts/generate-ingest-fixture.ts's
 * header for provenance) are reused directly from
 * packages/ingest/test/fixtures rather than duplicated here: they are
 * checked-in test data, not runtime code, and packages/ingest's own test
 * suite (test/pipeline/run-ingest.test.ts) is the authority on ingest's
 * behavior against them. This test's job is narrower: prove the CLI
 * command itself resolves the project, requires --session, and
 * translates @waggle/ingest's outcomes into the documented exit codes.
 *
 * Every test that needs a full session COPIES those two files into its
 * own isolated temp directory and generates its own synthetic video
 * there, rather than writing a video file directly into the shared
 * fixtures/six-step-session directory. That directory is read by test
 * FILES in two different packages (packages/ingest's own suite and this
 * one), which `pnpm -r run test` runs concurrently in separate
 * processes; an earlier version of this file wrote the synthetic video
 * straight into the shared fixture directory and was caught failing
 * intermittently under a full `pnpm test` run because of exactly that
 * race (one process's video generation and cleanup stepping on another
 * process's read). A private per-test copy has no such neighbor.
 */
const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../ingest/test/fixtures/six-step-session',
);

function createSyntheticVideo(outPath: string, durationSeconds: number): void {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc=size=320x240:rate=2:duration=${String(durationSeconds)}`,
    '-pix_fmt',
    'yuv420p',
    outPath,
  ]);
  if (result.status !== 0) {
    throw new Error(`ffmpeg testsrc generation failed: ${result.stderr.toString('utf8')}`);
  }
}

describe('`waggle record` (e2e)', () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempParentDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-record-e2e-'));
    cleanupDirs.push(dir);
    return dir;
  }

  /** Copies the real fixture events.jsonl/meta.json into a fresh, private session dir and generates its own synthetic video. */
  function seedSessionDir(durationSeconds = 15): string {
    const sessionDir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-record-session-'));
    cleanupDirs.push(sessionDir);

    writeFileSync(
      path.join(sessionDir, 'meta.json'),
      readFileSync(path.join(fixtureDir, 'meta.json')),
    );
    writeFileSync(
      path.join(sessionDir, 'events.jsonl'),
      readFileSync(path.join(fixtureDir, 'events.jsonl')),
    );

    const meta = JSON.parse(readFileSync(path.join(fixtureDir, 'meta.json'), 'utf8')) as {
      video: { filename: string };
    };
    createSyntheticVideo(path.join(sessionDir, meta.video.filename), durationSeconds);

    return sessionDir;
  }

  it('exits INGEST_SESSION_REQUIRED pointing at the Studio extension flow when --session is omitted', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');

    const code = await runCli(['node', 'waggle', 'record', '--project', projectDir]);
    expect(code).toBe(ExitCode.INGEST_SESSION_REQUIRED);
  });

  it('exits PROJECT_NOT_FOUND before ever looking at --session, against a directory with no manifest', async () => {
    const parent = tempParentDir();
    const code = await runCli([
      'node',
      'waggle',
      'record',
      '--project',
      parent,
      '--session',
      fixtureDir,
    ]);
    expect(code).toBe(ExitCode.PROJECT_NOT_FOUND);
  });

  it('exits INGEST_INVALID_SESSION naming the missing file for a session directory with no meta.json', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    const emptySessionDir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-record-empty-session-'));
    cleanupDirs.push(emptySessionDir);

    const code = await runCli([
      'node',
      'waggle',
      'record',
      '--project',
      projectDir,
      '--session',
      emptySessionDir,
    ]);
    expect(code).toBe(ExitCode.INGEST_INVALID_SESSION);
  });

  it('ingests a real finished session into a valid IR v1 project state', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    const sessionDir = seedSessionDir();

    const code = await runCli([
      'node',
      'waggle',
      'record',
      '--project',
      projectDir,
      '--session',
      sessionDir,
    ]);
    expect(code).toBe(ExitCode.SUCCESS);

    expect(existsSync(path.join(projectDir, 'walkthrough.v1.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'heatmap.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'predraft.json'))).toBe(true);
  }, 60_000);

  it('a second `waggle record` against the same session writes v2, not v1 again (IR versions are immutable)', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    const sessionDir = seedSessionDir();

    const first = await runCli([
      'node',
      'waggle',
      'record',
      '--project',
      projectDir,
      '--session',
      sessionDir,
    ]);
    expect(first).toBe(ExitCode.SUCCESS);

    const second = await runCli([
      'node',
      'waggle',
      'record',
      '--project',
      projectDir,
      '--session',
      sessionDir,
    ]);
    expect(second).toBe(ExitCode.SUCCESS);

    expect(existsSync(path.join(projectDir, 'walkthrough.v1.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'walkthrough.v2.json'))).toBe(true);
    // v1 is untouched: re-running never mutates a prior immutable version.
    const v1First = readFileSync(path.join(projectDir, 'walkthrough.v1.json'), 'utf8');
    expect(v1First).toBeTruthy();
  }, 90_000);
});
