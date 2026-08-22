// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CredentialMarking } from '../lib/credential-markings.js';
import { createPerformanceEpochSource, type EpochSource } from '../lib/epoch.js';
import type { CaptureEventDraft } from '../lib/events.js';
import type { RuntimeMessage } from '../lib/messaging.js';
import { createRippleOverlay, type RippleController } from './ripple-overlay.js';
import { attachTelemetry, type TelemetrySink } from './telemetry.js';

/**
 * The isolated-world content script entry point (AC3, AC7).
 *
 * `initContentScript` is dependency-injected on purpose: the production
 * bootstrap at the bottom of this file wires it to real `chrome.runtime`
 * messaging and a real `window`/`document`, but the exact same function is
 * what test/e2e/run-alignment-e2e.ts drives against a plain (non-extension)
 * Playwright page with a test sink standing in for `chrome.runtime`. That
 * is what "the real telemetry code, seam-injected media source" means for
 * AC8: this module never changes between the two.
 */

export interface ContentScriptDeps {
  window: Window & typeof globalThis;
  document: Document;
  sink: TelemetrySink;
  epochSource?: EpochSource;
  ripple?: RippleController;
  rippleEnabled?: boolean;
  pointerSampleIntervalMs?: number;
  scrollSampleIntervalMs?: number;
  stateChangeWindowMs?: number;
  credentialMarkings?: readonly CredentialMarking[];
}

export interface ContentScriptHandle {
  dispose(): void;
  ripple: RippleController;
}

export function initContentScript(deps: ContentScriptDeps): ContentScriptHandle {
  const epochSource = deps.epochSource ?? createPerformanceEpochSource(deps.window.performance);
  const ripple = deps.ripple ?? createRippleOverlay(deps.document);
  ripple.setEnabled(deps.rippleEnabled ?? true);

  const detachTelemetry = attachTelemetry({
    window: deps.window,
    document: deps.document,
    epochSource,
    sink: deps.sink,
    ripple,
    ...(deps.pointerSampleIntervalMs !== undefined
      ? { pointerSampleIntervalMs: deps.pointerSampleIntervalMs }
      : {}),
    ...(deps.scrollSampleIntervalMs !== undefined
      ? { scrollSampleIntervalMs: deps.scrollSampleIntervalMs }
      : {}),
    ...(deps.stateChangeWindowMs !== undefined
      ? { stateChangeWindowMs: deps.stateChangeWindowMs }
      : {}),
    ...(deps.credentialMarkings !== undefined
      ? { credentialMarkings: deps.credentialMarkings }
      : {}),
  });

  return {
    ripple,
    dispose() {
      detachTelemetry();
      ripple.dispose();
    },
  };
}

/** Builds a `TelemetrySink` that forwards each draft event to the background service worker. */
function createRuntimeSink(): TelemetrySink {
  return (event: CaptureEventDraft) => {
    chrome.runtime.sendMessage({ kind: 'telemetry:event', event } satisfies RuntimeMessage);
  };
}

// Production bootstrap: only runs when this file is actually loaded as an
// extension content script (a real `chrome.runtime` is present), never
// when imported as a module by unit tests or the e2e harness (both of
// which call `initContentScript` directly with their own sink).
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  let handle: ContentScriptHandle | null = null;

  chrome.runtime.onMessage.addListener((message: unknown) => {
    const runtimeMessage = message as RuntimeMessage;
    if (runtimeMessage.kind === 'capture:start' && !handle) {
      handle = initContentScript({
        window,
        document,
        sink: createRuntimeSink(),
        credentialMarkings: runtimeMessage.credentialMarkings,
      });
    } else if (runtimeMessage.kind === 'capture:stop' && handle) {
      handle.dispose();
      handle = null;
    } else if (runtimeMessage.kind === 'overlay:set' && handle) {
      handle.ripple.setEnabled(runtimeMessage.enabled);
    }
  });
}
