import type { CaptureEvent } from '@waggle/extension';
import { describe, expect, it } from 'vitest';
import { groupEvents } from '../../src/segment/group-events.js';
import { loadSixStepFixture } from '../helpers/load-fixture.js';

function click(
  overrides: Partial<Extract<CaptureEvent, { type: 'click' }>> & { seq: number; epochMs: number },
): Extract<CaptureEvent, { type: 'click' }> {
  return {
    type: 'click',
    tabId: 1,
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
    button: 'primary',
    selectors: [{ type: 'css', value: '#a' }],
    element: { role: 'button', name: 'A', rect: { x: 0, y: 0, w: 10, h: 10 } },
    viewport: { w: 1280, h: 800, dpr: 1 },
    scroll: { x: 0, y: 0 },
    ...overrides,
  };
}

function scroll(
  overrides: Partial<Extract<CaptureEvent, { type: 'scroll' }>> & { seq: number; epochMs: number },
): Extract<CaptureEvent, { type: 'scroll' }> {
  return { type: 'scroll', tabId: 1, x: 0, y: 0, ...overrides };
}

function input(
  overrides: Partial<Extract<CaptureEvent, { type: 'input' }>> & { seq: number; epochMs: number },
): Extract<CaptureEvent, { type: 'input' }> {
  return {
    type: 'input',
    tabId: 1,
    inputType: 'insertText',
    selectors: [{ type: 'css', value: '#field-a' }],
    value: { length: 3, masked: true },
    credential: false,
    ...overrides,
  };
}

function route(
  overrides: Partial<Extract<CaptureEvent, { type: 'route' }>> & { seq: number; epochMs: number },
): Extract<CaptureEvent, { type: 'route' }> {
  return {
    type: 'route',
    tabId: 1,
    before: '/a',
    after: '/b',
    source: 'history',
    ...overrides,
  };
}

function stateChange(
  overrides: Partial<Extract<CaptureEvent, { type: 'state-change' }>> & {
    seq: number;
    epochMs: number;
  },
): Extract<CaptureEvent, { type: 'state-change' }> {
  return {
    type: 'state-change',
    tabId: 1,
    domDelta: { summary: 'something changed', ariaChanges: [] },
    ...overrides,
  };
}

function settle(
  overrides: Partial<Extract<CaptureEvent, { type: 'settle' }>> & { seq: number; epochMs: number },
): Extract<CaptureEvent, { type: 'settle' }> {
  return { type: 'settle', tabId: 1, settle: { source: 'network-idle', ms: 100 }, ...overrides };
}

describe('AC1: groupEvents - determinism on the real fixture recording', () => {
  it('produces byte-identical groupings across two runs on the same input', () => {
    const { events } = loadSixStepFixture();
    const first = groupEvents(events, 'http://127.0.0.1/');
    const second = groupEvents(events, 'http://127.0.0.1/');
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('groups the real 6-step walkthrough into exactly the expected step-worthy actions', () => {
    const { events, meta } = loadSixStepFixture();
    const { groups, warnings } = groupEvents(events, meta.initialUrl);

    expect(warnings).toEqual([]);
    // 7 clicks (each its own group) + 2 non-coalescing inputs (different
    // fields) + 1 scroll group = 10; zero orphan routes, since every
    // route in this recording immediately follows the click that caused
    // it.
    expect(groups).toHaveLength(10);
    expect(groups.filter((g) => 'kind' in g)).toHaveLength(0);

    const actionTypes = groups.map((g) => ('kind' in g ? 'orphan-route' : g.actionType));
    expect(actionTypes).toEqual([
      'click',
      'input',
      'input',
      'click',
      'click',
      'click',
      'scroll',
      'click',
      'click',
      'click',
    ]);
  });
});

describe('AC1: groupEvents - synthetic rule coverage', () => {
  it('coalesces consecutive scroll events within the gap threshold into one group', () => {
    const events: CaptureEvent[] = [
      scroll({ seq: 0, epochMs: 1000, y: 100 }),
      scroll({ seq: 1, epochMs: 1100, y: 200 }),
      scroll({ seq: 2, epochMs: 1200, y: 300 }),
    ];
    const { groups } = groupEvents(events, '/');
    expect(groups).toHaveLength(1);
    const [group] = groups;
    if (!group || 'kind' in group) throw new Error('expected a scroll group');
    expect(group.actionType).toBe('scroll');
    expect(group.actionEvents).toHaveLength(3);
  });

  it('does NOT coalesce scroll events separated by more than the gap threshold', () => {
    const events: CaptureEvent[] = [
      scroll({ seq: 0, epochMs: 1000, y: 100 }),
      scroll({ seq: 1, epochMs: 5000, y: 200 }), // 4000ms gap, well past the 250ms threshold
    ];
    const { groups } = groupEvents(events, '/');
    expect(groups).toHaveLength(2);
  });

  it('does NOT coalesce input events on different fields, even adjacent with no gap', () => {
    const events: CaptureEvent[] = [
      input({ seq: 0, epochMs: 1000, selectors: [{ type: 'css', value: '#username' }] }),
      input({ seq: 1, epochMs: 1005, selectors: [{ type: 'css', value: '#password' }] }),
    ];
    const { groups } = groupEvents(events, '/');
    expect(groups).toHaveLength(2);
  });

  it('coalesces consecutive input events on the SAME field', () => {
    const events: CaptureEvent[] = [
      input({ seq: 0, epochMs: 1000, selectors: [{ type: 'css', value: '#username' }] }),
      input({ seq: 1, epochMs: 1050, selectors: [{ type: 'css', value: '#username' }] }),
    ];
    const { groups } = groupEvents(events, '/');
    expect(groups).toHaveLength(1);
    const [group] = groups;
    if (!group || 'kind' in group) throw new Error('expected an input group');
    expect(group.actionEvents).toHaveLength(2);
  });

  it('a click never coalesces with anything, even a second identical click', () => {
    const events: CaptureEvent[] = [
      click({ seq: 0, epochMs: 1000 }),
      click({ seq: 1, epochMs: 1001 }),
    ];
    const { groups } = groupEvents(events, '/');
    expect(groups).toHaveLength(2);
  });

  it('a route event with no open group becomes an OrphanRoute, not a dropped event', () => {
    const events: CaptureEvent[] = [route({ seq: 0, epochMs: 1000, before: '/x', after: '/y' })];
    const { groups, warnings } = groupEvents(events, '/x');
    expect(warnings).toEqual([]);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group && 'kind' in group && group.kind).toBe('orphan-route');
  });

  it('a state-change event with no open group is dropped with a warning, not thrown', () => {
    const events: CaptureEvent[] = [stateChange({ seq: 0, epochMs: 1000 })];
    const { groups, warnings } = groupEvents(events, '/');
    expect(groups).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('state-change');
  });

  it('a settle event attaches to the most recently CLOSED group when none is open', () => {
    const events: CaptureEvent[] = [
      click({ seq: 0, epochMs: 1000 }),
      route({ seq: 1, epochMs: 1010, before: '/a', after: '/b' }), // closes the click group
      settle({ seq: 2, epochMs: 1200 }),
    ];
    const { groups, warnings } = groupEvents(events, '/a');
    expect(warnings).toEqual([]);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    if (!group || 'kind' in group) throw new Error('expected a click group');
    expect(group.outcome.settle?.settle.ms).toBe(100);
  });

  it('a settle event with nothing open or closed yet is dropped with a warning', () => {
    const events: CaptureEvent[] = [settle({ seq: 0, epochMs: 1000 })];
    const { groups, warnings } = groupEvents(events, '/');
    expect(groups).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('settle');
  });

  it('routeAtStart tracks the running current route across groups', () => {
    const events: CaptureEvent[] = [
      click({ seq: 0, epochMs: 1000 }),
      route({ seq: 1, epochMs: 1010, before: '/landing', after: '/next' }),
      click({ seq: 2, epochMs: 2000 }),
    ];
    const { groups } = groupEvents(events, '/landing');
    const [first, second] = groups;
    if (!first || 'kind' in first || !second || 'kind' in second) {
      throw new Error('expected two click groups');
    }
    expect(first.routeAtStart).toBe('/landing');
    expect(second.routeAtStart).toBe('/next');
  });
});
