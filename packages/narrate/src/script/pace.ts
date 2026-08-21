/** AC1: target reading pace, words per minute (corpus: "target pace ~150 wpm"). */
export const TARGET_WORDS_PER_MINUTE = 150;

/** Counts words by whitespace splitting, ignoring empty tokens from leading/trailing/repeated whitespace. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

/** Milliseconds it would take to read `text` aloud at `wordsPerMinute` (defaults to the 150 wpm target). */
export function readingTimeMs(
  text: string,
  wordsPerMinute: number = TARGET_WORDS_PER_MINUTE,
): number {
  if (wordsPerMinute <= 0) {
    throw new RangeError(`wordsPerMinute must be positive, received ${wordsPerMinute}.`);
  }
  return (countWords(text) / wordsPerMinute) * 60_000;
}

/**
 * AC1's "duration hints from settle times": a step's narration should
 * take at least as long as the UI took to settle (so narration never
 * finishes talking about a state the page hasn't reached yet), but never
 * shorter than the text actually takes to read at the target pace. The
 * hint is therefore the larger of the two.
 */
export function computeDurationHintMs(
  text: string,
  settleMs: number,
  wordsPerMinute: number = TARGET_WORDS_PER_MINUTE,
): number {
  return Math.max(readingTimeMs(text, wordsPerMinute), settleMs);
}
