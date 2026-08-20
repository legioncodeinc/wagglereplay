/**
 * MAIN-world route patch (AC5).
 *
 * `chrome.webNavigation`'s `onHistoryStateUpdated`/`onReferenceFragmentUpdated`
 * (wired in background/service-worker.ts) only fires for navigations the
 * browser itself recognizes; an in-app `pushState`/`replaceState` call the
 * page's own script makes is invisible to the extension unless something
 * running IN the page's own JS context (MAIN world, not the content
 * script's isolated world) observes it. This module is injected via
 * `chrome.scripting.executeScript({ world: 'MAIN' })` and reports every
 * route change - history API, `popstate`/`hashchange`, and the Navigation
 * API where available - back to the isolated-world content script over
 * `window.postMessage`-free `CustomEvent`s (MAIN and ISOLATED worlds share
 * the same DOM/window event target, just not the same JS heap, so
 * `dispatchEvent`/`addEventListener` cross the boundary; `postMessage`
 * would work too but is unnecessary here and adds an extra hop).
 *
 * Page CSP applies to this script exactly as it would to the page's own
 * inline code (corpus: capture-layer.md), so it does nothing beyond
 * wrapping two `history` methods and adding listeners: no fetch, no DOM
 * writes, no eval.
 */

export const ROUTE_CHANGE_EVENT = 'waggle:route-change';

export interface RouteChangeDetail {
  before: string;
  after: string;
  source: 'history' | 'navigation-api';
}

interface HistoryLike {
  pushState: History['pushState'];
  replaceState: History['replaceState'];
}

/**
 * Installs the history patch and listeners on `win`. Returns a disposer.
 * Pure enough to unit test against a jsdom `window` without an extension
 * host.
 */
export function installRoutePatch(win: Window & typeof globalThis): () => void {
  const history: HistoryLike = win.history;
  // Captured as plain references (not `.bind()`-wrapped) so `dispose()`
  // restores the exact function object that was there before `install`,
  // not a behaviorally-equivalent clone - important both for correctness
  // if some other script also wrapped `history.pushState` and for a
  // dispose test to assert reference equality.
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  let lastHref = win.location.href;

  function announce(source: RouteChangeDetail['source']): void {
    const after = win.location.href;
    if (after === lastHref) return;
    const before = lastHref;
    lastHref = after;
    win.dispatchEvent(
      new CustomEvent<RouteChangeDetail>(ROUTE_CHANGE_EVENT, { detail: { before, after, source } }),
    );
  }

  win.history.pushState = function patchedPushState(
    this: History,
    ...args: Parameters<History['pushState']>
  ): void {
    originalPushState.apply(this, args);
    announce('history');
  };

  win.history.replaceState = function patchedReplaceState(
    this: History,
    ...args: Parameters<History['replaceState']>
  ): void {
    originalReplaceState.apply(this, args);
    announce('history');
  };

  const onPopOrHash = (): void => announce('history');
  win.addEventListener('popstate', onPopOrHash);
  win.addEventListener('hashchange', onPopOrHash);

  const navigation = (win as unknown as { navigation?: EventTarget }).navigation;
  const onNavigate = (): void => announce('navigation-api');
  navigation?.addEventListener('navigate', onNavigate);

  return () => {
    win.history.pushState = originalPushState;
    win.history.replaceState = originalReplaceState;
    win.removeEventListener('popstate', onPopOrHash);
    win.removeEventListener('hashchange', onPopOrHash);
    navigation?.removeEventListener('navigate', onNavigate);
  };
}

// No import-time bootstrap here: `window` exists in a jsdom unit test too,
// so an auto-install at module scope would fire as a side effect of
// merely importing this file for testing. The one-line production
// bootstrap lives in ./route-main-world-bootstrap.ts, which is the actual
// file build/build.mjs bundles as the MAIN-world injection target.
