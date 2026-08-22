// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { splitTextIntoChunks, synthesizeChunked } from '../../src/tts/chunked-synthesize.js';
import type {
  SynthesizeOptions,
  SynthesizeResult,
  TtsAdapter,
  TtsCapabilities,
} from '../../src/tts/types.js';

describe('splitTextIntoChunks', () => {
  it('returns one chunk when the text fits under the cap', () => {
    const chunks = splitTextIntoChunks('Click the button', 100);
    expect(chunks).toEqual([{ text: 'Click the button', charOffset: 0 }]);
  });

  it('never splits a chunk mid-word', () => {
    const chunks = splitTextIntoChunks('one two three four five six seven', 12);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(12);
      expect(chunk.text.startsWith(' ')).toBe(false);
      expect(chunk.text.endsWith(' ')).toBe(false);
    }
    // every word survives, in order, across the chunk boundaries
    expect(chunks.flatMap((c) => c.text.split(' '))).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
    ]);
  });

  it('still emits a single oversized word as its own chunk rather than splitting it', () => {
    const chunks = splitTextIntoChunks('supercalifragilisticexpialidocious', 5);
    expect(chunks).toEqual([{ text: 'supercalifragilisticexpialidocious', charOffset: 0 }]);
  });

  it('returns an empty array for blank text', () => {
    expect(splitTextIntoChunks('   ', 10)).toEqual([]);
  });

  it('throws for a non-positive cap', () => {
    expect(() => splitTextIntoChunks('hi', 0)).toThrow(RangeError);
  });
});

/**
 * A fake adapter with a tiny char cap and deterministic per-character
 * timing (100ms/char), so `synthesizeChunked` is forced to split the test
 * text into multiple requests and the seam between them is inspectable.
 */
class FakeTimedAdapter implements TtsAdapter {
  readonly capabilities: TtsCapabilities = {
    provider: 'fake',
    model: 'fake-model',
    timestamps: 'char',
    maxCharsPerRequest: 10,
    costPerThousandChars: 0,
    beta: false,
  };

  async synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
    const characters = options.text.split('');
    const characterStartMs = characters.map((_, i) => i * 100);
    const characterEndMs = characters.map((_, i) => (i + 1) * 100);
    return {
      audio: new Uint8Array([options.text.length]),
      mimeType: 'audio/mpeg',
      originalText: options.text,
      alignment: { characters, characterStartMs, characterEndMs },
      normalizedAlignment: { characters, characterStartMs, characterEndMs },
    };
  }

  estimateCostUsd(): number {
    return 0;
  }
}

describe('synthesizeChunked', () => {
  it('re-bases each subsequent chunk by the cumulative duration of the chunks before it (seam test)', async () => {
    const adapter = new FakeTimedAdapter();
    // "one two" (7 chars) fits in one 10-char chunk; "three" starts a new chunk.
    const result = await synthesizeChunked(adapter, 'one two three');

    expect(result.alignment).not.toBeNull();
    const alignment = result.alignment;
    if (alignment === null) throw new Error('expected an alignment');

    // First chunk ("one two") occupies 0..700ms (7 chars * 100ms).
    // Second chunk ("three") must start exactly at the seam: 700ms, not 0ms.
    const joined = alignment.characters.join('');
    expect(joined).toBe('one twothree');
    const tIndex = alignment.characters.indexOf('t', 7); // the 't' of "three"
    expect(alignment.characterStartMs[tIndex]).toBe(700);
    expect(result.durationMs).toBe(700 + 500); // 700ms seam + 5 chars * 100ms
  });

  it('concatenates audio bytes from every chunk in order', async () => {
    const adapter = new FakeTimedAdapter();
    const result = await synthesizeChunked(adapter, 'one two three');
    // FakeTimedAdapter's audio byte for each chunk is its own text length.
    expect(Array.from(result.audio)).toEqual([7, 5]);
  });

  it('produces a monotonic word-timing seam with no overlap or gap-backwards at the boundary', async () => {
    const adapter = new FakeTimedAdapter();
    const result = await synthesizeChunked(adapter, 'aa bb cc dd ee ff gg');
    const alignment = result.alignment;
    if (alignment === null) throw new Error('expected an alignment');
    for (let i = 1; i < alignment.characterStartMs.length; i += 1) {
      const prevEnd = alignment.characterEndMs[i - 1];
      const start = alignment.characterStartMs[i];
      if (prevEnd === undefined || start === undefined) continue;
      expect(start).toBeGreaterThanOrEqual(prevEnd - 100); // no wild backwards jump
    }
  });

  it('throws for empty text', async () => {
    const adapter = new FakeTimedAdapter();
    await expect(synthesizeChunked(adapter, '   ')).rejects.toThrow(RangeError);
  });
});
