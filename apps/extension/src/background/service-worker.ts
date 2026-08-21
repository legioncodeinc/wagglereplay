import { fetchCredentialMarkings } from '../lib/credential-markings.js';
import { finalizeSession } from '../lib/finalizer.js';
import type { RuntimeMessage } from '../lib/messaging.js';
import { NetworkQuiescenceTracker, type WebRequestLikeDetails } from '../lib/network-quiescence.js';
import { CaptureSession } from '../lib/session.js';
import { createUploadClient, DEFAULT_STUDIO_ORIGIN } from '../lib/upload-client.js';
import { createChromeOffscreenHost, ensureOffscreenDocument } from './offscreen-bridge.js';

/**
 * The background service worker (AC1, AC2, AC5, AC6, AC7): the action
 * click that starts/stops capture, the single `CaptureSession` per active
 * recording, `webNavigation`/`webRequest` wiring, and the finalize-and-upload
 * step. This file is the one place every other module in this package is
 * wired together against real `chrome.*` APIs, so it is intentionally not
 * unit tested directly - `lib/session.ts`, `lib/network-quiescence.ts`, and
 * `lib/finalizer.ts` carry the logic this file only orchestrates, and each
 * of those is unit tested on its own. See test/e2e/run-alignment-e2e.ts for
 * how this orchestration is proven end to end.
 */

const ROUTE_MAIN_WORLD_FILE = 'route-main-world.js';
const RECORDER_STOP_TIMEOUT_MS = 5000;

interface ActiveCapture {
  session: CaptureSession;
  quiescence: NetworkQuiescenceTracker;
  removeWebRequestListeners: () => void;
  videoAnchorEpochMs: number | null;
  onRecorderStarted: ((anchorEpochMs: number) => void) | null;
  onRecorderStopped:
    | ((info: { durationMs: number; chunkCount: number; mimeType: string }) => void)
    | null;
}

const activeCaptures = new Map<number, ActiveCapture>();

function uploadOriginFor(): string {
  return DEFAULT_STUDIO_ORIGIN;
}

async function readRecordedViewport(tabId: number): Promise<{ w: number; h: number; dpr: number }> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }),
  });
  return (
    (result?.result as { w: number; h: number; dpr: number } | undefined) ?? { w: 0, h: 0, dpr: 1 }
  );
}

function wireNetworkQuiescence(
  tabId: number,
  session: CaptureSession,
): {
  tracker: NetworkQuiescenceTracker;
  remove: () => void;
} {
  const tracker = new NetworkQuiescenceTracker({
    onIdle: (event) => {
      session.record({
        type: 'settle',
        epochMs: event.epochMs,
        settle: { source: 'network-idle', ms: event.ms },
      });
    },
  });

  // A narrower structural shape than any single `chrome.webRequest.On*Details`
  // type: each of onBeforeRequest/onCompleted/onErrorOccurred/onHeadersReceived's
  // detail types satisfies this, even though @types/chrome does not treat
  // them as assignable to one another (their `documentLifecycle` field's
  // optionality differs across event types for reasons unrelated to what
  // this tracker actually reads).
  interface RawWebRequestDetails {
    requestId: string;
    tabId: number;
    type: string;
    url: string;
  }

  const toDetails = (details: RawWebRequestDetails): WebRequestLikeDetails => ({
    requestId: details.requestId,
    tabId: details.tabId,
    type: details.type,
    url: details.url,
  });

  const onBeforeRequest = (details: chrome.webRequest.OnBeforeRequestDetails): undefined => {
    tracker.onBeforeRequest(toDetails(details));
    return undefined;
  };
  const onCompleted = (details: chrome.webRequest.OnCompletedDetails): void =>
    tracker.onCompleted(toDetails(details));
  const onErrorOccurred = (details: chrome.webRequest.OnErrorOccurredDetails): void =>
    tracker.onErrorOccurred(toDetails(details));
  const onHeadersReceived = (details: chrome.webRequest.OnHeadersReceivedDetails): undefined => {
    const headers: Record<string, string> = {};
    for (const header of details.responseHeaders ?? []) {
      if (header.name && header.value) headers[header.name.toLowerCase()] = header.value;
    }
    tracker.onHeadersReceived(toDetails(details), headers);
    return undefined;
  };

  const filter: chrome.webRequest.RequestFilter = { urls: ['<all_urls>'], tabId };
  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, filter);
  chrome.webRequest.onCompleted.addListener(onCompleted, filter);
  chrome.webRequest.onErrorOccurred.addListener(onErrorOccurred, filter);
  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, filter, ['responseHeaders']);

  return {
    tracker,
    remove: () => {
      chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequest);
      chrome.webRequest.onCompleted.removeListener(onCompleted);
      chrome.webRequest.onErrorOccurred.removeListener(onErrorOccurred);
      chrome.webRequest.onHeadersReceived.removeListener(onHeadersReceived);
    },
  };
}

async function startCapture(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || activeCaptures.has(tab.id)) return;
  const tabId = tab.id;

  const sessionId = crypto.randomUUID();
  const startEpochMs = Date.now();
  const recordedViewport = await readRecordedViewport(tabId);
  const credentialMarkings = await fetchCredentialMarkings(uploadOriginFor()).catch(() => []);

  const session = new CaptureSession({
    sessionId,
    tabId,
    startEpochMs,
    initialUrl: tab.url ?? '',
    userAgent: navigator.userAgent,
    recordedViewport,
  });

  const { tracker, remove } = wireNetworkQuiescence(tabId, session);
  activeCaptures.set(tabId, {
    session,
    quiescence: tracker,
    removeWebRequestListeners: remove,
    videoAnchorEpochMs: null,
    onRecorderStarted: null,
    onRecorderStopped: null,
  });

  await ensureOffscreenDocument(createChromeOffscreenHost(chrome));
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  chrome.runtime.sendMessage({
    kind: 'offscreen:start-recording',
    sessionId,
    streamId,
    startEpochMs,
    uploadOrigin: uploadOriginFor(),
  } satisfies RuntimeMessage);

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [ROUTE_MAIN_WORLD_FILE],
    world: 'MAIN',
  });

  await chrome.tabs.sendMessage(tabId, {
    kind: 'capture:start',
    sessionId,
    startEpochMs,
    credentialMarkings,
  } satisfies RuntimeMessage);

  chrome.action.setBadgeText({ tabId, text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#e5484d' });
}

function waitForRecorderStopped(
  capture: ActiveCapture,
): Promise<{ durationMs: number; chunkCount: number; mimeType: string }> {
  return new Promise((resolve) => {
    capture.onRecorderStopped = resolve;
    setTimeout(
      () => resolve({ durationMs: 0, chunkCount: 0, mimeType: 'video/webm' }),
      RECORDER_STOP_TIMEOUT_MS,
    );
  });
}

async function stopCapture(tabId: number): Promise<void> {
  const capture = activeCaptures.get(tabId);
  if (!capture) return;
  activeCaptures.delete(tabId);
  capture.removeWebRequestListeners();

  await chrome.tabs
    .sendMessage(tabId, {
      kind: 'capture:stop',
      sessionId: capture.session.info.sessionId,
    } satisfies RuntimeMessage)
    .catch(() => undefined);

  const stoppedPromise = waitForRecorderStopped(capture);
  chrome.runtime.sendMessage({
    kind: 'offscreen:stop-recording',
    sessionId: capture.session.info.sessionId,
  } satisfies RuntimeMessage);
  const videoInfo = await stoppedPromise;

  const { eventsJsonl, meta } = finalizeSession({
    session: capture.session,
    video: {
      filename: `${capture.session.info.sessionId}.webm`,
      mimeType: videoInfo.mimeType,
      anchorEpochMs: capture.videoAnchorEpochMs ?? capture.session.info.startEpochMs,
      durationMs: videoInfo.durationMs,
      chunkCount: videoInfo.chunkCount,
    },
  });

  const uploadClient = createUploadClient({ uploadOrigin: uploadOriginFor() });
  await uploadClient.uploadEvents(capture.session.info.sessionId, eventsJsonl);
  await uploadClient.uploadMeta(capture.session.info.sessionId, meta);

  chrome.action.setBadgeText({ tabId, text: '' });
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  if (activeCaptures.has(tab.id)) {
    void stopCapture(tab.id);
  } else {
    void startCapture(tab);
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  const capture = activeCaptures.get(details.tabId);
  if (!capture || details.frameId !== 0) return;
  capture.session.record({
    type: 'route',
    epochMs: Date.now(),
    before: capture.session.info.initialUrl,
    after: details.url,
    source: 'webNavigation',
  });
});

chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  const capture = activeCaptures.get(details.tabId);
  if (!capture || details.frameId !== 0) return;
  capture.session.record({
    type: 'route',
    epochMs: Date.now(),
    before: capture.session.info.initialUrl,
    after: details.url,
    source: 'webNavigation',
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const runtimeMessage = message as RuntimeMessage;
  const tabId = sender.tab?.id;

  if (runtimeMessage.kind === 'telemetry:event' && tabId !== undefined) {
    activeCaptures.get(tabId)?.session.record(runtimeMessage.event);
    return;
  }

  // Messages from the offscreen document carry no `sender.tab`; look the
  // capture up by sessionId instead.
  if (runtimeMessage.kind === 'recorder:started') {
    for (const capture of activeCaptures.values()) {
      if (capture.session.info.sessionId !== runtimeMessage.sessionId) continue;
      capture.videoAnchorEpochMs = runtimeMessage.anchorEpochMs;
      capture.onRecorderStarted?.(runtimeMessage.anchorEpochMs);
    }
  } else if (runtimeMessage.kind === 'recorder:stopped') {
    for (const capture of activeCaptures.values()) {
      if (capture.session.info.sessionId !== runtimeMessage.sessionId) continue;
      capture.onRecorderStopped?.({
        durationMs: runtimeMessage.durationMs,
        chunkCount: runtimeMessage.chunkCount,
        mimeType: runtimeMessage.mimeType,
      });
    }
  }
});
