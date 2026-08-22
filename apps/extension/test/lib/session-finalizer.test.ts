// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { CaptureEventSchema, SessionMetaSchema } from '../../src/lib/events.js';
import { finalizeSession } from '../../src/lib/finalizer.js';
import { CaptureSession } from '../../src/lib/session.js';

function buildSession(): CaptureSession {
  return new CaptureSession({
    sessionId: 'session-1',
    tabId: 7,
    startEpochMs: 1_700_000_000_000,
    initialUrl: 'http://127.0.0.1:1234/',
    userAgent: 'vitest',
    recordedViewport: { w: 1280, h: 800, dpr: 1 },
  });
}

describe('CaptureSession', () => {
  it('assigns monotonic seq numbers and fills in tabId', () => {
    const session = buildSession();
    const first = session.record({ type: 'pointermove', epochMs: 1, x: 1, y: 2 });
    const second = session.record({ type: 'pointermove', epochMs: 2, x: 3, y: 4 });

    expect(first.seq).toBe(0);
    expect(second.seq).toBe(1);
    expect(first.tabId).toBe(7);
    expect(session.eventCount).toBe(2);
  });

  it('rejects a malformed event immediately rather than storing it', () => {
    const session = buildSession();
    expect(() =>
      // @ts-expect-error -- intentionally missing required fields for this test
      session.record({ type: 'click', epochMs: -1 }),
    ).toThrow();
    expect(session.eventCount).toBe(0);
  });

  it('rejects credential input events without bounded redaction geometry', () => {
    const session = buildSession();
    expect(() =>
      session.record({
        type: 'input',
        epochMs: 1_700_000_000_010,
        inputType: 'insertText',
        selectors: [{ type: 'css', value: '#password' }],
        value: { placeholder: '[REDACTED]', masked: true },
        credential: true,
        // @ts-expect-error -- missing redaction is the malformed boundary under test
        redaction: undefined,
      }),
    ).toThrow();
    expect(session.eventCount).toBe(0);
  });

  it('snapshot() returns a defensive copy', () => {
    const session = buildSession();
    session.record({ type: 'pointermove', epochMs: 1, x: 0, y: 0 });
    const snapshot = session.snapshot();
    snapshot.pop();
    expect(session.eventCount).toBe(1);
  });
});

describe('finalizeSession', () => {
  it('produces a valid events.jsonl body and meta.json object', () => {
    const session = buildSession();
    session.record({ type: 'pointermove', epochMs: 1_700_000_000_010, x: 1, y: 2 });
    session.record({
      type: 'route',
      epochMs: 1_700_000_000_050,
      before: 'http://127.0.0.1:1234/',
      after: 'http://127.0.0.1:1234/login',
      source: 'history',
    });

    const { eventsJsonl, meta } = finalizeSession({
      session,
      video: {
        filename: 'session-1.webm',
        mimeType: 'video/webm;codecs=vp8,opus',
        anchorEpochMs: 1_700_000_000_005,
        durationMs: 1200,
        chunkCount: 2,
      },
    });

    const lines = eventsJsonl.split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => CaptureEventSchema.parse(JSON.parse(line))).not.toThrow();
    }

    expect(() => SessionMetaSchema.parse(meta)).not.toThrow();
    expect(meta.eventCount).toBe(2);
    expect(meta.sessionId).toBe('session-1');
    expect(meta.video.chunkCount).toBe(2);
  });

  it('produces an empty events.jsonl body for a session with no events', () => {
    const session = buildSession();
    const { eventsJsonl, meta } = finalizeSession({
      session,
      video: {
        filename: 'session-1.webm',
        mimeType: 'video/webm',
        anchorEpochMs: session.info.startEpochMs,
        durationMs: 0,
        chunkCount: 0,
      },
    });
    expect(eventsJsonl).toBe('');
    expect(meta.eventCount).toBe(0);
  });
});
