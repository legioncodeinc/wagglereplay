import type { LayerAnchor } from '../brand/schema.js';

/**
 * The small, exact conversions the ASS format demands. Every one of them
 * is a documented footgun, which is why they live together in one tested
 * module instead of being inlined at three call sites.
 *
 * Reference: the ASS tag documentation the corpus cites,
 * https://aegisub.org/docs/latest/ass_tags/
 */

/**
 * `#rrggbb` plus an opacity to an ASS colour literal.
 *
 * ASS colours are `&HAABBGGRR`: BYTE-REVERSED relative to HTML (blue
 * first, not red), and the alpha byte is INVERTED (`00` is fully opaque,
 * `FF` is fully transparent). Both inversions are silent when wrong: the
 * render simply comes out the wrong colour.
 */
export function toAssColor(hex: string, opacity = 1): string {
  const { r, g, b } = parseHexColor(hex);
  const alpha = Math.round((1 - clamp01(opacity)) * 255);
  return `&H${byte(alpha)}${byte(b)}${byte(g)}${byte(r)}`;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function parseHexColor(hex: string): Rgb {
  const body = hex.startsWith('#') ? hex.slice(1) : hex;
  const expanded =
    body.length === 3
      ? body
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : body;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new RangeError(`"${hex}" is not a #rgb or #rrggbb colour.`);
  }
  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

/** `#rrggbb` to the `0xRRGGBB` literal ffmpeg's own `color=` option takes. */
export function toFfmpegColor(hex: string): string {
  const { r, g, b } = parseHexColor(hex);
  return `0x${byte(r)}${byte(g)}${byte(b)}`;
}

function byte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .toUpperCase()
    .padStart(2, '0');
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * ASS timestamps are `H:MM:SS.cc`: exactly one hour digit and exactly two
 * centisecond digits. A zero-padded two-digit hour is not accepted by
 * every parser, so the hour is deliberately not padded.
 */
export function toAssTime(totalMs: number): string {
  const clamped = Math.max(0, Math.round(totalMs));
  const centis = Math.floor(clamped / 10) % 100;
  const seconds = Math.floor(clamped / 1000) % 60;
  const minutes = Math.floor(clamped / 60_000) % 60;
  const hours = Math.floor(clamped / 3_600_000);
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Escapes text for an ASS `Dialogue` field.
 *
 * Two hazards, both silent:
 *
 *  - `{` opens an override block. An unescaped brace in narration text
 *    swallows everything up to the next `}` and can inject arbitrary style
 *    overrides. `\{` and `\}` are the documented escapes.
 *  - `\N`, `\n`, and `\h` are ASS's hard line break, soft line break, and
 *    non-breaking space. ASS has NO escape for a literal backslash, so a
 *    backslash that happens to precede one of those three letters cannot
 *    be represented; the backslash is dropped and the letter kept, which
 *    is the only transformation here that changes what the reader sees.
 *    It is preferred over the alternative (a caption that silently breaks
 *    in the middle) and it is why callers pass ALREADY-SPLIT lines and
 *    let this function insert the real `\N` itself.
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\([Nnh])/g, '$1')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r\n?|\n/g, ' ');
}

/** Joins already-wrapped caption lines with ASS's hard line break. */
export function joinAssLines(lines: readonly string[]): string {
  return lines.join('\\N');
}

/**
 * Sanitizes a value that lands in a `Style:` CSV field.
 *
 * ASS rows are comma-separated with no quoting mechanism whatsoever, so a
 * comma in a brand kit's font name would shift every following field by
 * one and produce a style that parses but looks nothing like the kit.
 * Font names never legitimately contain a comma.
 */
export function sanitizeAssField(value: string): string {
  return value.replace(/[,\r\n]/g, ' ').trim();
}

/** The numpad-layout `Alignment` value an ASS style takes. */
export function toAssAlignment(anchor: LayerAnchor): number {
  switch (anchor) {
    case 'bottom-left':
      return 1;
    case 'bottom-center':
      return 2;
    case 'bottom-right':
      return 3;
    case 'center-left':
      return 4;
    case 'center':
      return 5;
    case 'center-right':
      return 6;
    case 'top-left':
      return 7;
    case 'top-center':
      return 8;
    case 'top-right':
      return 9;
    default: {
      const exhaustive: never = anchor;
      throw new RangeError(`Unhandled anchor ${String(exhaustive)}.`);
    }
  }
}
