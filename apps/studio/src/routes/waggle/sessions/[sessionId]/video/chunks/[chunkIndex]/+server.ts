// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, type RequestHandler } from '@sveltejs/kit';
import {
  InvalidChunkIndexError,
  InvalidSessionIdError,
  writeVideoChunk,
} from '$lib/server/sessions.js';

/**
 * AC1: `POST /waggle/sessions/:sessionId/video/chunks/:chunkIndex`.
 *
 * Matches `apps/extension/src/lib/upload-client.ts`'s
 * `uploadVideoChunk(sessionId, chunkIndex, chunk)` exactly: a raw
 * `video/webm` body, one call per `MediaRecorder` timeslice
 * (`apps/extension/src/offscreen/recorder.ts`). The body is written
 * straight to a temp session workspace; see `$lib/server/sessions.ts` for
 * why raw sessions never land inside the project directory itself.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const sessionId = params.sessionId ?? '';
  const chunkIndex = params.chunkIndex ?? '';
  const body = new Uint8Array(await request.arrayBuffer());

  try {
    writeVideoChunk(sessionId, chunkIndex, body);
  } catch (err) {
    if (err instanceof InvalidSessionIdError || err instanceof InvalidChunkIndexError) {
      error(400, err.message);
    }
    throw err;
  }

  return new Response(null, { status: 204 });
};
