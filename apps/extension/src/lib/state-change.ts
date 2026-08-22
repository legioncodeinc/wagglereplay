// SPDX-License-Identifier: AGPL-3.0-or-later
import { AriaChangeSchema, type DomDelta, type Rect } from '@waggle/ir';
import type { z } from 'zod';

/**
 * Mutation-window state-change classification (AC5).
 *
 * A click with no route change is not necessarily a no-op: the fixture
 * app's Items route updates `item-detail` in place with no URL change
 * (fixtures/demo-app/README.md, "Items is the state-change case"). After
 * such a click, this module watches the DOM for `windowMs` and, if
 * anything grew/shrank or a tracked ARIA attribute flipped, reports a
 * `state-change` step with a DOM delta summary the narration writer
 * (prd-006) can start from.
 */

type AriaChange = z.infer<typeof AriaChangeSchema>;

export interface StateChangeWindowOptions {
  /** Element the triggering click targeted; its rect and ARIA state are the baseline. */
  target: Element;
  document: Document;
  /** How long to watch for mutations before deciding, in ms. Default 300. */
  windowMs?: number;
  MutationObserverCtor?: typeof MutationObserver;
  setTimeoutFn?: typeof setTimeout;
}

export interface StateChangeResult {
  changed: boolean;
  domDelta?: DomDelta;
}

const TRACKED_ARIA_ATTRIBUTES = ['aria-expanded', 'aria-selected', 'aria-checked'];
/** A rect delta below this many CSS pixels on every axis is noise, not a real move. */
const RECT_DELTA_EPSILON_PX = 0.5;

function ariaSnapshot(el: Element): Record<string, string | null> {
  const snapshot: Record<string, string | null> = {};
  for (const attr of TRACKED_ARIA_ATTRIBUTES) {
    snapshot[attr] = el.getAttribute(attr);
  }
  return snapshot;
}

function diffAriaSnapshots(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
  role: string,
  name: string,
): AriaChange[] {
  const changes: AriaChange[] = [];
  for (const attr of TRACKED_ARIA_ATTRIBUTES) {
    const beforeValue = before[attr] ?? null;
    const afterValue = after[attr] ?? null;
    if (beforeValue === afterValue) continue;
    const change =
      beforeValue === null ? 'added' : afterValue === null ? 'removed' : ('updated' as const);
    changes.push({ role, name: `${name} ${attr}=${afterValue ?? '(removed)'}`.trim(), change });
  }
  return changes;
}

function rectOf(el: Element): Rect {
  const domRect = el.getBoundingClientRect();
  return { x: domRect.x, y: domRect.y, w: domRect.width, h: domRect.height };
}

function rectsDiffer(before: Rect, after: Rect): boolean {
  return (
    Math.abs(before.x - after.x) > RECT_DELTA_EPSILON_PX ||
    Math.abs(before.y - after.y) > RECT_DELTA_EPSILON_PX ||
    Math.abs(before.w - after.w) > RECT_DELTA_EPSILON_PX ||
    Math.abs(before.h - after.h) > RECT_DELTA_EPSILON_PX
  );
}

function summarize(addedNodes: number, removedNodes: number, ariaChanges: AriaChange[]): string {
  const parts: string[] = [];
  if (addedNodes > 0) parts.push(`${addedNodes} node${addedNodes === 1 ? '' : 's'} added`);
  if (removedNodes > 0) parts.push(`${removedNodes} node${removedNodes === 1 ? '' : 's'} removed`);
  if (ariaChanges.length > 0) {
    parts.push(
      `${ariaChanges.length} aria attribute${ariaChanges.length === 1 ? '' : 's'} changed`,
    );
  }
  return parts.length > 0 ? parts.join(', ') : 'content updated in place';
}

/**
 * Observes `options.target`'s subtree for `windowMs` and resolves with
 * whether a real state change happened. Resolves `{ changed: false }` for
 * a click that had no visible effect (a true no-op).
 */
export function observeStateChangeWindow(
  options: StateChangeWindowOptions,
): Promise<StateChangeResult> {
  const windowMs = options.windowMs ?? 300;
  const ObserverCtor = options.MutationObserverCtor ?? MutationObserver;
  const scheduleTimeout = options.setTimeoutFn ?? setTimeout;

  const rectBefore = rectOf(options.target);
  const ariaBefore = ariaSnapshot(options.target);
  const role = options.target.getAttribute('role') ?? options.target.tagName.toLowerCase();
  const name =
    options.target.getAttribute('aria-label') ??
    (options.target.textContent ?? '').trim().slice(0, 80);

  return new Promise((resolve) => {
    let addedNodes = 0;
    let removedNodes = 0;

    const observer = new ObserverCtor((mutations) => {
      for (const mutation of mutations) {
        addedNodes += mutation.addedNodes.length;
        removedNodes += mutation.removedNodes.length;
      }
    });

    const observedRoot = options.document.body ?? options.document.documentElement;
    observer.observe(observedRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: TRACKED_ARIA_ATTRIBUTES,
    });

    scheduleTimeout(() => {
      observer.disconnect();

      const rectAfter = rectOf(options.target);
      const ariaAfter = ariaSnapshot(options.target);
      const ariaChanges = diffAriaSnapshots(ariaBefore, ariaAfter, role, name || role);
      const changed = addedNodes > 0 || removedNodes > 0 || ariaChanges.length > 0;

      if (!changed) {
        resolve({ changed: false });
        return;
      }

      const rectDelta = rectsDiffer(rectBefore, rectAfter) ? rectAfter : undefined;
      resolve({
        changed: true,
        domDelta: {
          summary: summarize(addedNodes, removedNodes, ariaChanges),
          ariaChanges,
          ...(rectDelta ? { rectDelta } : {}),
        },
      });
    }, windowMs);
  });
}
