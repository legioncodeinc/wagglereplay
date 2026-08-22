// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { createRippleOverlay } from '../../src/content/ripple-overlay.js';

describe('createRippleOverlay', () => {
  it('renders nothing until enabled', () => {
    document.body.innerHTML = '';
    const ripple = createRippleOverlay(document);
    ripple.show(10, 20, 123);
    expect(document.getElementById('waggle-ripple-overlay-host')).toBeNull();
    ripple.dispose();
  });

  it('renders a ripple host once enabled and shown', () => {
    document.body.innerHTML = '';
    const ripple = createRippleOverlay(document);
    ripple.setEnabled(true);
    ripple.show(10, 20, 123);

    const host = document.getElementById('waggle-ripple-overlay-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeNull(); // closed shadow root: not observable from outside

    ripple.dispose();
  });

  it('dispatches waggle:ripple-shown with the epoch that triggered it', () => {
    document.body.innerHTML = '';
    const ripple = createRippleOverlay(document);
    ripple.setEnabled(true);

    const handler = vi.fn();
    window.addEventListener('waggle:ripple-shown', handler as EventListener);
    ripple.show(5, 6, 999);
    window.removeEventListener('waggle:ripple-shown', handler as EventListener);

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0]?.[0] as CustomEvent<{ epochMs: number }>).detail;
    expect(detail.epochMs).toBe(999);

    ripple.dispose();
  });

  it('removes the host and stops rendering once disabled', () => {
    document.body.innerHTML = '';
    const ripple = createRippleOverlay(document);
    ripple.setEnabled(true);
    ripple.show(1, 1, 1);
    expect(document.getElementById('waggle-ripple-overlay-host')).not.toBeNull();

    ripple.setEnabled(false);
    expect(document.getElementById('waggle-ripple-overlay-host')).toBeNull();
  });
});
