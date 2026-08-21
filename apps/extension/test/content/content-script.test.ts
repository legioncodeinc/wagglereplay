import { describe, expect, it } from 'vitest';
import { initContentScript } from '../../src/content/content-script.js';
import type { CaptureEventDraft } from '../../src/lib/events.js';

describe('initContentScript', () => {
  it('wires telemetry to the injected sink and can be disposed', () => {
    document.body.innerHTML = '<button data-testid="cta-start">Start Walkthrough</button>';
    const events: CaptureEventDraft[] = [];

    const handle = initContentScript({
      window,
      document,
      sink: (event) => events.push(event),
      rippleEnabled: false,
    });

    const button = document.querySelector('[data-testid="cta-start"]') as HTMLElement;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1 }));

    expect(events.some((e) => e.type === 'click')).toBe(true);

    handle.dispose();
    events.length = 0;
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 1, clientY: 1 }));
    expect(events).toHaveLength(0);
  });

  it('enables the ripple overlay by default', () => {
    document.body.innerHTML = '<button data-testid="cta-start">Start</button>';
    const handle = initContentScript({ window, document, sink: () => undefined });

    handle.ripple.show(1, 1, 1);
    expect(document.getElementById('waggle-ripple-overlay-host')).not.toBeNull();

    handle.dispose();
  });
});
