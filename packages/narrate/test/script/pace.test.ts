// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  computeDurationHintMs,
  countWords,
  readingTimeMs,
  TARGET_WORDS_PER_MINUTE,
} from '../../src/script/pace.js';

describe('countWords', () => {
  it('counts simple whitespace-separated words', () => {
    expect(countWords('Click the button')).toBe(3);
  });

  it('ignores repeated and leading/trailing whitespace', () => {
    expect(countWords('  Click   the button  ')).toBe(3);
  });

  it('returns 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
});

describe('readingTimeMs', () => {
  it('computes ms from word count at the target 150 wpm pace', () => {
    // 150 words at 150 wpm = exactly 60_000ms.
    const text = Array.from({ length: 150 }, () => 'word').join(' ');
    expect(readingTimeMs(text)).toBeCloseTo(60_000, 5);
  });

  it('defaults to TARGET_WORDS_PER_MINUTE', () => {
    expect(TARGET_WORDS_PER_MINUTE).toBe(150);
  });

  it('throws for a non-positive wpm', () => {
    expect(() => readingTimeMs('hello', 0)).toThrow(RangeError);
  });
});

describe('computeDurationHintMs', () => {
  it('uses reading time when it exceeds the settle time', () => {
    const text = Array.from({ length: 150 }, () => 'word').join(' '); // 60_000ms of reading
    expect(computeDurationHintMs(text, 500)).toBeCloseTo(60_000, 5);
  });

  it('uses settle time when it exceeds the reading time', () => {
    expect(computeDurationHintMs('Hi', 5_000)).toBe(5_000);
  });
});
