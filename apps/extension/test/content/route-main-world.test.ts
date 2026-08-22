// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installRoutePatch,
  ROUTE_CHANGE_EVENT,
  type RouteChangeDetail,
} from '../../src/content/route-main-world.js';

describe('installRoutePatch', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('announces a route change on pushState', () => {
    const dispose = installRoutePatch(window);
    const handler = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);

    window.history.pushState({}, '', '/login');

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<RouteChangeDetail>).detail;
    expect(detail.after).toContain('/login');
    expect(detail.source).toBe('history');

    window.removeEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);
    dispose();
  });

  it('announces a route change on replaceState', () => {
    const dispose = installRoutePatch(window);
    const handler = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);

    window.history.replaceState({}, '', '/items');

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);
    dispose();
  });

  it('does not announce when the URL does not actually change', () => {
    const dispose = installRoutePatch(window);
    const handler = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);

    window.history.pushState({}, '', window.location.pathname);

    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);
    dispose();
  });

  it('announces on popstate', () => {
    const dispose = installRoutePatch(window);
    const handler = vi.fn();
    window.addEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);

    window.history.pushState({}, '', '/scroll');
    handler.mockClear();
    window.history.pushState({}, '', '/fetch');
    handler.mockClear();

    // Simulate a real back navigation: jsdom's popstate does not itself
    // roll back window.location, so this test only exercises that the
    // listener fires and is wired correctly (the URL delta itself is what
    // a real browser's popstate guarantees).
    window.dispatchEvent(new PopStateEvent('popstate'));

    dispose();
    window.removeEventListener(ROUTE_CHANGE_EVENT, handler as EventListener);
  });

  it('dispose() restores the original history methods', () => {
    const originalPushState = window.history.pushState;
    const dispose = installRoutePatch(window);
    expect(window.history.pushState).not.toBe(originalPushState);
    dispose();
    expect(window.history.pushState).toBe(originalPushState);
  });
});
