import type { CharAlignment } from '../words/aggregate.js';
import type { SynthesizeResult, TtsAdapter } from './types.js';

/** One text chunk ready to hand to `adapter.synthesize`, with its offset into the full script. */
export interface TextChunk {
  readonly text: string;
  /** Character offset of `text[0]` within the original full text. */
  readonly charOffset: number;
}

/**
 * Splits `fullText` into chunks no longer than `maxChars`, always breaking
 * at whitespace so no chunk starts or ends mid-word (AC3: "chunk stitching
 * respects per-model char caps"). A single word longer than `maxChars` is
 * still emitted as its own oversized chunk rather than split, since a
 * split word could never be requested from a TTS provider meaningfully.
 */
export function splitTextIntoChunks(fullText: string, maxChars: number): TextChunk[] {
  if (maxChars <= 0) {
    throw new RangeError(`maxChars must be positive, received ${maxChars}.`);
  }
  const trimmed = fullText.trim();
  if (trimmed.length === 0) {
    return [];
  }

  // Tokenize on whitespace, keeping each token's offset in the ORIGINAL
  // (untrimmed) string so charOffset always points at a real position in
  // fullText, not at the trimmed copy.
  const tokens: Array<{ text: string; offset: number }> = [];
  const tokenRe = /\S+/g;
  let match: RegExpExecArray | null = tokenRe.exec(fullText);
  while (match !== null) {
    tokens.push({ text: match[0], offset: match.index });
    match = tokenRe.exec(fullText);
  }

  const chunks: TextChunk[] = [];
  let currentTokens: Array<{ text: string; offset: number }> = [];
  let currentLength = 0;

  const flush = (): void => {
    if (currentTokens.length === 0) {
      return;
    }
    const first = currentTokens[0];
    if (first === undefined) {
      return;
    }
    chunks.push({
      text: currentTokens.map((token) => token.text).join(' '),
      charOffset: first.offset,
    });
    currentTokens = [];
    currentLength = 0;
  };

  for (const token of tokens) {
    const additional = currentTokens.length === 0 ? token.text.length : token.text.length + 1;
    if (currentTokens.length > 0 && currentLength + additional > maxChars) {
      flush();
    }
    currentTokens.push(token);
    currentLength += currentTokens.length === 1 ? token.text.length : token.text.length + 1;
  }
  flush();

  return chunks;
}

function offsetAlignment(alignment: CharAlignment, offsetMs: number): CharAlignment {
  return {
    characters: alignment.characters,
    characterStartMs: alignment.characterStartMs.map((ms) => ms + offsetMs),
    characterEndMs: alignment.characterEndMs.map((ms) => ms + offsetMs),
  };
}

function concatAlignments(alignments: readonly CharAlignment[]): CharAlignment {
  return {
    characters: alignments.flatMap((a) => a.characters),
    characterStartMs: alignments.flatMap((a) => a.characterStartMs),
    characterEndMs: alignments.flatMap((a) => a.characterEndMs),
  };
}

function alignmentDurationMs(alignment: CharAlignment | null): number {
  if (alignment === null || alignment.characterEndMs.length === 0) {
    return 0;
  }
  return Math.max(...alignment.characterEndMs);
}

export interface StitchedSynthesisResult {
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly originalText: string;
  readonly alignment: CharAlignment | null;
  readonly normalizedAlignment: CharAlignment | null;
  readonly durationMs: number;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * The AC3 chunk-stitching entry point: the only way narrate code should
 * call a TTS adapter for a full script, since a script routinely exceeds a
 * single request's char cap (Deepgram's is 2k; even ElevenLabs Flash caps
 * at 40k). Splits on `adapter.capabilities.maxCharsPerRequest`, calls
 * `adapter.synthesize` once per chunk, concatenates the raw audio bytes in
 * order (valid for same-bitrate MP3/PCM output from a single provider
 * call, which is what every adapter here produces), and re-bases every
 * subsequent chunk's character timings by the CUMULATIVE duration of the
 * chunks before it, so the stitched alignment reads as one continuous
 * timeline with no seam artifacts (seam-tested in
 * test/tts/chunked-synthesize.test.ts).
 */
export async function synthesizeChunked(
  adapter: TtsAdapter,
  fullText: string,
  options: { voiceId?: string } = {},
): Promise<StitchedSynthesisResult> {
  const chunks = splitTextIntoChunks(fullText, adapter.capabilities.maxCharsPerRequest);
  if (chunks.length === 0) {
    throw new RangeError('Cannot synthesize empty text.');
  }

  const results: SynthesizeResult[] = [];
  let cumulativeMs = 0;
  const alignments: CharAlignment[] = [];
  const normalizedAlignments: CharAlignment[] = [];
  let hasAlignment = adapter.capabilities.timestamps === 'char';

  for (const chunk of chunks) {
    const result = await adapter.synthesize({ text: chunk.text, voiceId: options.voiceId });
    results.push(result);

    if (hasAlignment && result.alignment !== null) {
      alignments.push(offsetAlignment(result.alignment, cumulativeMs));
    } else {
      hasAlignment = false;
    }
    if (hasAlignment && result.normalizedAlignment !== null) {
      normalizedAlignments.push(offsetAlignment(result.normalizedAlignment, cumulativeMs));
    }

    const chunkDurationMs =
      result.normalizedAlignment !== null
        ? alignmentDurationMs(result.normalizedAlignment)
        : alignmentDurationMs(result.alignment);
    cumulativeMs += chunkDurationMs;
  }

  const first = results[0];
  if (first === undefined) {
    throw new RangeError('Cannot synthesize empty text.');
  }

  return {
    audio: concatBytes(results.map((r) => r.audio)),
    mimeType: first.mimeType,
    originalText: fullText,
    alignment:
      hasAlignment && alignments.length === chunks.length ? concatAlignments(alignments) : null,
    normalizedAlignment:
      hasAlignment && normalizedAlignments.length === chunks.length
        ? concatAlignments(normalizedAlignments)
        : null,
    durationMs: cumulativeMs,
  };
}
