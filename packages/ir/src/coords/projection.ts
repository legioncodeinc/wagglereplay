import type { RecordedViewport } from '../schema/waggle-extensions.js';

/**
 * Coordinate projection between the recorded viewport and any render
 * preset.
 *
 * Corpus, "Numbering and time": "Coordinates are stored in
 * recorded-viewport CSS pixels plus normalized (0..1) form so any preset
 * can re-project them." Normalized form is the pivot: everything that
 * re-frames a walkthrough (a 9:16 vertical render, a 1:1 social crop, a
 * different device preset) goes recorded pixels -> normalized -> target
 * pixels, so no consumer has to know the recorded viewport's dimensions.
 *
 * These helpers are deliberately pure and dependency-free: the cursor
 * compositor (prd-007) calls them once per animation frame per cursor
 * sample, and they are the single definition of what "the same point on
 * screen" means across every preset Waggle renders.
 */

/** A point in CSS pixels, in some viewport's coordinate space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A point in normalized coordinates, where 0 is the left/top edge and 1 the right/bottom. */
export interface NormalizedPoint {
  readonly nx: number;
  readonly ny: number;
}

/**
 * The minimum a viewport must declare to project into or out of. Accepts a
 * full `RecordedViewport` (which carries `dpr` as well) unchanged: dpr does
 * not participate, because IR coordinates are CSS pixels, not device pixels.
 */
export interface ViewportSize {
  readonly w: number;
  readonly h: number;
}

export class ProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectionError';
  }
}

function assertUsableViewport(viewport: ViewportSize, role: string): void {
  if (!Number.isFinite(viewport.w) || !Number.isFinite(viewport.h)) {
    throw new ProjectionError(
      `${role} viewport must have finite dimensions, received w=${String(viewport.w)} h=${String(viewport.h)}.`,
    );
  }
  if (viewport.w <= 0 || viewport.h <= 0) {
    throw new ProjectionError(
      `${role} viewport must have positive dimensions, received w=${String(viewport.w)} h=${String(viewport.h)}. Dividing by a zero-width viewport would silently produce Infinity.`,
    );
  }
}

/** Recorded-viewport CSS pixels to normalized 0..1 coordinates. */
export function toNormalized(point: Point, viewport: ViewportSize): NormalizedPoint {
  assertUsableViewport(viewport, 'Source');
  return { nx: point.x / viewport.w, ny: point.y / viewport.h };
}

/** Normalized 0..1 coordinates back to CSS pixels in the given viewport. */
export function fromNormalized(point: NormalizedPoint, viewport: ViewportSize): Point {
  assertUsableViewport(viewport, 'Target');
  return { x: point.nx * viewport.w, y: point.ny * viewport.h };
}

/**
 * Re-projects a point recorded in `from` into the coordinate space of
 * `to`, via normalized form. This is the call every renderer makes.
 */
export function projectPoint(point: Point, from: ViewportSize, to: ViewportSize): Point {
  return fromNormalized(toNormalized(point, from), to);
}

/**
 * Re-projects the recorded cursor trail (or any sequence of timed points)
 * into a target viewport, preserving every non-coordinate field.
 */
export function projectPoints<T extends Point>(
  points: readonly T[],
  from: ViewportSize,
  to: ViewportSize,
): T[] {
  assertUsableViewport(from, 'Source');
  assertUsableViewport(to, 'Target');
  return points.map((point) => ({ ...point, ...projectPoint(point, from, to) }));
}

/** Narrows a `RecordedViewport` to the size fields projection actually uses. */
export function viewportSize(viewport: RecordedViewport): ViewportSize {
  return { w: viewport.w, h: viewport.h };
}
