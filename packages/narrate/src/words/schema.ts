// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

/**
 * The `words.json` shared contract.
 *
 * This is the ONE definition of per-word timing data in the workspace.
 * prd-007 (compositor) reads it to generate karaoke ASS captions; prd-013
 * (uploaded-audio alignment) must produce an IDENTICAL shape from a
 * completely different pipeline (ElevenLabs forced alignment, AssemblyAI,
 * or self-hosted WhisperX rather than TTS-native timestamps). Both
 * consumers import this module rather than redeclaring the shape, so there
 * is exactly one place a schema change has to happen.
 *
 * Design notes for prd-013:
 *  - `words[].startMs` / `endMs` are milliseconds relative to the start of
 *    `audioPath`, never a provider's native unit (ElevenLabs returns float
 *    seconds; Waggle always normalizes to integer-safe milliseconds at the
 *    adapter boundary, see ../tts/elevenlabs/client.ts).
 *  - `words` MUST be monotonically non-decreasing: for every i,
 *    `words[i].startMs <= words[i].endMs` and
 *    `words[i].endMs <= words[i + 1].startMs`. `assertMonotonicWords` below
 *    enforces this; call it before writing a document from any pipeline.
 *  - `sourceText` is the ORIGINAL author-approved text (never a TTS
 *    provider's internally-normalized text used only for pacing), so
 *    captions and the transcript never show a provider's own number
 *    expansion back to the reader.
 *  - `provider` is a free-text label naming which pipeline produced the
 *    document (e.g. "elevenlabs-tts", "elevenlabs-forced-alignment",
 *    "whisperx"), for debugging and QA, not a closed enum: prd-013 is free
 *    to add pipeline names this schema does not yet know about.
 */

export const NARRATION_WORDS_SCHEMA_VERSION = 1;

export const WordTimingSchema = z.strictObject({
  /** The word exactly as it appears in `sourceText` (no trailing punctuation trimming). */
  word: z.string().min(1, 'word must not be empty'),
  /** Milliseconds from the start of the audio. Never negative. */
  startMs: z.number().nonnegative('startMs must not be negative'),
  /** Milliseconds from the start of the audio. Always >= startMs. */
  endMs: z.number().nonnegative('endMs must not be negative'),
});

export type WordTiming = z.infer<typeof WordTimingSchema>;

export const NarrationWordsDocumentSchema = z.strictObject({
  schemaVersion: z.literal(NARRATION_WORDS_SCHEMA_VERSION),
  /** Free-text label for the pipeline that produced this document. */
  provider: z.string().min(1, 'provider must not be empty'),
  /** The full author-approved text this document times, in reading order. */
  sourceText: z.string(),
  /** Total audio duration in milliseconds. `words` must not exceed it. */
  durationMs: z.number().nonnegative('durationMs must not be negative'),
  words: z.array(WordTimingSchema),
});

export type NarrationWordsDocument = z.infer<typeof NarrationWordsDocumentSchema>;

/** Thrown by `assertMonotonicWords` when a words array violates the ordering contract. */
export class WordTimingOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordTimingOrderError';
  }
}

/**
 * Enforces the ordering contract every `words.json` producer must satisfy
 * (see the module doc above): non-decreasing, non-overlapping word spans
 * that do not run past `durationMs`. Every pipeline that writes a
 * `NarrationWordsDocument` (the ElevenLabs TTS path today; prd-013's
 * forced-alignment path tomorrow) must call this before writing.
 */
export function assertMonotonicWords(words: readonly WordTiming[], durationMs: number): void {
  let previousEndMs = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (word === undefined) {
      continue;
    }
    if (word.startMs > word.endMs) {
      throw new WordTimingOrderError(
        `words[${i}] ("${word.word}") starts (${word.startMs}ms) after it ends (${word.endMs}ms).`,
      );
    }
    if (word.startMs < previousEndMs) {
      throw new WordTimingOrderError(
        `words[${i}] ("${word.word}") starts at ${word.startMs}ms, before words[${i - 1}] ends at ${previousEndMs}ms. Word timings must be monotonically non-decreasing.`,
      );
    }
    if (word.endMs > durationMs) {
      throw new WordTimingOrderError(
        `words[${i}] ("${word.word}") ends at ${word.endMs}ms, past the audio duration of ${durationMs}ms.`,
      );
    }
    previousEndMs = word.endMs;
  }
}
