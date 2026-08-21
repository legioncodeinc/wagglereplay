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
 * Escapes text for an ASS `Dialogue` field, so the caller's text is inert
 * data rather than ASS syntax.
 *
 * Three hazards, all silent:
 *
 *  - `{` opens an override block. An unescaped brace in narration text
 *    swallows everything up to the next `}` and can inject arbitrary style
 *    overrides. `\{` and `\}` are the documented escapes.
 *  - `\N`, `\n`, and `\h` are ASS's hard line break, soft line break, and
 *    non-breaking space. Callers pass ALREADY-SPLIT lines and let
 *    `joinAssLines` insert the real `\N`, so any of the three appearing in
 *    caption text is an injected control sequence, not content.
 *  - ASS has NO escape for a literal backslash. That is a real format
 *    limitation (verified against libass: `\\` renders as a backslash
 *    followed by whatever the next escape does, it is not itself an
 *    escape), so a backslash in the caller's text cannot be represented
 *    and is DROPPED. This is the only transformation here that changes
 *    what the reader sees, and it is preferred over the alternative: a
 *    caption that silently breaks in the middle.
 *
 * Dropping every backslash rather than only the ones preceding `N`/`n`/`h`
 * is load-bearing, not tidiness. The previous implementation deleted one
 * backslash from `\N`, which meant an input of `\\N` survived the pass as
 * a functioning `\N` and injected a real hard line break into the caption
 * (confirmed by rendering: the frame came back with two lines, pixel
 * identical to a caption containing a genuine break). Caption text reaches
 * this function from a brand kit and a narration script that live in a
 * git-committable, shareable project directory, so it crosses a trust
 * boundary and the reconstruction was reachable. Escaping in a single pass
 * closes it: no stage re-reads another stage's output, so no output
 * backslash can pair with a neighbour to re-form a control sequence, and
 * the only backslashes in the result are the ones inserted here.
 */
export function escapeAssText(text: string): string {
  let escaped = '';
  let afterCarriageReturn = false;
  for (const char of text) {
    const wasAfterCarriageReturn = afterCarriageReturn;
    afterCarriageReturn = char === '\r';
    if (char === '\\') continue;
    if (char === '{') escaped += '\\{';
    else if (char === '}') escaped += '\\}';
    // A CRLF pair collapses to ONE space, not two.
    else if (char === '\n') escaped += wasAfterCarriageReturn ? '' : ' ';
    else if (char === '\r') escaped += ' ';
    else escaped += char;
  }
  return escaped;
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
