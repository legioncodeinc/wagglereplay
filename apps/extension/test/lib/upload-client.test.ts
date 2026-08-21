import { describe, expect, it, vi } from 'vitest';
import { createUploadClient } from '../../src/lib/upload-client.js';

describe('createUploadClient', () => {
  it('POSTs a video chunk to the sessions/:id/video/chunks/:index path', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createUploadClient({ uploadOrigin: 'http://127.0.0.1:4310', fetchFn });

    const chunk = new Blob(['abc'], { type: 'video/webm' });
    await client.uploadVideoChunk('session-1', 3, chunk);

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:4310/waggle/sessions/session-1/video/chunks/3',
      expect.objectContaining({ method: 'POST', body: chunk }),
    );
  });

  it('POSTs events.jsonl as ndjson', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createUploadClient({ uploadOrigin: 'http://127.0.0.1:4310', fetchFn });

    await client.uploadEvents('session-1', '{"a":1}\n{"a":2}');

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:4310/waggle/sessions/session-1/events');
    expect(init.headers).toMatchObject({ 'content-type': 'application/x-ndjson' });
  });

  it('POSTs meta.json as JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const client = createUploadClient({ uploadOrigin: 'http://127.0.0.1:4310', fetchFn });

    await client.uploadMeta('session-1', {
      schemaVersion: 1,
      sessionId: 'session-1',
      startEpochMs: 0,
      generatedAt: new Date().toISOString(),
      tabId: 1,
      initialUrl: 'http://x/',
      userAgent: 'vitest',
      recordedViewport: { w: 1, h: 1, dpr: 1 },
      video: {
        filename: 'x.webm',
        mimeType: 'video/webm',
        anchorEpochMs: 0,
        durationMs: 0,
        chunkCount: 0,
      },
      eventCount: 0,
    });

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ sessionId: 'session-1' });
  });

  it('throws when the server responds with a non-2xx status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const client = createUploadClient({ uploadOrigin: 'http://127.0.0.1:4310', fetchFn });
    await expect(client.uploadEvents('session-1', '')).rejects.toThrow(/HTTP 500/);
  });
});
