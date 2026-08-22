// SPDX-License-Identifier: AGPL-3.0-or-later
import type { WordTiming } from './schema.js';

/** AC4: caption cues are capped at 42 characters per line, 2 lines per cue. */
export const DEFAULT_MAX_CHARS_PER_LINE = 42;
export const DEFAULT_MAX_LINES_PER_CUE = 2;

export interface CaptionCueOptions {
  readonly maxCharsPerLine?: number;
  readonly maxLinesPerCue?: number;
}

export interface CaptionCue {
  /** 1-based cue index, matching SRT's own numbering convention. */
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  /** 1 or 2 lines, each within `maxCharsPerLine` (a single overlong word is never split). */
  readonly lines: readonly string[];
}

function fits(line: string, word: string, maxChars: number): boolean {
  const candidate = line === '' ? word : `${line} ${word}`;
  return candidate.length <= maxChars;
}

function appendWord(line: string, word: string): string {
  return line === '' ? word : `${line} ${word}`;
}

/**
 * Greedily groups timed words into caption cues, wrapping to a second line
 * before starting a new cue, and never splitting a single word across
 * lines or cues. A cue's `startMs`/`endMs` span exactly the words it
 * contains, so cues built from a monotonic `words` array are themselves
 * monotonic and gap-free between the first and last word.
 */
export function buildCaptionCues(
  words: readonly WordTiming[],
  options: CaptionCueOptions = {},
): CaptionCue[] {
  const maxCharsPerLine = options.maxCharsPerLine ?? DEFAULT_MAX_CHARS_PER_LINE;
  const maxLinesPerCue = options.maxLinesPerCue ?? DEFAULT_MAX_LINES_PER_CUE;
  if (maxLinesPerCue < 1) {
    throw new RangeError(`maxLinesPerCue must be at least 1, received ${maxLinesPerCue}.`);
  }

  const cues: CaptionCue[] = [];
  let lines: string[] = [''];
  let cueWords: WordTiming[] = [];

  const finalizeCue = (): void => {
    if (cueWords.length === 0) {
      return;
    }
    const nonEmptyLines = lines.filter((line) => line !== '');
    const first = cueWords[0];
    const last = cueWords[cueWords.length - 1];
    if (first !== undefined && last !== undefined) {
      cues.push({
        index: cues.length + 1,
        startMs: first.startMs,
        endMs: last.endMs,
        lines: nonEmptyLines,
      });
    }
    lines = [''];
    cueWords = [];
  };

  for (const word of words) {
    const currentLineIndex = lines.length - 1;
    const currentLine = lines[currentLineIndex] ?? '';
    if (fits(currentLine, word.word, maxCharsPerLine)) {
      lines[currentLineIndex] = appendWord(currentLine, word.word);
      cueWords.push(word);
      continue;
    }
    if (lines.length < maxLinesPerCue) {
      lines.push(word.word);
      cueWords.push(word);
      continue;
    }
    finalizeCue();
    lines = [word.word];
    cueWords = [word];
  }
  finalizeCue();

  return cues;
}
