// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `@waggle/extension`: the Chrome MV3 capture extension (prd-003).
 *
 * This barrel exists for Node-side consumers - the seam-injected e2e
 * harness (test/e2e/run-alignment-e2e.ts), and eventually prd-004's ingest
 * step - that need the raw capture event schema, the session/finalizer
 * pair, or the pure telemetry-side logic without loading a `chrome.*`
 * global. The `chrome.*`-dependent modules (background/service-worker.ts,
 * offscreen/recorder.ts's bootstrap, content-script.ts's bootstrap) are
 * intentionally NOT re-exported here: they only make sense loaded as an
 * actual extension context and self-register on import.
 */

export {
  type ContentScriptDeps,
  type ContentScriptHandle,
  initContentScript,
} from './content/content-script.js';
export { createRippleOverlay, type RippleController } from './content/ripple-overlay.js';
export { attachTelemetry, type TelemetryOptions, type TelemetrySink } from './content/telemetry.js';
export {
  CREDENTIAL_FIELD_KINDS,
  type CredentialFieldKind,
  type CredentialMarking,
  CredentialMarkingSchema,
  explicitCredentialKind,
  fetchCredentialMarkings,
} from './lib/credential-markings.js';
export { type ElementSample, sampleElement } from './lib/element-sampler.js';
export {
  createPerformanceEpochSource,
  type EpochSource,
  epochFromTimeOrigin,
} from './lib/epoch.js';
export {
  CAPTURE_SCHEMA_VERSION,
  type CaptureEvent,
  type CaptureEventDraft,
  CaptureEventSchema,
  type GeneratedSelector,
  GeneratedSelectorSchema,
  type InputEvent,
  InputEventSchema,
  InputRedactionGeometrySchema,
  ROUTE_SOURCES,
  SELECTOR_KINDS,
  type SessionMeta,
  SessionMetaSchema,
} from './lib/events.js';
export {
  type FinalizeOptions,
  finalizeSession,
  type SessionOutput,
  type VideoSummary,
} from './lib/finalizer.js';
export {
  FIXED_INPUT_PLACEHOLDER,
  isCredentialField,
  type MaskedInput,
  maskInputValue,
} from './lib/masking.js';
export type { RuntimeMessage } from './lib/messaging.js';
export {
  type NetworkQuiescenceOptions,
  NetworkQuiescenceTracker,
  type QuiescenceEvent,
  type WebRequestLikeDetails,
} from './lib/network-quiescence.js';
export {
  boundedRedactionGeometry,
  type InputRedactionGeometry,
} from './lib/redaction-geometry.js';
export { generateSelectors } from './lib/selectors.js';
export { CaptureSession, type SessionInfo } from './lib/session.js';
export {
  observeStateChangeWindow,
  type StateChangeResult,
  type StateChangeWindowOptions,
} from './lib/state-change.js';
export {
  createUploadClient,
  DEFAULT_STUDIO_ORIGIN,
  type UploadClient,
} from './lib/upload-client.js';

// Deliberately NOT re-exported here: ./content/route-main-world.ts
// self-installs its history patch as soon as it is loaded in any context
// where `window` exists (which is how it must behave when a real
// extension host injects it into a page's MAIN world - MAIN-world scripts
// have no `chrome.*` global to gate on). Re-exporting it from this barrel
// would make importing `@waggle/extension` in a jsdom test an implicit,
// unwanted `history.pushState` patch. Import it directly from
// './content/route-main-world.js' when you specifically need
// `installRoutePatch`/`ROUTE_CHANGE_EVENT` (test/lib/route-main-world.test.ts
// does exactly that).
