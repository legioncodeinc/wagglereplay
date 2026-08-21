import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachTelemetry } from '../../src/content/telemetry.js';
import { createPerformanceEpochSource } from '../../src/lib/epoch.js';
import type { CaptureEventDraft } from '../../src/lib/events.js';

function withTimeStamp<E extends Event>(event: E, timeStampMs: number): E {
  Object.defineProperty(event, 'timeStamp', { value: timeStampMs, configurable: true });
  return event;
}

describe('attachTelemetry', () => {
  let events: CaptureEventDraft[];
  let detach: () => void;

  beforeEach(() => {
    document.body.innerHTML = `
      <button data-testid="cta-start">Start Walkthrough</button>
      <div id="scroller" style="overflow:auto; height:10px;"><div style="height:1000px"></div></div>
      <input id="password" type="password" />
    `;
    events = [];
    detach = attachTelemetry({
      window,
      document,
      epochSource: createPerformanceEpochSource(window.performance),
      sink: (event) => events.push(event),
      pointerSampleIntervalMs: 33,
      scrollSampleIntervalMs: 100,
    });
  });

  afterEach(() => {
    detach();
  });

  it('emits a click event with element sample and selectors', () => {
    const button = document.querySelector('[data-testid="cta-start"]') as HTMLElement;
    button.dispatchEvent(
      withTimeStamp(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 20 }), 100),
    );

    const click = events.find((e) => e.type === 'click');
    expect(click).toBeDefined();
    if (click?.type !== 'click') throw new Error('expected a click event');
    expect(click.x).toBe(10);
    expect(click.y).toBe(20);
    expect(click.selectors[0]?.value).toBe('[data-testid="cta-start"]');
    expect(click.element.name).toBe('Start Walkthrough');
  });

  it('throttles pointermove samples to at most one per pointerSampleIntervalMs', () => {
    const target = document.body;
    target.dispatchEvent(
      withTimeStamp(new PointerEvent('pointermove', { clientX: 0, clientY: 0 }), 0),
    );
    target.dispatchEvent(
      withTimeStamp(new PointerEvent('pointermove', { clientX: 1, clientY: 1 }), 10),
    );
    target.dispatchEvent(
      withTimeStamp(new PointerEvent('pointermove', { clientX: 2, clientY: 2 }), 40),
    );

    const moves = events.filter((e) => e.type === 'pointermove');
    // The sample at t=10 is within 33ms of t=0 and should be dropped; the
    // sample at t=40 is past the interval and should be kept.
    expect(moves).toHaveLength(2);
  });

  it('masks input values and flags credential fields', () => {
    const password = document.getElementById('password') as HTMLInputElement;
    password.value = 'hunter2';
    password.dispatchEvent(withTimeStamp(new Event('input', { bubbles: true }), 0));

    const input = events.find((e) => e.type === 'input');
    expect(input).toBeDefined();
    if (input?.type !== 'input') throw new Error('expected an input event');
    expect(input.value).toEqual({ length: 7, masked: true });
    expect(input.credential).toBe(true);
    expect(JSON.stringify(input)).not.toContain('hunter2');
  });

  it('records scroll position from the scrolling element', () => {
    const scroller = document.getElementById('scroller') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 42, configurable: true });
    scroller.dispatchEvent(withTimeStamp(new Event('scroll', { bubbles: false }), 0));

    const scroll = events.find((e) => e.type === 'scroll');
    expect(scroll).toBeDefined();
    if (scroll?.type !== 'scroll') throw new Error('expected a scroll event');
    expect(scroll.y).toBe(42);
  });

  it('emits a route event when the MAIN-world patch announces one', async () => {
    const { installRoutePatch, ROUTE_CHANGE_EVENT } = await import(
      '../../src/content/route-main-world.js'
    );
    const disposeRoute = installRoutePatch(window);

    window.history.pushState({}, '', '/login');

    const route = events.find((e) => e.type === 'route');
    expect(route).toBeDefined();
    if (route?.type !== 'route') throw new Error('expected a route event');
    expect(route.after).toContain('/login');
    expect(route.source).toBe('history');

    disposeRoute();
    window.history.replaceState(null, '', '/');
    void ROUTE_CHANGE_EVENT;
  });
});
