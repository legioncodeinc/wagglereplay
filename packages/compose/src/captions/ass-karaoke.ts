// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  DEFAULT_MAX_CHARS_PER_LINE,
  DEFAULT_MAX_LINES_PER_CUE,
  type WordTiming,
} from '@waggle/narrate';
import type { KaraokeStyle } from '../brand/schema.js';
import { escapeAssText } from './ass-primitives.js';

/**
 * Word-level karaoke cues (prd-007 AC2, task 4).
 *
 * The corpus fixes the technique: "word-level karaoke via ASS k/kf tags
 * (centisecond durations) generated from words.json".
 *
 * Why this re-implements grouping instead of calling `@waggle/narrate`'s
 * `buildCaptionCues`: that function returns each cue's lines as STRINGS,
 * which is exactly right for SRT and VTT and useless here, because a
 * karaoke line needs the per-word timings to survive the wrap in order to
 * emit one `\k` tag per word. The wrapping RULES are shared, though: the
 * two caps below are imported from `@waggle/narrate` rather than restated,
 * so a change to Waggle's caption geometry lands in both renderers at
 * once.
 */

export { DEFAULT_MAX_CHARS_PER_LINE, DEFAULT_MAX_LINES_PER_CUE };

export interface KaraokeCue {
  /** 1-based, matching the SRT numbering `@waggle/narrate` produces. */
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  /** The cue's words, already wrapped into lines but still fully timed. */
  readonly lines: readonly (readonly WordTiming[])[];
}

export interface KaraokeCueOptions {
  readonly maxCharsPerLine?: number;
  readonly maxLinesPerCue?: number;
}

function lineLength(line: readonly WordTiming[]): number {
  if (line.length === 0) {
    return 0;
  }
  let length = line.length - 1;
  for (const word of line) {
    length += word.word.length;
  }
  return length;
}

/**
 * Greedily groups timed words into cues, wrapping to the next line before
 * starting a new cue and never splitting a word. Mirrors
 * `buildCaptionCues`'s behaviour word for word so the burned captions and
 * the sidecar `.srt` break in the same places.
 */
export function buildKaraokeCues(
  words: readonly WordTiming[],
  options: KaraokeCueOptions = {},
): KaraokeCue[] {
  const maxCharsPerLine = options.maxCharsPerLine ?? DEFAULT_MAX_CHARS_PER_LINE;
  const maxLinesPerCue = options.maxLinesPerCue ?? DEFAULT_MAX_LINES_PER_CUE;
  if (maxLinesPerCue < 1) {
    throw new RangeError(`maxLinesPerCue must be at least 1, received ${maxLinesPerCue}.`);
  }

  const cues: KaraokeCue[] = [];
  let lines: WordTiming[][] = [[]];

  const finalize = (): void => {
    const nonEmpty = lines.filter((line) => line.length > 0);
    if (nonEmpty.length === 0) {
      lines = [[]];
      return;
    }
    const flat = nonEmpty.flat();
    const first = flat[0];
    const last = flat[flat.length - 1];
    if (first !== undefined && last !== undefined) {
      cues.push({
        index: cues.length + 1,
        startMs: first.startMs,
        endMs: last.endMs,
        lines: nonEmpty,
      });
    }
    lines = [[]];
  };

  for (const word of words) {
    const currentIndex = lines.length - 1;
    const current = lines[currentIndex] ?? [];
    const candidateLength = lineLength(current) + (current.length === 0 ? 0 : 1) + word.word.length;
    if (candidateLength <= maxCharsPerLine) {
      current.push(word);
      lines[currentIndex] = current;
      continue;
    }
    if (lines.length < maxLinesPerCue) {
      lines.push([word]);
      continue;
    }
    finalize();
    lines = [[word]];
  }
  finalize();

  return cues;
}

/**
 * Converts a millisecond instant to the centisecond grid ASS `\k` counts
 * in. Every duration in a karaoke line is a DIFFERENCE of two values from
 * this function, never an independently rounded duration: rounding each
 * duration on its own accumulates drift, so a long line ends visibly out
 * of sync with the audio it was generated from.
 */
function toCentiseconds(msValue: number): number {
  return Math.round(msValue / 10);
}

/**
 * Renders one cue's `Text` field: a run of `{\k<cs>}` (or `{\kf<cs>}`)
 * tokens, one per word, with the inter-word gaps folded into the space
 * that precedes the next word so the highlight never runs ahead of the
 * voice.
 */
export function renderKaraokeText(cue: KaraokeCue, style: KaraokeStyle): string {
  const tag = style === 'sweep' ? 'kf' : 'k';
  const renderedLines: string[] = [];
  let cursorCs = toCentiseconds(cue.startMs);

  for (const line of cue.lines) {
    const tokens: string[] = [];
    for (let i = 0; i < line.length; i += 1) {
      const word = line[i];
      if (word === undefined) {
        continue;
      }
      const startCs = toCentiseconds(word.startMs);
      const gapCs = Math.max(0, startCs - cursorCs);
      if (gapCs > 0) {
        // An untimed run before this word: hold the previous highlight
        // state for the gap, attached to the separating space.
        tokens.push(`{\\${tag}${gapCs}}${i === 0 ? '' : ' '}`);
        cursorCs = startCs;
      } else if (i > 0) {
        tokens.push(' ');
      }
      const endCs = toCentiseconds(word.endMs);
      const durationCs = Math.max(0, endCs - cursorCs);
      tokens.push(`{\\${tag}${durationCs}}${escapeAssText(word.word)}`);
      cursorCs += durationCs;
    }
    renderedLines.push(tokens.join(''));
  }

  return renderedLines.join('\\N');
}
