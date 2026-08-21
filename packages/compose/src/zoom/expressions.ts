import { clampExpr, num, piecewise } from '../expr/piecewise.js';
import type { RenderPreset } from '../presets.js';
import type { ZoomTrack } from './segments.js';

/**
 * The crop+scale expressions that implement zoom and smart reframe.
 *
 * ADR-003 forbids `zoompan` outright ("known zoompan jitter is avoided by
 * using crop+scale expressions on an upscaled canvas rather than
 * zoompan"), and the corpus repeats it with the receipt. What replaces it:
 *
 *   scale=w=<cover*z(t)>:h=<cover*z(t)>:eval=frame   grow the canvas
 *   crop=w=<out>:h=<out>:x=<focus>:y=<focus>          take a fixed window
 *
 * `scale` re-evaluates its size every frame and emits variable-size
 * frames; `crop`'s OUTPUT size is fixed (which it must be) while its x/y
 * expressions read the varying `in_w`/`in_h`. The pair therefore expresses
 * a moving, resizing window without a single `zoompan` invocation.
 *
 * "Cover" is the source scaled just far enough to cover the preset at zoom
 * 1. For a native aspect ratio that is exactly the preset size, so the
 * crop window has nowhere to pan until zoom lifts above 1. For a preset
 * that does not match the recording, cover is larger on one axis and the
 * crop window pans across it: that is ADR-011's reframe, falling out of
 * the same two filters rather than needing its own.
 */

export interface CoverGeometry {
  readonly coverWidth: number;
  readonly coverHeight: number;
}

/**
 * The smallest whole-pixel scaling of the source that still covers the
 * preset frame at zoom 1.
 */
export function computeCoverGeometry(
  preset: RenderPreset,
  sourceWidth: number,
  sourceHeight: number,
): CoverGeometry {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new RangeError(
      `Source dimensions must be positive, received ${sourceWidth}x${sourceHeight}.`,
    );
  }
  const factor = Math.max(preset.width / sourceWidth, preset.height / sourceHeight);
  return {
    coverWidth: toEven(Math.ceil(sourceWidth * factor)),
    coverHeight: toEven(Math.ceil(sourceHeight * factor)),
  };
}

function toEven(value: number): number {
  return value % 2 === 0 ? value : value + 1;
}

export interface ZoomExpressions {
  /** `z(t)`, always >= 1. */
  readonly zoom: string;
  /** The `scale` filter's per-frame width and height, already even-rounded. */
  readonly scaledWidth: string;
  readonly scaledHeight: string;
  /** The `crop` filter's x and y, in terms of the varying `in_w`/`in_h`. */
  readonly cropX: string;
  readonly cropY: string;
  /** Normalized focus position over time, 0..1. */
  readonly focusX: string;
  readonly focusY: string;
  readonly geometry: CoverGeometry;
  readonly preset: RenderPreset;
}

/**
 * `ceil(cover*z/2)*2`: the scale filter needs an even size because the
 * chain still carries chroma-subsampled frames, and rounding to even is
 * also what lets ../cursor/track.ts reproduce `in_w` EXACTLY rather than
 * approximately. Both the scale filter and the overlay projections
 * evaluate this identical string, so the cursor never drifts a pixel from
 * the content underneath it.
 */
function evenScaleExpr(cover: number, zoomExpr: string): string {
  return `ceil(${num(cover)}*(${zoomExpr})/2)*2`;
}

export function buildZoomExpressions(
  track: ZoomTrack,
  preset: RenderPreset,
  geometry: CoverGeometry,
): ZoomExpressions {
  const zoom = piecewise(track.zoom, 'smoothstep');
  const focusX = piecewise(track.focusX, 'smoothstep');
  const focusY = piecewise(track.focusY, 'smoothstep');

  const scaledWidth = evenScaleExpr(geometry.coverWidth, zoom);
  const scaledHeight = evenScaleExpr(geometry.coverHeight, zoom);

  // Centre the crop window on the focus point, then clamp it inside the
  // scaled frame so a focus point near an edge slides the window to the
  // edge instead of sampling outside it.
  const cropX = clampExpr(`(${focusX})*in_w-out_w/2`, '0', 'in_w-out_w');
  const cropY = clampExpr(`(${focusY})*in_h-out_h/2`, '0', 'in_h-out_h');

  return { zoom, scaledWidth, scaledHeight, cropX, cropY, focusX, focusY, geometry, preset };
}

/**
 * Projects a normalized 0..1 point through the same zoom and crop the base
 * video went through, producing an output-frame pixel expression.
 *
 * This is what keeps the synthetic cursor and the click ripples pinned to
 * the content they refer to while the frame zooms and pans underneath
 * them. `nxExpr` may itself be an expression in `t` (the cursor's animated
 * path) or a constant (a ripple's fixed click point).
 *
 * The `in_w`/`in_h` the crop filter sees are re-derived here as
 * `scaledWidth`/`scaledHeight` because an overlay filter has no way to
 * reference an upstream filter's frame size.
 */
export function projectNormalizedX(expressions: ZoomExpressions, nxExpr: string): string {
  const inW = expressions.scaledWidth;
  const cropX = clampExpr(
    `(${expressions.focusX})*(${inW})-${num(expressions.preset.width)}/2`,
    '0',
    `(${inW})-${num(expressions.preset.width)}`,
  );
  return `(${nxExpr})*(${inW})-(${cropX})`;
}

export function projectNormalizedY(expressions: ZoomExpressions, nyExpr: string): string {
  const inH = expressions.scaledHeight;
  const cropY = clampExpr(
    `(${expressions.focusY})*(${inH})-${num(expressions.preset.height)}/2`,
    '0',
    `(${inH})-${num(expressions.preset.height)}`,
  );
  return `(${nyExpr})*(${inH})-(${cropY})`;
}
