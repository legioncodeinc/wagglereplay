// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RuntimeMessage } from '../lib/messaging.js';
import { createUploadClient } from '../lib/upload-client.js';

/**
 * The offscreen tab recorder (AC2).
 *
 * Everything that touches `MediaRecorder`/`AudioContext`/`fetch` is behind
 * the `RecorderDeps` seam so `createTabRecorder` itself is unit-testable
 * with fake constructors (test/lib/offscreen-recorder.test.ts) - jsdom has
 * no real `MediaRecorder`, so this seam is required for coverage, not just
 * nice to have. `bootstrapOffscreenDocument` below is the thin production
 * wiring that only runs inside a real offscreen document.
 */

export interface RecorderDeps {
  MediaRecorderCtor: typeof MediaRecorder;
  AudioContextCtor: typeof AudioContext;
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  now: () => number;
  fetchFn?: typeof fetch;
  /** MediaRecorder `ondataavailable` fires this often, in ms. Default 1000ms chunks. */
  timesliceMs?: number;
  onMessage?: (message: RuntimeMessage) => void;
}

export interface StartRecordingRequest {
  sessionId: string;
  streamId: string;
  uploadOrigin: string;
}

export interface TabRecorder {
  start(request: StartRecordingRequest): Promise<void>;
  stop(): Promise<void>;
}

/**
 * `chrome.tabCapture.getMediaStreamId`'s stream ID is consumed with the
 * legacy `chromeMediaSource: 'tab'` mandatory constraint - the only API
 * that accepts it (https://developer.chrome.com/docs/extensions/reference/api/tabCapture).
 */
function tabCaptureConstraints(streamId: string): MediaStreamConstraints {
  return {
    audio: {
      // @ts-expect-error -- chromeMediaSource/chromeMediaSourceId are a
      // Chrome-only, non-standard extension to MediaTrackConstraints with
      // no lib.dom.d.ts typing.
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
    video: {
      // @ts-expect-error -- see above.
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId },
    },
  };
}

export function createTabRecorder(deps: RecorderDeps): TabRecorder {
  const timesliceMs = deps.timesliceMs ?? 1000;
  let mediaRecorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let stream: MediaStream | null = null;

  return {
    async start(request: StartRecordingRequest): Promise<void> {
      stream = await deps.getUserMedia(tabCaptureConstraints(request.streamId));

      // Tab audio capture mutes local playback unless re-routed through an
      // AudioContext back to the speakers (corpus: capture-layer.md).
      audioContext = new deps.AudioContextCtor();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(audioContext.destination);

      const uploadClient = createUploadClient({
        uploadOrigin: request.uploadOrigin,
        ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
      });

      const mimeType = pickSupportedMimeType(deps.MediaRecorderCtor);
      mediaRecorder = new deps.MediaRecorderCtor(stream, { mimeType });

      let chunkIndex = 0;
      let anchorEpochMs = 0;

      mediaRecorder.onstart = () => {
        // Anchor the video's t0 at the moment recording actually started,
        // not when `start()` was called (corpus: capture-layer.md).
        anchorEpochMs = deps.now();
        deps.onMessage?.({ kind: 'recorder:started', sessionId: request.sessionId, anchorEpochMs });
      };

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size === 0) return;
        const index = chunkIndex;
        chunkIndex += 1;
        uploadClient
          .uploadVideoChunk(request.sessionId, index, event.data)
          .catch((error: unknown) => {
            deps.onMessage?.({
              kind: 'recorder:error',
              sessionId: request.sessionId,
              message: error instanceof Error ? error.message : String(error),
            });
          });
      };

      mediaRecorder.onstop = () => {
        deps.onMessage?.({
          kind: 'recorder:stopped',
          sessionId: request.sessionId,
          durationMs: deps.now() - anchorEpochMs,
          chunkCount: chunkIndex,
          mimeType,
        });
      };

      mediaRecorder.start(timesliceMs);
    },

    async stop(): Promise<void> {
      mediaRecorder?.stop();
      for (const track of stream?.getTracks() ?? []) track.stop();
      await audioContext?.close();
      mediaRecorder = null;
      audioContext = null;
      stream = null;
    },
  };
}

const CANDIDATE_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickSupportedMimeType(MediaRecorderCtor: typeof MediaRecorder): string {
  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (MediaRecorderCtor.isTypeSupported?.(candidate)) return candidate;
  }
  return 'video/webm';
}

/** Production wiring: only called from offscreen.html's own module script. */
export function bootstrapOffscreenDocument(): void {
  const recorder = createTabRecorder({
    MediaRecorderCtor: MediaRecorder,
    AudioContextCtor: AudioContext,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    now: () => performance.timeOrigin + performance.now(),
    onMessage: (message) => chrome.runtime.sendMessage(message),
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    const runtimeMessage = message as RuntimeMessage;
    if (runtimeMessage.kind === 'offscreen:start-recording') {
      void recorder.start({
        sessionId: runtimeMessage.sessionId,
        streamId: runtimeMessage.streamId,
        uploadOrigin: runtimeMessage.uploadOrigin,
      });
    } else if (runtimeMessage.kind === 'offscreen:stop-recording') {
      void recorder.stop();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  bootstrapOffscreenDocument();
}
