import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { manifestPath, WaggleManifestSchema } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import {
  finalizeSession,
  InvalidChunkIndexError,
  InvalidSessionIdError,
  InvalidSessionMetaError,
  writeSessionEvents,
  writeVideoChunk,
} from '../../../src/lib/server/sessions.js';
import {
  createSyntheticVideo,
  readSixStepEventsJsonl,
  readSixStepMeta,
  seedProjectDir,
} from '../../helpers/fixtures.js';

/**
 * AC1 end-to-end proof: this is the exact call sequence
 * `apps/extension/src/lib/upload-client.ts` makes against Studio's upload
 * endpoints (video chunks, then events, then meta), driven straight at the
 * server module the `+server.ts` routes call, against the real six-step
 * fixture recording `@waggle/ingest`'s own test suite uses. A real video
 * file's bytes are split into several chunks to prove chunk reassembly
 * reconstructs the exact original file `@waggle/ingest`'s `runIngest` can
 * then extract keyframes from.
 */
describe('AC1: sessions.ts end to end (real ffmpeg, real fixture recording)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('assembles chunked video + events + meta and runs ingest into the project directory', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);

    const sessionId = 'studio-e2e-session';
    const meta = readSixStepMeta();
    const videoFilename = (meta.video as { filename: string }).filename;

    const scratch = path.join(projectDir, '..', 'scratch-video.mp4');
    createSyntheticVideo(scratch, 15);
    const videoBytes = readFileSync(scratch);
    rmSync(scratch);

    // Split into three chunks, matching the shape of several
    // MediaRecorder timeslices rather than one big upload.
    const third = Math.ceil(videoBytes.length / 3);
    const chunks = [
      videoBytes.subarray(0, third),
      videoBytes.subarray(third, third * 2),
      videoBytes.subarray(third * 2),
    ];
    chunks.forEach((chunk, index) => {
      writeVideoChunk(sessionId, String(index), new Uint8Array(chunk));
    });

    writeSessionEvents(sessionId, readSixStepEventsJsonl());

    const result = await finalizeSession(projectDir, sessionId, { ...meta, sessionId });

    expect(result.ingest.irVersion).toBe(1);
    expect(result.ingest.stepCount).toBeGreaterThan(0);
    expect(existsSync(manifestPath(projectDir))).toBe(true);

    const manifest = WaggleManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath(projectDir), 'utf8')),
    );
    expect(manifest.currentIrVersion).toBe(1);
    expect(existsSync(path.join(projectDir, 'heatmap.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'predraft.json'))).toBe(true);

    const stepDirs = readdirSync(path.join(projectDir, 'steps', 'v1'));
    expect(stepDirs.length).toBe(result.ingest.stepCount);

    // The temp session workspace must not survive finalize: no raw
    // capture data is part of the ADR-015 project layout.
    expect(existsSync(result.sessionDir)).toBe(false);
    void videoFilename;
  }, 60_000);

  it('rejects a path-traversal session id before touching the filesystem', () => {
    expect(() => writeVideoChunk('../../evil', '0', new Uint8Array())).toThrow(
      InvalidSessionIdError,
    );
  });

  it('rejects a non-numeric chunk index', () => {
    expect(() => writeVideoChunk('session-1', 'not-a-number', new Uint8Array())).toThrow(
      InvalidChunkIndexError,
    );
  });

  it('rejects meta.json with no video.filename', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    await expect(
      finalizeSession(projectDir, 'session-missing-filename', { video: {} }),
    ).rejects.toThrow(InvalidSessionMetaError);
  });

  it('rejects a video.filename that could traverse out of the session workspace', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    await expect(
      finalizeSession(projectDir, 'session-traversal', { video: { filename: '../../evil.webm' } }),
    ).rejects.toThrow(InvalidSessionMetaError);
  });
});
