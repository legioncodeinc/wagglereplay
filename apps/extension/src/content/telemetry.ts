import { type CredentialMarking, explicitCredentialKind } from '../lib/credential-markings.js';
import { sampleElement } from '../lib/element-sampler.js';
import type { EpochSource } from '../lib/epoch.js';
import { epochFromTimeOrigin } from '../lib/epoch.js';
import type { CaptureEventDraft } from '../lib/events.js';
import { isCredentialField, maskInputValue } from '../lib/masking.js';
import { boundedRedactionGeometry } from '../lib/redaction-geometry.js';
import { generateSelectors } from '../lib/selectors.js';
import { observeStateChangeWindow } from '../lib/state-change.js';
import type { RippleController } from './ripple-overlay.js';
import { ROUTE_CHANGE_EVENT, type RouteChangeDetail } from './route-main-world.js';

/**
 * Content-script telemetry (AC3): click, 30 Hz pointermove, scroll, and
 * masked input, capture-phase so nothing the page itself does (a
 * `stopPropagation()` in a bubble-phase handler) can hide an interaction
 * from the recorder. Every event's `epochMs` goes through
 * `epochFromTimeOrigin` (../lib/epoch.ts) so it lands on the same master
 * timeline as the video (see offscreen/recorder.ts) and `webNavigation`
 * events (see background/service-worker.ts).
 */

export type TelemetrySink = (event: CaptureEventDraft) => void;

export interface TelemetryOptions {
  window: Window & typeof globalThis;
  document: Document;
  epochSource: EpochSource;
  sink: TelemetrySink;
  ripple?: RippleController;
  /** Minimum gap between recorded pointermove samples, ms. Default ~33ms (30 Hz). */
  pointerSampleIntervalMs?: number;
  /** Minimum gap between recorded scroll samples, ms. Default 100ms. */
  scrollSampleIntervalMs?: number;
  /** How long to watch a route-less click for an in-place DOM change, ms. Default 300ms. */
  stateChangeWindowMs?: number;
  /** Project-authored selector roles for the bound credential set. */
  credentialMarkings?: readonly CredentialMarking[];
}

const POINTER_BUTTON_BY_INDEX = ['primary', 'auxiliary', 'secondary', 'back', 'forward'] as const;

function pointerButtonFor(event: MouseEvent): (typeof POINTER_BUTTON_BY_INDEX)[number] {
  return POINTER_BUTTON_BY_INDEX[event.button] ?? 'primary';
}

function isFormField(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
}

/** Wires every telemetry listener onto `options.document`/`options.window`. Returns a disposer. */
export function attachTelemetry(options: TelemetryOptions): () => void {
  const { window: win, document: doc, epochSource, sink, ripple } = options;
  const pointerIntervalMs = options.pointerSampleIntervalMs ?? 1000 / 30;
  const scrollIntervalMs = options.scrollSampleIntervalMs ?? 100;
  const stateChangeWindowMs = options.stateChangeWindowMs ?? 300;

  let lastPointerSampleEpoch = 0;
  let lastScrollSampleEpoch = 0;
  let lastRouteChangeEpoch = 0;

  // `event.timeStamp` is relative to this document's own time origin
  // (`win.performance.timeOrigin`); converting it inline, rather than
  // through `epochSource`, keeps every DOM-event epoch exact even when
  // `epochSource` is a fake clock injected by a test. `epochSource` is
  // used below only for the two epochs that have no originating DOM event
  // (a resolved state-change window, a route-change notification).
  function eventEpoch(event: Event): number {
    return epochFromTimeOrigin(win.performance.timeOrigin, event.timeStamp);
  }

  const onClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const clickEpoch = eventEpoch(event);
    const sample = sampleElement(target, win);

    sink({
      type: 'click',
      epochMs: clickEpoch,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.offsetX,
      offsetY: event.offsetY,
      button: pointerButtonFor(event),
      selectors: sample.selectors,
      element: sample.element,
      viewport: sample.viewport,
      scroll: sample.scroll,
    });

    ripple?.show(event.clientX, event.clientY, clickEpoch);

    void observeStateChangeWindow({
      target,
      document: doc,
      windowMs: stateChangeWindowMs,
    }).then((result) => {
      if (!result.changed || !result.domDelta) return;
      // A route change already covers this click; don't double-report it
      // as an in-place state change too.
      if (lastRouteChangeEpoch >= clickEpoch) return;
      sink({
        type: 'state-change',
        epochMs: epochSource.now(),
        domDelta: result.domDelta,
      });
    });
  };

  const onPointerMove = (event: PointerEvent): void => {
    const epochMs = eventEpoch(event);
    if (epochMs - lastPointerSampleEpoch < pointerIntervalMs) return;
    lastPointerSampleEpoch = epochMs;
    sink({ type: 'pointermove', epochMs, x: event.clientX, y: event.clientY });
  };

  const onScroll = (event: Event): void => {
    const epochMs = eventEpoch(event);
    if (epochMs - lastScrollSampleEpoch < scrollIntervalMs) return;
    lastScrollSampleEpoch = epochMs;

    const target = event.target;
    let x = win.scrollX;
    let y = win.scrollY;
    let selectors: ReturnType<typeof generateSelectors> | undefined;
    if (target instanceof Element) {
      x = target.scrollLeft;
      y = target.scrollTop;
      selectors = generateSelectors(target);
    }
    sink({ type: 'scroll', epochMs, x, y, ...(selectors ? { selectors } : {}) });
  };

  const onInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element) || !isFormField(target)) return;
    const epochMs = eventEpoch(event);
    const sample = sampleElement(target, win);
    const selectors = sample.selectors;
    const explicitKind = explicitCredentialKind(selectors, options.credentialMarkings ?? []);
    const credential = explicitKind !== null || isCredentialField(target);
    const base = {
      type: 'input',
      epochMs,
      inputType: (event as InputEvent).inputType ?? 'unknown',
      selectors,
      value: maskInputValue(target.value),
    } as const;
    if (credential) {
      sink({
        ...base,
        credential: true,
        redaction: boundedRedactionGeometry(target.getBoundingClientRect(), sample.viewport),
      });
      return;
    }
    sink({ ...base, credential: false });
  };

  const onRouteChange = (event: Event): void => {
    const detail = (event as CustomEvent<RouteChangeDetail>).detail;
    if (!detail) return;
    lastRouteChangeEpoch = epochSource.now();
    sink({
      type: 'route',
      epochMs: lastRouteChangeEpoch,
      before: detail.before,
      after: detail.after,
      source: detail.source,
    });
  };

  doc.addEventListener('click', onClick, { capture: true });
  doc.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  doc.addEventListener('input', onInput, { capture: true });
  win.addEventListener(ROUTE_CHANGE_EVENT, onRouteChange);

  return () => {
    doc.removeEventListener('click', onClick, { capture: true });
    doc.removeEventListener('pointermove', onPointerMove, { capture: true });
    doc.removeEventListener('scroll', onScroll, { capture: true });
    doc.removeEventListener('input', onInput, { capture: true });
    win.removeEventListener(ROUTE_CHANGE_EVENT, onRouteChange);
  };
}
