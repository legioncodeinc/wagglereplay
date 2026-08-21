import { describe, expect, it, vi } from 'vitest';
import { NetworkQuiescenceTracker } from '../../src/lib/network-quiescence.js';

function detail(
  requestId: string,
  tabId = 1,
  type = 'xmlhttprequest',
  url = 'https://example.test/x',
) {
  return { requestId, tabId, type, url };
}

describe('NetworkQuiescenceTracker', () => {
  it('fires onIdle once in-flight count reaches zero and stays there for idleWindowMs', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new NetworkQuiescenceTracker({ maxInFlight: 0, idleWindowMs: 500, onIdle });

    tracker.onBeforeRequest(detail('r1'));
    expect(tracker.inFlightCount(1)).toBe(1);

    tracker.onCompleted(detail('r1'));
    expect(tracker.inFlightCount(1)).toBe(0);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle.mock.calls[0]?.[0]).toMatchObject({ tabId: 1 });

    vi.useRealTimers();
  });

  it('resets the idle timer when a new request starts before the window elapses', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new NetworkQuiescenceTracker({ maxInFlight: 0, idleWindowMs: 500, onIdle });

    tracker.onBeforeRequest(detail('r1'));
    tracker.onCompleted(detail('r1'));
    vi.advanceTimersByTime(300);
    tracker.onBeforeRequest(detail('r2'));
    vi.advanceTimersByTime(300);
    expect(onIdle).not.toHaveBeenCalled();

    tracker.onCompleted(detail('r2'));
    vi.advanceTimersByTime(500);
    expect(onIdle).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('excludes websockets and beacons from the in-flight count', () => {
    const tracker = new NetworkQuiescenceTracker();
    tracker.onBeforeRequest(detail('ws1', 1, 'websocket'));
    tracker.onBeforeRequest(detail('beacon1', 1, 'ping'));
    expect(tracker.inFlightCount(1)).toBe(0);
  });

  it('excludes a request once its response headers reveal an SSE stream', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new NetworkQuiescenceTracker({ maxInFlight: 0, idleWindowMs: 100, onIdle });

    tracker.onBeforeRequest(detail('sse1'));
    expect(tracker.inFlightCount(1)).toBe(1);

    tracker.onHeadersReceived(detail('sse1'), { 'content-type': 'text/event-stream' });
    expect(tracker.inFlightCount(1)).toBe(0);

    vi.advanceTimersByTime(100);
    expect(onIdle).toHaveBeenCalledTimes(1);

    // A subsequent onCompleted for the same (already-excluded) request must not double count.
    tracker.onCompleted(detail('sse1'));
    expect(tracker.inFlightCount(1)).toBe(0);

    vi.useRealTimers();
  });

  it('honors maxInFlight for a networkidle2-style threshold', () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new NetworkQuiescenceTracker({ maxInFlight: 2, idleWindowMs: 500, onIdle });

    tracker.onBeforeRequest(detail('r1'));
    tracker.onBeforeRequest(detail('r2'));
    tracker.onBeforeRequest(detail('r3'));
    expect(tracker.inFlightCount(1)).toBe(3);

    tracker.onCompleted(detail('r3'));
    expect(tracker.inFlightCount(1)).toBe(2);
    vi.advanceTimersByTime(500);
    expect(onIdle).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('keeps separate counters per tab', () => {
    const tracker = new NetworkQuiescenceTracker();
    tracker.onBeforeRequest(detail('a', 1));
    tracker.onBeforeRequest(detail('b', 2));
    expect(tracker.inFlightCount(1)).toBe(1);
    expect(tracker.inFlightCount(2)).toBe(1);
  });
});
