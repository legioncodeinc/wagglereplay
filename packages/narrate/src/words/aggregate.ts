// SPDX-License-Identifier: AGPL-3.0-or-later
import type { WordTiming } from './schema.js';

/**
 * Character-level timing for one contiguous stretch of text, all in
 * milliseconds relative to the same audio start. Every TTS adapter that
 * supports timestamps returns its provider-native alignment already
 * normalized to this shape (see ../tts/types.ts); the aggregation in this
 * module is Waggle's own job (corpus: "Char-to-word aggregation is
 * Waggle's job (whitespace grouping)"), not something any provider does
 * for us.
 */
export interface CharAlignment {
  readonly characters: readonly string[];
  readonly characterStartMs: readonly number[];
  readonly characterEndMs: readonly number[];
}

const WHITESPACE_RE = /^\s$/;

/**
 * Groups a character-level alignment into words by whitespace, exactly as
 * the corpus specifies. A word's `startMs` is its first character's start
 * time; its `endMs` is its last character's end time. Runs of whitespace
 * (including newlines) are dropped, never treated as part of a word.
 */
export function aggregateCharsToWords(alignment: CharAlignment): WordTiming[] {
  const { characters, characterStartMs, characterEndMs } = alignment;
  if (
    characters.length !== characterStartMs.length ||
    characters.length !== characterEndMs.length
  ) {
    throw new RangeError(
      `CharAlignment arrays must be the same length (characters=${characters.length}, characterStartMs=${characterStartMs.length}, characterEndMs=${characterEndMs.length}).`,
    );
  }

  const words: WordTiming[] = [];
  let bufferChars: string[] = [];
  let bufferStartMs = 0;
  let bufferEndMs = 0;

  const flush = (): void => {
    if (bufferChars.length === 0) {
      return;
    }
    words.push({ word: bufferChars.join(''), startMs: bufferStartMs, endMs: bufferEndMs });
    bufferChars = [];
  };

  for (let i = 0; i < characters.length; i += 1) {
    const ch = characters[i];
    const startMs = characterStartMs[i];
    const endMs = characterEndMs[i];
    if (ch === undefined || startMs === undefined || endMs === undefined) {
      continue;
    }
    if (WHITESPACE_RE.test(ch)) {
      flush();
      continue;
    }
    if (bufferChars.length === 0) {
      bufferStartMs = startMs;
    }
    bufferChars.push(ch);
    bufferEndMs = endMs;
  }
  flush();

  return words;
}
