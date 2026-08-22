// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, type RequestHandler } from '@sveltejs/kit';
import { InvalidSessionIdError, writeSessionEvents } from '$lib/server/sessions.js';

/**
 * AC1: `POST /waggle/sessions/:sessionId/events`.
 *
 * Matches `apps/extension/src/lib/upload-client.ts`'s
 * `uploadEvents(sessionId, eventsJsonl)`: one call, the whole
 * `events.jsonl` body as `application/x-ndjson` text
 * (`apps/extension/src/lib/finalizer.ts`'s `finalizeSession` already
 * validated and `seq`-ordered it before the extension sent it - see that
 * module's doc comment: "written to disk... with no further checking on
 * the receiving end"). `@waggle/ingest`'s `loadSession` re-validates it
 * anyway once ingest actually runs, which is the right layer to reject a
 * malformed line, not this pass-through upload.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const sessionId = params.sessionId ?? '';
  const eventsJsonl = await request.text();

  try {
    writeSessionEvents(sessionId, eventsJsonl);
  } catch (err) {
    if (err instanceof InvalidSessionIdError) {
      error(400, err.message);
    }
    throw err;
  }

  return new Response(null, { status: 204 });
};
