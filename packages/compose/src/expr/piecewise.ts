// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ffmpeg expression construction.
 *
 * Two rules govern every function here, and both exist to serve AC4's
 * "graph text is deterministic for identical inputs":
 *
 *  1. Every number that reaches a filter graph goes through `num()`. Bare
 *     `String(x)` would leak `1e-7`, `0.30000000000000004`, and `-0` into
 *     the graph text, all of which are stable per-run but hostile to a
 *     golden file and, in the `1e-7` case, not even valid ffmpeg
 *     expression syntax.
 *  2. Nothing here reads the clock, the filesystem, or the environment. A
 *     graph is a pure function of its inputs or the determinism claim is
 *     not testable.
 *
 * The piecewise builder uses a SUM of `between()`-gated terms rather than
 * nested `if()`s. Nesting a hundred `if()`s builds a hundred-deep parse
 * tree; a sum stays flat, is trivially readable in a golden file, and
 * evaluates every segment's guard independently.
 */

/** Decimal places every generated number is rounded to. */
export const EXPR_PRECISION = 4;

/**
 * Formats a number for a filter graph: fixed precision, no exponent, no
 * negative zero, no trailing zeros.
 */
export function num(value: number, precision: number = EXPR_PRECISION): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot put a non-finite value (${String(value)}) into a filter graph.`);
  }
  const rounded = Number(value.toFixed(precision));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const text = normalized.toFixed(precision);
  const trimmed = text.replace(/\.?0+$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

/** Milliseconds to a seconds literal, for the `t` variable's units. */
export function ms(value: number, precision: number = EXPR_PRECISION): string {
  return num(value / 1000, precision);
}

export interface Keyframe {
  /** Time in milliseconds on the composited timeline. */
  readonly atMs: number;
  readonly value: number;
}

/** How a segment between two keyframes is interpolated. */
export const EASINGS = ['linear', 'smoothstep'] as const;
export type Easing = (typeof EASINGS)[number];

/**
 * Builds `p` as an expression in `t`, given the normalized progress
 * expression `pExpr` (0 at the segment start, 1 at its end).
 *
 * `smoothstep` is the classic 3p^2 - 2p^3 Hermite curve: zero derivative
 * at both ends, which is what makes a zoom look eased rather than hinged.
 */
function applyEasing(pExpr: string, easing: Easing): string {
  if (easing === 'linear') {
    return pExpr;
  }
  return `(3*pow(${pExpr},2)-2*pow(${pExpr},3))`;
}

/**
 * Builds a piecewise expression in `t` (seconds) through `keyframes`,
 * clamped to the first value before the first keyframe and the last value
 * after the last one.
 *
 * Keyframes must be sorted by `atMs`; duplicate times are collapsed to the
 * later value so a step change (a hard cut between two focus points) is
 * expressible.
 */
export function piecewise(keyframes: readonly Keyframe[], easing: Easing = 'linear'): string {
  if (keyframes.length === 0) {
    throw new RangeError('A piecewise expression needs at least one keyframe.');
  }
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (first === undefined || last === undefined) {
    throw new RangeError('A piecewise expression needs at least one keyframe.');
  }
  if (keyframes.length === 1) {
    return num(first.value);
  }

  const terms: string[] = [`(lt(t,${ms(first.atMs)})*${num(first.value)})`];

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const from = keyframes[i];
    const to = keyframes[i + 1];
    if (from === undefined || to === undefined) {
      continue;
    }
    const spanMs = to.atMs - from.atMs;
    if (spanMs <= 0) {
      // Zero-length segment: the later keyframe simply wins from its own
      // instant onward, which the following segments already express.
      continue;
    }
    const startS = ms(from.atMs);
    const endS = ms(to.atMs);
    // `gte(t,start)*lt(t,end)` rather than `between()`: `between` is
    // inclusive at BOTH ends, so adjacent segments would both fire on the
    // shared boundary instant and the sum would double-count there.
    const gate = `gte(t,${startS})*lt(t,${endS})`;
    const progress = applyEasing(`((t-${startS})/${num(spanMs / 1000)})`, easing);
    const delta = to.value - from.value;
    const body = delta === 0 ? num(from.value) : `(${num(from.value)}+${num(delta)}*${progress})`;
    terms.push(`(${gate}*${body})`);
  }

  terms.push(`(gte(t,${ms(last.atMs)})*${num(last.value)})`);
  return terms.join('+');
}

/** `min(max(expr, lo), hi)` with both bounds as arbitrary expressions. */
export function clampExpr(expr: string, lo: string, hi: string): string {
  return `min(max(${expr},${lo}),${hi})`;
}

/** An ffmpeg `enable=` window over `[startMs, endMs)`. */
export function enableWindow(startMs: number, endMs: number): string {
  return `between(t,${ms(startMs)},${ms(endMs)})`;
}
