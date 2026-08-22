// SPDX-License-Identifier: AGPL-3.0-or-later
import { aggregateCharsToWords, type CharAlignment } from '../../words/aggregate.js';
import type { WordTiming } from '../../words/schema.js';

/**
 * Maps ElevenLabs' `normalized_alignment` timing onto the ORIGINAL
 * author-approved text (corpus: "use normalized for audio timing, map
 * back to original text for captions, or numbers desync"). ElevenLabs
 * itself normalizes spoken text before timing it ("$13" is timed as
 * "thirteen dollars"), so the normalized word list and the original word
 * list do not always line up 1:1.
 *
 * Two paths, in order of accuracy:
 *
 *  1. EXACT (the common case): when the original text and the normalized
 *     text produce the same NUMBER of words, no expansion happened for
 *     this segment (true for the overwhelming majority of narration,
 *     which rarely contains currency or numerals), and each original word
 *     is paired 1:1, in order, with its normalized counterpart's timing.
 *     This is exact, not approximate.
 *
 *  2. PROPORTIONAL FALLBACK: when the counts differ (a number/currency/etc.
 *     token expanded), the normalized words' combined time span is
 *     redistributed across the original words weighted by each original
 *     word's character length. This is a documented approximation: it
 *     assumes roughly uniform speaking pace across the expanded span,
 *     which is not always true (a quick "$" takes less real time than
 *     "dollars"), but it guarantees a monotonic, gap-free, duration-
 *     accurate result even for the desync-prone content the corpus warns
 *     about, and it is the same span ElevenLabs' own audio actually
 *     occupies. A future pass could replace this with proper DP sequence
 *     alignment; this is intentionally simple and testable for v1.
 */
export function mapOriginalTextToNormalizedTiming(
  originalAlignment: CharAlignment,
  normalizedAlignment: CharAlignment,
): WordTiming[] {
  const originalWords = aggregateCharsToWords(originalAlignment);
  const normalizedWords = aggregateCharsToWords(normalizedAlignment);

  if (originalWords.length === 0) {
    return [];
  }

  if (originalWords.length === normalizedWords.length) {
    return originalWords.map((word, i) => {
      const timing = normalizedWords[i];
      return timing === undefined
        ? word
        : { word: word.word, startMs: timing.startMs, endMs: timing.endMs };
    });
  }

  // Proportional fallback: redistribute the normalized words' total span
  // across the original words by character-length weight.
  const spanStartMs = normalizedWords[0]?.startMs ?? 0;
  const spanEndMs = normalizedWords[normalizedWords.length - 1]?.endMs ?? spanStartMs;
  const spanMs = Math.max(0, spanEndMs - spanStartMs);
  const totalChars = originalWords.reduce((sum, word) => sum + word.word.length, 0);

  if (totalChars === 0 || spanMs === 0) {
    return originalWords.map((word) => ({
      word: word.word,
      startMs: spanStartMs,
      endMs: spanStartMs,
    }));
  }

  const result: WordTiming[] = [];
  let cumulativeChars = 0;
  for (const word of originalWords) {
    const startMs = spanStartMs + (spanMs * cumulativeChars) / totalChars;
    cumulativeChars += word.word.length;
    const endMs = spanStartMs + (spanMs * cumulativeChars) / totalChars;
    result.push({ word: word.word, startMs, endMs });
  }
  return result;
}
