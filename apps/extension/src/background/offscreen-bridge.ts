/**
 * Offscreen document lifecycle (AC2).
 *
 * `MediaRecorder` must not run inside the service worker: a MV3 service
 * worker is torn down after ~30s idle, but a WebM recording can run for
 * minutes (corpus: capture-layer.md). `chrome.offscreen` documents have no
 * such lifetime cap, so the actual recorder lives in
 * `offscreen/recorder.ts` and this module's only job is making sure
 * exactly one offscreen document exists before the service worker asks it
 * to start recording.
 */

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

export interface OffscreenHost {
  hasDocument(): Promise<boolean>;
  createDocument(): Promise<void>;
  closeDocument(): Promise<void>;
}

/** The real `chrome.offscreen`-backed host, used in production. */
export function createChromeOffscreenHost(chromeApi: typeof chrome): OffscreenHost {
  return {
    async hasDocument() {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chromeApi.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
      });
      return contexts.length > 0;
    },
    async createDocument() {
      await chromeApi.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Records the active tab via MediaRecorder for walkthrough capture (AC2).',
      });
    },
    async closeDocument() {
      await chromeApi.offscreen.closeDocument();
    },
  };
}

/** Ensures exactly one offscreen document exists, creating it if needed. */
export async function ensureOffscreenDocument(host: OffscreenHost): Promise<void> {
  if (await host.hasDocument()) return;
  await host.createDocument();
}
