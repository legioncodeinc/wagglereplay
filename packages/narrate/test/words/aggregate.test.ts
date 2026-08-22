// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { aggregateCharsToWords, type CharAlignment } from '../../src/words/aggregate.js';

function alignmentFor(text: string, msPerChar = 100): CharAlignment {
  const characters = text.split('');
  const characterStartMs = characters.map((_, i) => i * msPerChar);
  const characterEndMs = characters.map((_, i) => (i + 1) * msPerChar);
  return { characters, characterStartMs, characterEndMs };
}

describe('aggregateCharsToWords', () => {
  it('groups characters into words by whitespace', () => {
    const words = aggregateCharsToWords(alignmentFor('Hi there'));
    expect(words.map((w) => w.word)).toEqual(['Hi', 'there']);
  });

  it("sets a word's startMs to its first character and endMs to its last character", () => {
    const words = aggregateCharsToWords(alignmentFor('Hi there', 100));
    // "Hi" = chars 0-1, "there" = chars 3-7 (index 2 is the space)
    expect(words[0]).toEqual({ word: 'Hi', startMs: 0, endMs: 200 });
    expect(words[1]).toEqual({ word: 'there', startMs: 300, endMs: 800 });
  });

  it('drops whitespace runs, including multiple spaces and newlines', () => {
    const words = aggregateCharsToWords(alignmentFor('a  b\nc'));
    expect(words.map((w) => w.word)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty array for whitespace-only input', () => {
    expect(aggregateCharsToWords(alignmentFor('   '))).toEqual([]);
  });

  it('throws when the alignment arrays are mismatched lengths', () => {
    const alignment: CharAlignment = {
      characters: ['a', 'b'],
      characterStartMs: [0],
      characterEndMs: [0, 1],
    };
    expect(() => aggregateCharsToWords(alignment)).toThrow(RangeError);
  });
});
