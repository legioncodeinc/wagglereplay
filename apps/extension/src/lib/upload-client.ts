import type { SessionMeta } from './events.js';

/**
 * Chunked upload to the local Studio server (AC2, AC7).
 *
 * The extension never writes to disk itself (a MV3 service worker and
 * offscreen document have no filesystem access); every artifact - video
 * chunks, `events.jsonl`, `meta.json` - is POSTed to a localhost endpoint
 * that prd-005's Studio server owns. Studio's exact port and route shape
 * are prd-005's to define; the origin and paths here are this Bee's
 * documented placeholder contract, overridable via `uploadOrigin` (the
 * offscreen recorder and background service worker both take it as a
 * parameter rather than hardcoding it, so prd-005 can change it without
 * touching this package). `fetch` is injected so this module needs no
 * running server to unit test.
 */

export const DEFAULT_STUDIO_ORIGIN = 'http://127.0.0.1:4310';

export interface UploadClientOptions {
  uploadOrigin: string;
  fetchFn?: typeof fetch;
}

export interface UploadClient {
  uploadVideoChunk(sessionId: string, chunkIndex: number, chunk: Blob): Promise<void>;
  uploadEvents(sessionId: string, eventsJsonl: string): Promise<void>;
  uploadMeta(sessionId: string, meta: SessionMeta): Promise<void>;
}

function sessionUrl(origin: string, sessionId: string, path: string): string {
  return `${origin}/waggle/sessions/${encodeURIComponent(sessionId)}/${path}`;
}

async function assertOk(response: Response, what: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`upload-client: ${what} failed with HTTP ${response.status}`);
  }
}

/** Builds an `UploadClient` bound to `options.uploadOrigin`. */
export function createUploadClient(options: UploadClientOptions): UploadClient {
  const fetchFn = options.fetchFn ?? fetch;
  const origin = options.uploadOrigin;

  return {
    async uploadVideoChunk(sessionId, chunkIndex, chunk) {
      const response = await fetchFn(sessionUrl(origin, sessionId, `video/chunks/${chunkIndex}`), {
        method: 'POST',
        headers: { 'content-type': 'video/webm' },
        body: chunk,
      });
      await assertOk(response, `video chunk ${chunkIndex}`);
    },

    async uploadEvents(sessionId, eventsJsonl) {
      const response = await fetchFn(sessionUrl(origin, sessionId, 'events'), {
        method: 'POST',
        headers: { 'content-type': 'application/x-ndjson' },
        body: eventsJsonl,
      });
      await assertOk(response, 'events.jsonl');
    },

    async uploadMeta(sessionId, meta) {
      const response = await fetchFn(sessionUrl(origin, sessionId, 'meta'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(meta),
      });
      await assertOk(response, 'meta.json');
    },
  };
}
