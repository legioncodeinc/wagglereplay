// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Per-tab network-quiescence tracking (AC6, ADR-010).
 *
 * MV3's `chrome.webRequest` keeps observation (blocking was removed in
 * MV3), which is enough to build the Puppeteer `networkidle0`/`networkidle2`
 * heuristic: idle when at most `maxInFlight` connections have been open for
 * `idleWindowMs` (defaults: 2 connections / 500 ms, i.e. networkidle2 -
 * see https://pptr.dev/api/puppeteer.puppeteerlifecycleevent). Long-lived
 * connections that would never naturally settle - websockets, Server-Sent
 * Events, and `navigator.sendBeacon` pings - are excluded from the count
 * per ADR-010.
 *
 * This class touches no `chrome.*` API directly: `background/service-worker.ts`
 * is the only module that wires it to real `chrome.webRequest` events. That
 * split is what makes the actual quiescence algorithm unit-testable without
 * a browser.
 */

export interface WebRequestLikeDetails {
  requestId: string;
  tabId: number;
  /** A `chrome.webRequest.ResourceType` value, e.g. 'xmlhttprequest', 'websocket', 'ping'. */
  type: string;
  url: string;
}

export interface QuiescenceEvent {
  tabId: number;
  epochMs: number;
  ms: number;
}

/** Resource types MV3's webRequest API itself already marks as long-lived. */
const EXCLUDED_RESOURCE_TYPES = new Set(['websocket', 'ping']);
const SSE_CONTENT_TYPE_HINT = 'text/event-stream';

export interface NetworkQuiescenceOptions {
  /** Max in-flight connections still considered idle. Default 2 (networkidle2). */
  maxInFlight?: number;
  /** How long the count must stay at/below maxInFlight before firing, in ms. Default 500. */
  idleWindowMs?: number;
  now?: () => number;
  onIdle?: (event: QuiescenceEvent) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export class NetworkQuiescenceTracker {
  private readonly maxInFlight: number;
  private readonly idleWindowMs: number;
  private readonly now: () => number;
  private readonly onIdle: ((event: QuiescenceEvent) => void) | undefined;
  private readonly scheduleTimeout: typeof setTimeout;
  private readonly cancelTimeout: typeof clearTimeout;
  private readonly inFlightByTab = new Map<number, Set<string>>();
  private readonly longLivedRequests = new Set<string>();
  private readonly idleTimers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(options: NetworkQuiescenceOptions = {}) {
    this.maxInFlight = options.maxInFlight ?? 2;
    this.idleWindowMs = options.idleWindowMs ?? 500;
    this.now = options.now ?? (() => Date.now());
    this.onIdle = options.onIdle;
    this.scheduleTimeout = options.setTimeoutFn ?? setTimeout;
    this.cancelTimeout = options.clearTimeoutFn ?? clearTimeout;
  }

  private isExcludedByType(details: WebRequestLikeDetails): boolean {
    return EXCLUDED_RESOURCE_TYPES.has(details.type);
  }

  private isExcludedByHeaders(headers: Record<string, string>): boolean {
    const contentType = headers['content-type'] ?? headers['Content-Type'];
    return Boolean(contentType?.toLowerCase().includes(SSE_CONTENT_TYPE_HINT));
  }

  /** Call from `chrome.webRequest.onBeforeRequest`. */
  onBeforeRequest(details: WebRequestLikeDetails): void {
    if (this.isExcludedByType(details)) {
      this.longLivedRequests.add(details.requestId);
      return;
    }
    const inFlight = this.inFlightByTab.get(details.tabId) ?? new Set<string>();
    inFlight.add(details.requestId);
    this.inFlightByTab.set(details.tabId, inFlight);
    this.cancelIdleTimer(details.tabId);
  }

  /**
   * Call from `chrome.webRequest.onHeadersReceived`. Catches SSE streams,
   * which only announce themselves once the response headers arrive.
   */
  onHeadersReceived(details: WebRequestLikeDetails, headers: Record<string, string>): void {
    if (this.longLivedRequests.has(details.requestId)) return;
    if (this.isExcludedByHeaders(headers)) {
      this.longLivedRequests.add(details.requestId);
      this.removeInFlight(details.tabId, details.requestId);
    }
  }

  /** Call from `chrome.webRequest.onCompleted`. */
  onCompleted(details: WebRequestLikeDetails): void {
    this.finish(details);
  }

  /** Call from `chrome.webRequest.onErrorOccurred`. */
  onErrorOccurred(details: WebRequestLikeDetails): void {
    this.finish(details);
  }

  private finish(details: WebRequestLikeDetails): void {
    this.longLivedRequests.delete(details.requestId);
    this.removeInFlight(details.tabId, details.requestId);
  }

  private removeInFlight(tabId: number, requestId: string): void {
    const inFlight = this.inFlightByTab.get(tabId);
    if (!inFlight) return;
    inFlight.delete(requestId);
    if (inFlight.size <= this.maxInFlight) {
      this.scheduleIdle(tabId);
    }
  }

  private cancelIdleTimer(tabId: number): void {
    const timer = this.idleTimers.get(tabId);
    if (timer !== undefined) {
      this.cancelTimeout(timer);
      this.idleTimers.delete(tabId);
    }
  }

  private scheduleIdle(tabId: number): void {
    this.cancelIdleTimer(tabId);
    const startedAt = this.now();
    const timer = this.scheduleTimeout(() => {
      this.idleTimers.delete(tabId);
      const inFlight = this.inFlightByTab.get(tabId);
      const count = inFlight ? inFlight.size : 0;
      if (count <= this.maxInFlight) {
        this.onIdle?.({ tabId, epochMs: this.now(), ms: this.now() - startedAt });
      }
    }, this.idleWindowMs);
    this.idleTimers.set(tabId, timer);
  }

  /** Current in-flight (non-excluded) request count for a tab. Exposed for tests and diagnostics. */
  inFlightCount(tabId: number): number {
    return this.inFlightByTab.get(tabId)?.size ?? 0;
  }
}
