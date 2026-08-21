import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { RequestEvent } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetProjectDirCacheForTests } from '../../src/lib/server/project-context.js';
import { POST as postEvents } from '../../src/routes/waggle/sessions/[sessionId]/events/+server.js';
import { POST as postMeta } from '../../src/routes/waggle/sessions/[sessionId]/meta/+server.js';
import { POST as postChunk } from '../../src/routes/waggle/sessions/[sessionId]/video/chunks/[chunkIndex]/+server.js';
import {
  createSyntheticVideo,
  readSixStepEventsJsonl,
  readSixStepMeta,
  seedProjectDir,
} from '../helpers/fixtures.js';

/**
 * AC1, end to end at the HTTP-handler layer: drives the three `+server.ts`
 * routes with the EXACT request shapes
 * `apps/extension/src/lib/upload-client.ts` sends (method, URL path
 * pattern, body encoding), in the exact order the extension's own
 * `stopCapture` makes them (video chunks, then events, then meta - see
 * `apps/extension/test/lib/upload-client.test.ts` for the client-side
 * half of this same contract). This is the strongest available proof
 * that Studio's upload endpoints match what the extension actually
 * sends, short of running the real Chrome extension.
 */
function fakeEvent(params: Record<string, string>, request: Request): RequestEvent {
  return { params, request } as unknown as RequestEvent;
}

describe('AC1: extension upload contract against the real +server.ts handlers', () => {
  const cleanup: string[] = [];

  beforeEach(() => {
    resetProjectDirCacheForTests();
  });

  afterEach(() => {
    delete process.env.WAGGLE_PROJECT_DIR;
    resetProjectDirCacheForTests();
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('accepts chunked video, events, and meta uploads and ingests them into the project', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;

    const sessionId = 'route-e2e-session';
    const meta = readSixStepMeta();

    const scratch = path.join(projectDir, '..', 'scratch-video-route.mp4');
    createSyntheticVideo(scratch, 15);
    const videoBytes = readFileSync(scratch);
    rmSync(scratch);

    const half = Math.ceil(videoBytes.length / 2);
    const chunkBodies = [videoBytes.subarray(0, half), videoBytes.subarray(half)];

    for (const [index, chunk] of chunkBodies.entries()) {
      const request = new Request(
        `http://127.0.0.1:4310/waggle/sessions/${sessionId}/video/chunks/${index}`,
        {
          method: 'POST',
          headers: { 'content-type': 'video/webm' },
          body: chunk,
        },
      );
      const response = await postChunk(
        fakeEvent({ sessionId, chunkIndex: String(index) }, request),
      );
      expect(response.status).toBe(204);
    }

    const eventsRequest = new Request(`http://127.0.0.1:4310/waggle/sessions/${sessionId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-ndjson' },
      body: readSixStepEventsJsonl(),
    });
    const eventsResponse = await postEvents(fakeEvent({ sessionId }, eventsRequest));
    expect(eventsResponse.status).toBe(204);

    const metaRequest = new Request(`http://127.0.0.1:4310/waggle/sessions/${sessionId}/meta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...meta, sessionId }),
    });
    const metaResponse = await postMeta(fakeEvent({ sessionId }, metaRequest));
    expect(metaResponse.status).toBe(200);

    const body = (await metaResponse.json()) as {
      ok: boolean;
      irVersion: number;
      stepCount: number;
    };
    expect(body.ok).toBe(true);
    expect(body.irVersion).toBe(1);
    expect(body.stepCount).toBeGreaterThan(0);

    expect(existsSync(path.join(projectDir, 'walkthrough.v1.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'heatmap.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'predraft.json'))).toBe(true);
    expect(readdirSync(path.join(projectDir, 'steps', 'v1')).length).toBe(body.stepCount);
  }, 60_000);

  it('rejects a path-traversal session id on the chunk endpoint with 400', async () => {
    const projectDir = seedProjectDir();
    cleanup.push(projectDir);
    process.env.WAGGLE_PROJECT_DIR = projectDir;

    const request = new Request('http://127.0.0.1:4310/waggle/sessions/x/video/chunks/0', {
      method: 'POST',
      body: new Uint8Array([1, 2, 3]),
    });
    await expect(
      postChunk(fakeEvent({ sessionId: '../../evil', chunkIndex: '0' }, request)),
    ).rejects.toMatchObject({ status: 400 });
  });
});
