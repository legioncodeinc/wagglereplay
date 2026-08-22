// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Live click ripple overlay (AC7): a toggleable visual "you just clicked
 * here" ring shown at the click point while a recording is running, so the
 * person recording gets feedback that capture is working, and so AC8's
 * alignment check has a real, observable DOM event to time against (a
 * proxy for "the frame the ripple appears on", since decoding the actual
 * recorded WebM is outside what a content script can do).
 *
 * Rendered inside a closed shadow root so the fixture app's (or any real
 * app's) CSS can never bleed in or be bled on. Every insertion is
 * timestamped with the same epoch clock as the telemetry that triggered
 * it, and a `waggle:ripple-shown` custom event carries that timestamp so a
 * test harness can measure the actual click-to-ripple latency of this
 * exact pipeline.
 */

export interface RippleController {
  setEnabled(enabled: boolean): void;
  show(x: number, y: number, epochMs: number): void;
  dispose(): void;
}

const HOST_ID = 'waggle-ripple-overlay-host';
const RIPPLE_LIFETIME_MS = 600;

export function createRippleOverlay(doc: Document): RippleController {
  let enabled = false;
  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;

  function ensureHost(): ShadowRoot {
    if (shadow) return shadow;
    host = doc.createElement('div');
    host.id = HOST_ID;
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647';
    shadow = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = `
      .ripple {
        position: fixed;
        width: 24px;
        height: 24px;
        margin-left: -12px;
        margin-top: -12px;
        border-radius: 50%;
        border: 2px solid rgba(255, 90, 0, 0.9);
        background: rgba(255, 90, 0, 0.25);
        animation: waggle-ripple ${RIPPLE_LIFETIME_MS}ms ease-out forwards;
      }
      @keyframes waggle-ripple {
        from { transform: scale(0.4); opacity: 1; }
        to { transform: scale(2.2); opacity: 0; }
      }
    `;
    shadow.appendChild(style);
    (doc.body ?? doc.documentElement).appendChild(host);
    return shadow;
  }

  return {
    setEnabled(next: boolean) {
      enabled = next;
      if (!enabled && host) {
        host.remove();
        host = null;
        shadow = null;
      }
    },

    show(x, y, epochMs) {
      if (!enabled) return;
      const root = ensureHost();
      const ring = doc.createElement('div');
      ring.className = 'ripple';
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      ring.dataset['waggleRippleEpoch'] = String(epochMs);
      root.appendChild(ring);
      doc.defaultView?.dispatchEvent(
        new CustomEvent('waggle:ripple-shown', { detail: { x, y, epochMs } }),
      );
      setTimeout(() => ring.remove(), RIPPLE_LIFETIME_MS);
    },

    dispose() {
      host?.remove();
      host = null;
      shadow = null;
    },
  };
}
