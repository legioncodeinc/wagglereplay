// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CredentialMarking } from './credential-markings.js';
import type { CaptureEventDraft } from './events.js';

/**
 * The runtime message protocol between the three extension contexts
 * (content script, background service worker, offscreen document). MV3
 * keeps these contexts isolated: `chrome.runtime.sendMessage` /
 * `chrome.runtime.onMessage` is the only channel between them (a MAIN
 * world page script talks to the content script over `window.postMessage`
 * instead, see content/route-main-world.ts).
 *
 * Kept as one discriminated union so a handler's `switch (message.kind)`
 * is exhaustively checked by the compiler.
 */

export interface CaptureStartMessage {
  kind: 'capture:start';
  sessionId: string;
  startEpochMs: number;
  credentialMarkings: readonly CredentialMarking[];
}

export interface CaptureStopMessage {
  kind: 'capture:stop';
  sessionId: string;
}

export interface TelemetryEventMessage {
  kind: 'telemetry:event';
  /**
   * Missing `seq`/`tabId`: the background service worker owns the single
   * `CaptureSession` for the tab and assigns both on receipt, so events
   * arriving from content-script telemetry, from `webNavigation`, and from
   * the network-quiescence tracker all land in one consistent sequence.
   */
  event: CaptureEventDraft;
}

export interface OverlaySetMessage {
  kind: 'overlay:set';
  enabled: boolean;
}

export interface OffscreenStartRecordingMessage {
  kind: 'offscreen:start-recording';
  sessionId: string;
  streamId: string;
  startEpochMs: number;
  uploadOrigin: string;
}

export interface OffscreenStopRecordingMessage {
  kind: 'offscreen:stop-recording';
  sessionId: string;
}

export interface RecorderStartedMessage {
  kind: 'recorder:started';
  sessionId: string;
  /** Epoch ms sampled at MediaRecorder.onstart: the video's t0. */
  anchorEpochMs: number;
}

export interface RecorderChunkUploadedMessage {
  kind: 'recorder:chunk-uploaded';
  sessionId: string;
  chunkIndex: number;
}

export interface RecorderStoppedMessage {
  kind: 'recorder:stopped';
  sessionId: string;
  durationMs: number;
  chunkCount: number;
  mimeType: string;
}

export interface RecorderErrorMessage {
  kind: 'recorder:error';
  sessionId: string;
  message: string;
}

export type RuntimeMessage =
  | CaptureStartMessage
  | CaptureStopMessage
  | TelemetryEventMessage
  | OverlaySetMessage
  | OffscreenStartRecordingMessage
  | OffscreenStopRecordingMessage
  | RecorderStartedMessage
  | RecorderChunkUploadedMessage
  | RecorderStoppedMessage
  | RecorderErrorMessage;

/** A destination content scripts, background, and offscreen all send `RuntimeMessage`s to. */
export interface MessageSink {
  send(message: RuntimeMessage): void;
}
