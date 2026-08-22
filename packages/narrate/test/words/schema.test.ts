// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { assertMonotonicWords, WordTimingOrderError } from '../../src/words/schema.js';

describe('assertMonotonicWords', () => {
  it('accepts a monotonic, gap-free words array within the duration', () => {
    expect(() =>
      assertMonotonicWords(
        [
          { word: 'Hello', startMs: 0, endMs: 500 },
          { word: 'world', startMs: 500, endMs: 1000 },
        ],
        1000,
      ),
    ).not.toThrow();
  });

  it('accepts gaps between words (silence), just not overlaps', () => {
    expect(() =>
      assertMonotonicWords(
        [
          { word: 'Hello', startMs: 0, endMs: 400 },
          { word: 'world', startMs: 500, endMs: 900 },
        ],
        1000,
      ),
    ).not.toThrow();
  });

  it('rejects a word that starts before the previous word ends', () => {
    expect(() =>
      assertMonotonicWords(
        [
          { word: 'Hello', startMs: 0, endMs: 500 },
          { word: 'world', startMs: 400, endMs: 900 },
        ],
        1000,
      ),
    ).toThrow(WordTimingOrderError);
  });

  it('rejects a word whose start is after its own end', () => {
    expect(() => assertMonotonicWords([{ word: 'oops', startMs: 500, endMs: 100 }], 1000)).toThrow(
      WordTimingOrderError,
    );
  });

  it('rejects a word ending past the stated audio duration', () => {
    expect(() => assertMonotonicWords([{ word: 'Hello', startMs: 0, endMs: 1500 }], 1000)).toThrow(
      WordTimingOrderError,
    );
  });
});
