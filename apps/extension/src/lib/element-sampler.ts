// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RecordedViewport, Rect, StepElement } from '@waggle/ir';
import { computeAccessibleName, computeAccessibleRole } from './accessibility.js';
import type { GeneratedSelector, ScrollOffset } from './events.js';
import { generateSelectors } from './selectors.js';

/**
 * Per-click element sampling (AC4): the accessible identity, rect,
 * viewport/DPR, and scroll offsets of the element a click targeted, plus
 * its full fallback selector list.
 */

export interface ElementSample {
  element: StepElement;
  selectors: GeneratedSelector[];
  viewport: RecordedViewport;
  scroll: ScrollOffset;
}

const MAX_INNER_TEXT_LENGTH = 500;

/** Samples `el` against `win`'s current viewport, DPR, and scroll offsets. */
export function sampleElement(el: Element, win: Window & typeof globalThis): ElementSample {
  const domRect = el.getBoundingClientRect();
  const rect: Rect = { x: domRect.x, y: domRect.y, w: domRect.width, h: domRect.height };

  const role = computeAccessibleRole(el);
  const name = computeAccessibleName(el);
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_INNER_TEXT_LENGTH);

  const element: StepElement = {
    role,
    name,
    rect,
    ...(text.length > 0 ? { text } : {}),
  };

  return {
    element,
    selectors: generateSelectors(el),
    viewport: {
      w: win.innerWidth,
      h: win.innerHeight,
      dpr: win.devicePixelRatio > 0 ? win.devicePixelRatio : 1,
    },
    scroll: { x: win.scrollX, y: win.scrollY },
  };
}
