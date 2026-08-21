import type { ClickRipple, CursorStyle } from '../brand/schema.js';
import { parseHexColor, type Rgb } from '../captions/ass-primitives.js';
import { type Bitmap, createBitmap, encodePng, setPixel } from './png.js';

/**
 * The two sprites a render composites: the synthetic cursor and the click
 * ripple.
 *
 * The corpus specifies the ripple as a "pre-rendered transparent sprite,
 * one chain entry per click". Both are generated per render because both
 * are brand-kit coloured, and both are rasterized here rather than
 * committed as binary fixtures.
 *
 * Anti-aliasing is 3x3 supersampling with a signed-distance classification
 * against the shape's outline, which is enough to keep a 34px arrow from
 * looking like a staircase without pulling in a rasterizer dependency.
 */

const SUPERSAMPLE = 3;

/**
 * The classic pointer outline, in a unit box whose origin is the TIP.
 *
 * The tip being at (0,0) is load-bearing: the overlay filter positions a
 * sprite by its top-left corner, so a tip anywhere else would need a
 * per-kit offset threaded through the cursor expressions.
 */
const ARROW_POLYGON: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 0.75],
  [0.19, 0.58],
  [0.3, 0.87],
  [0.42, 0.82],
  [0.31, 0.54],
  [0.52, 0.53],
];

const ARROW_ASPECT = 0.62;

interface Point2 {
  readonly x: number;
  readonly y: number;
}

function pointInPolygon(point: Point2, polygon: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) {
      continue;
    }
    const crossingX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < crossingX) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(point: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (a.x + projection * dx), point.y - (a.y + projection * dy));
}

function distanceToPolygon(point: Point2, polygon: readonly Point2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

interface Sample {
  readonly rgb: Rgb;
  readonly alpha: number;
}

function accumulate(samples: readonly Sample[]): { rgb: Rgb; alpha: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let alpha = 0;
  let weight = 0;
  for (const sample of samples) {
    r += sample.rgb.r * sample.alpha;
    g += sample.rgb.g * sample.alpha;
    b += sample.rgb.b * sample.alpha;
    alpha += sample.alpha;
    weight += sample.alpha;
  }
  if (weight === 0) {
    return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  }
  return {
    rgb: { r: r / weight, g: g / weight, b: b / weight },
    alpha: alpha / samples.length,
  };
}

/**
 * Rasterizes the arrow at `sizePx` tall, filled with the kit's cursor
 * colour and ringed with its outline colour.
 */
export function renderCursorSprite(cursor: CursorStyle): Bitmap {
  const height = cursor.sizePx;
  const width = Math.max(2, Math.round(height * ARROW_ASPECT));
  const bitmap = createBitmap(width, height);

  const polygon: Point2[] = ARROW_POLYGON.map(([x, y]) => ({ x: x * height, y: y * height }));
  const fill = parseHexColor(cursor.color);
  const outline = parseHexColor(cursor.outlineColor);
  const outlineWidth = Math.max(1, height * 0.05);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const samples: Sample[] = [];
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const point = {
            x: x + (sx + 0.5) / SUPERSAMPLE,
            y: y + (sy + 0.5) / SUPERSAMPLE,
          };
          const inside = pointInPolygon(point, polygon);
          const distance = distanceToPolygon(point, polygon);
          if (inside && distance > outlineWidth) {
            samples.push({ rgb: fill, alpha: 1 });
          } else if (inside || distance <= outlineWidth) {
            samples.push({ rgb: outline, alpha: 1 });
          } else {
            samples.push({ rgb: outline, alpha: 0 });
          }
        }
      }
      const { rgb, alpha } = accumulate(samples);
      if (alpha > 0) {
        setPixel(bitmap, x, y, rgb, alpha * cursor.opacity);
      }
    }
  }

  return bitmap;
}

/**
 * Rasterizes the ripple as a ring at its LARGEST radius.
 *
 * The graph scales this sprite up from the start diameter to the end
 * diameter over the ripple's lifetime, so drawing at the end size means
 * the ring is only ever downscaled and never resampled past its own
 * resolution.
 */
export function renderRippleSprite(ripple: ClickRipple): Bitmap {
  const diameter = Math.max(4, Math.round(ripple.endRadiusPx * 2));
  const bitmap = createBitmap(diameter, diameter);

  const centre = diameter / 2;
  const outerRadius = centre - 0.5;
  const innerRadius = Math.max(0, outerRadius - Math.max(1, ripple.thicknessPx));
  const colour = parseHexColor(ripple.color);

  for (let y = 0; y < diameter; y += 1) {
    for (let x = 0; x < diameter; x += 1) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const px = x + (sx + 0.5) / SUPERSAMPLE - centre;
          const py = y + (sy + 0.5) / SUPERSAMPLE - centre;
          const distance = Math.hypot(px, py);
          if (distance <= outerRadius && distance >= innerRadius) {
            covered += 1;
          }
        }
      }
      if (covered > 0) {
        setPixel(bitmap, x, y, colour, (covered / (SUPERSAMPLE * SUPERSAMPLE)) * ripple.opacity);
      }
    }
  }

  return bitmap;
}

export function encodeCursorSprite(cursor: CursorStyle): Buffer {
  return encodePng(renderCursorSprite(cursor));
}

export function encodeRippleSprite(ripple: ClickRipple): Buffer {
  return encodePng(renderRippleSprite(ripple));
}
