// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RecordedViewport, Rect } from '@waggle/ir';

/** The only visual metadata retained for a credential-bearing input event. */
export interface InputRedactionGeometry {
  readonly rect: Rect;
  readonly viewport: RecordedViewport;
}

interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Clips an element rectangle into the recorded CSS viewport. A degenerate
 * or non-finite rectangle falls back to the full viewport: over-redacting
 * is preferable to emitting geometry that could leave a credential visible.
 */
export function boundedRedactionGeometry(
  rect: RectLike,
  viewport: RecordedViewport,
): InputRedactionGeometry {
  if (!isFinitePositive(viewport.w) || !isFinitePositive(viewport.h)) {
    throw new Error('Cannot record credential geometry for an invalid viewport.');
  }

  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !isFinitePositive(rect.width) ||
    !isFinitePositive(rect.height)
  ) {
    return { rect: { x: 0, y: 0, w: viewport.w, h: viewport.h }, viewport };
  }

  const left = Math.max(0, Math.min(viewport.w, rect.x));
  const top = Math.max(0, Math.min(viewport.h, rect.y));
  const right = Math.max(left, Math.min(viewport.w, rect.x + rect.width));
  const bottom = Math.max(top, Math.min(viewport.h, rect.y + rect.height));
  const width = right - left;
  const height = bottom - top;

  if (!isFinitePositive(width) || !isFinitePositive(height)) {
    return { rect: { x: 0, y: 0, w: viewport.w, h: viewport.h }, viewport };
  }

  return { rect: { x: left, y: top, w: width, h: height }, viewport };
}
