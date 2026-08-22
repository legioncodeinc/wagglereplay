// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { FrameExtractionError, IngestSessionError } from '@waggle/ingest';
import { getProjectDir } from '$lib/server/project-context.js';
import {
  finalizeSession,
  InvalidSessionIdError,
  InvalidSessionMetaError,
} from '$lib/server/sessions.js';

/**
 * AC1: `POST /waggle/sessions/:sessionId/meta`.
 *
 * Matches `apps/extension/src/lib/upload-client.ts`'s
 * `uploadMeta(sessionId, meta)`: this is the LAST call
 * `stopCapture` makes (`apps/extension/src/background/service-worker.ts`),
 * after every video chunk and `events.jsonl` are already uploaded, so it
 * doubles as the session's finalize signal. Assembles the video, then runs
 * `@waggle/ingest`'s full pipeline (`$lib/server/sessions.ts`'s
 * `finalizeSession`), writing the next Walkthrough IR version plus
 * `heatmap.json`/`predraft.json` straight into the project directory.
 *
 * Always answers with an HTTP status the extension's `assertOk` accepts
 * (it only checks `response.ok`) so a capture never appears to fail from
 * the recorder's point of view for a reason unrelated to the upload
 * itself; ingest failures are reported in the JSON body for Studio's own
 * UI (and server logs) rather than by making the upload look rejected.
 */
export const POST: RequestHandler = async ({ params, request }) => {
  const sessionId = params.sessionId ?? '';
  const projectDir = getProjectDir();

  let metaRaw: unknown;
  try {
    metaRaw = await request.json();
  } catch {
    error(400, 'meta.json body is not valid JSON.');
  }

  try {
    const result = await finalizeSession(projectDir, sessionId, metaRaw);
    return json({
      ok: true,
      irVersion: result.ingest.irVersion,
      stepCount: result.ingest.stepCount,
      framesExtracted: result.ingest.framesExtracted,
      warnings: result.ingest.warnings,
    });
  } catch (err) {
    if (err instanceof InvalidSessionIdError || err instanceof InvalidSessionMetaError) {
      error(400, err.message);
    }
    if (err instanceof IngestSessionError || err instanceof FrameExtractionError) {
      // The upload itself succeeded; ingest could not turn it into a
      // project state. Reported at 200 (see doc comment) with `ok: false`
      // and the exact reason, mirroring how `waggle record` surfaces the
      // same error class as a named exit code rather than a bare 500.
      return json({ ok: false, reason: err.message }, { status: 200 });
    }
    throw err;
  }
};
