// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeMessage } from '../../src/lib/messaging.js';
import { createTabRecorder } from '../../src/offscreen/recorder.js';

class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

class FakeStream {
  private readonly tracks = [new FakeTrack(), new FakeTrack()];
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
}

class FakeMediaRecorder {
  static isTypeSupported(type: string): boolean {
    return type === 'video/webm;codecs=vp8,opus';
  }
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  startedTimeslice: number | undefined;

  constructor(
    public stream: unknown,
    public options: { mimeType: string },
  ) {}

  start(timeslice?: number): void {
    this.startedTimeslice = timeslice;
    this.onstart?.();
  }

  stop(): void {
    this.onstop?.();
  }
}

class FakeAudioContext {
  closed = false;
  connectedTo: unknown = null;
  destination = { fake: 'destination' };

  createMediaStreamSource(_stream: unknown): { connect: (dest: unknown) => void } {
    return {
      connect: (dest: unknown) => {
        this.connectedTo = dest;
      },
    };
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

describe('createTabRecorder', () => {
  it('starts recording, anchors the epoch at onstart, and re-routes audio through AudioContext', async () => {
    const messages: RuntimeMessage[] = [];
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    let recorderInstance: FakeMediaRecorder | undefined;
    let audioContextInstance: FakeAudioContext | undefined;

    const recorder = createTabRecorder({
      MediaRecorderCtor: class extends FakeMediaRecorder {
        constructor(stream: unknown, options: { mimeType: string }) {
          super(stream, options);
          recorderInstance = this;
        }
      } as unknown as typeof MediaRecorder,
      AudioContextCtor: class extends FakeAudioContext {
        constructor() {
          super();
          audioContextInstance = this;
        }
      } as unknown as typeof AudioContext,
      getUserMedia: () => Promise.resolve(new FakeStream() as unknown as MediaStream),
      now: () => 1_700_000_000_000,
      fetchFn,
      onMessage: (message) => messages.push(message),
    });

    await recorder.start({
      sessionId: 's1',
      streamId: 'stream-1',
      uploadOrigin: 'http://127.0.0.1:4310',
    });

    expect(audioContextInstance?.connectedTo).toBe(audioContextInstance?.destination);
    expect(recorderInstance?.options.mimeType).toBe('video/webm;codecs=vp8,opus');

    const started = messages.find((m) => m.kind === 'recorder:started');
    expect(started).toMatchObject({
      kind: 'recorder:started',
      sessionId: 's1',
      anchorEpochMs: 1_700_000_000_000,
    });

    // Simulate MediaRecorder delivering two chunks.
    recorderInstance?.ondataavailable?.({ data: new Blob(['a'], { type: 'video/webm' }) });
    recorderInstance?.ondataavailable?.({ data: new Blob(['b'], { type: 'video/webm' }) });
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:4310/waggle/sessions/s1/video/chunks/0',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:4310/waggle/sessions/s1/video/chunks/1',
      expect.objectContaining({ method: 'POST' }),
    );

    await recorder.stop();

    const stopped = messages.find((m) => m.kind === 'recorder:stopped');
    expect(stopped).toMatchObject({ kind: 'recorder:stopped', sessionId: 's1', chunkCount: 2 });
    expect(audioContextInstance?.closed).toBe(true);
  });

  it('ignores zero-byte chunks', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    let recorderInstance: FakeMediaRecorder | undefined;

    const recorder = createTabRecorder({
      MediaRecorderCtor: class extends FakeMediaRecorder {
        constructor(stream: unknown, options: { mimeType: string }) {
          super(stream, options);
          recorderInstance = this;
        }
      } as unknown as typeof MediaRecorder,
      AudioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
      getUserMedia: () => Promise.resolve(new FakeStream() as unknown as MediaStream),
      now: () => 0,
      fetchFn,
    });

    await recorder.start({
      sessionId: 's2',
      streamId: 'stream-2',
      uploadOrigin: 'http://127.0.0.1:4310',
    });
    recorderInstance?.ondataavailable?.({ data: new Blob([], { type: 'video/webm' }) });
    await Promise.resolve();

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
