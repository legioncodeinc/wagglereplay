import { CaptureEventSchema, type SessionMeta, SessionMetaSchema } from './events.js';
import type { CaptureSession } from './session.js';

/**
 * Session finalizer (AC7): turns an accumulated `CaptureSession` into the
 * two files this extension hands off to prd-004's ingest step -
 * `events.jsonl` (one JSON `CaptureEvent` per line, `seq`-ordered) and
 * `meta.json` (session-level metadata, `SessionMetaSchema`). Both are
 * validated before being returned: a session this function accepts can be
 * written to disk (by the Studio server, over the chunked upload) with no
 * further checking on the receiving end.
 */

export interface VideoSummary {
  filename: string;
  mimeType: string;
  anchorEpochMs: number;
  durationMs: number;
  chunkCount: number;
}

export interface FinalizeOptions {
  session: CaptureSession;
  video: VideoSummary;
  generatedAt?: string;
}

export interface SessionOutput {
  eventsJsonl: string;
  meta: SessionMeta;
}

/** Builds and validates the `events.jsonl` body and the `meta.json` object for a finished session. */
export function finalizeSession(options: FinalizeOptions): SessionOutput {
  const events = options.session.snapshot();

  const eventsJsonl = events
    .map((event) => JSON.stringify(CaptureEventSchema.parse(event)))
    .join('\n');

  const meta = SessionMetaSchema.parse({
    schemaVersion: 1,
    sessionId: options.session.info.sessionId,
    startEpochMs: options.session.info.startEpochMs,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    tabId: options.session.info.tabId,
    initialUrl: options.session.info.initialUrl,
    userAgent: options.session.info.userAgent,
    recordedViewport: options.session.info.recordedViewport,
    video: options.video,
    eventCount: events.length,
    ...(options.session.info.fixtureVariant
      ? { fixtureVariant: options.session.info.fixtureVariant }
      : {}),
  });

  return { eventsJsonl, meta };
}
