// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { mapOriginalTextToNormalizedTiming } from '../../../src/tts/elevenlabs/alignment-mapping.js';
import type { CharAlignment } from '../../../src/words/aggregate.js';

function alignmentFor(text: string, msPerChar = 100): CharAlignment {
  const characters = text.split('');
  return {
    characters,
    characterStartMs: characters.map((_, i) => i * msPerChar),
    characterEndMs: characters.map((_, i) => (i + 1) * msPerChar),
  };
}

describe('mapOriginalTextToNormalizedTiming', () => {
  it('pairs original words 1:1 with normalized timing when the word counts match (the common, exact case)', () => {
    const original = alignmentFor('Click submit', 50);
    // Same word count, different per-char timing (imagine a different voice pace).
    const normalized = alignmentFor('Click submit', 120);

    const words = mapOriginalTextToNormalizedTiming(original, normalized);
    expect(words.map((w) => w.word)).toEqual(['Click', 'submit']);
    // Timing comes from the NORMALIZED alignment, not the original's.
    expect(words[0]?.startMs).toBe(0);
    expect(words[0]?.endMs).toBe(5 * 120); // "Click" = 5 chars
  });

  it('shows the ORIGINAL text in captions even when normalization expanded a token', () => {
    // "$13" (3 chars) normalizes to "thirteen dollars" (2 words) for speech.
    const original = alignmentFor('Pay $13 now', 80);
    const normalized = alignmentFor('Pay thirteen dollars now', 80);

    const words = mapOriginalTextToNormalizedTiming(original, normalized);
    // Captions must read the ORIGINAL text, never the provider's expansion.
    expect(words.map((w) => w.word)).toEqual(['Pay', '$13', 'now']);
  });

  it('keeps the fallback path monotonic and within the normalized span even on expansion', () => {
    const original = alignmentFor('Pay $13 now', 80);
    const normalized = alignmentFor('Pay thirteen dollars now', 80);
    const words = mapOriginalTextToNormalizedTiming(original, normalized);

    for (let i = 1; i < words.length; i += 1) {
      const prev = words[i - 1];
      const curr = words[i];
      if (prev === undefined || curr === undefined) continue;
      expect(curr.startMs).toBeGreaterThanOrEqual(prev.endMs);
    }
    const last = words[words.length - 1];
    const normalizedWords = normalized.characters.join('').split(' ');
    expect(normalizedWords).toHaveLength(4); // sanity: normalization did expand the word count
    if (last !== undefined) {
      expect(last.endMs).toBeLessThanOrEqual(
        normalized.characterEndMs[normalized.characterEndMs.length - 1] ?? 0,
      );
    }
  });

  it('returns an empty array for empty original text', () => {
    const words = mapOriginalTextToNormalizedTiming(alignmentFor(''), alignmentFor(''));
    expect(words).toEqual([]);
  });
});
