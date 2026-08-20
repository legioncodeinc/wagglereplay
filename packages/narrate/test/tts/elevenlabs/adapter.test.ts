import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsAdapter } from '../../../src/tts/elevenlabs/adapter.js';
import { TtsRequestTooLargeError } from '../../../src/tts/types.js';

function withTimestampsBody(text: string) {
  const characters = text.split('');
  return {
    audio_base64: Buffer.from('fake-mp3-bytes').toString('base64'),
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * 0.1),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.1),
    },
    normalized_alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * 0.1),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.1),
    },
  };
}

describe('ElevenLabsAdapter', () => {
  it('declares Flash as the default model with the corpus-verified char cap and cost', () => {
    const adapter = new ElevenLabsAdapter({ apiKey: 'test-key-not-real', voiceId: 'voice-1' });
    expect(adapter.capabilities).toEqual({
      provider: 'elevenlabs',
      model: 'eleven_flash_v2_5',
      timestamps: 'char',
      maxCharsPerRequest: 40_000,
      costPerThousandChars: 0.05,
      beta: false,
    });
  });

  it('declares v3 as beta with a 5k char cap', () => {
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      modelId: 'eleven_v3',
    });
    expect(adapter.capabilities.beta).toBe(true);
    expect(adapter.capabilities.maxCharsPerRequest).toBe(5_000);
  });

  it('converts seconds to milliseconds when normalizing the provider alignment (the ONE place this happens)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(withTimestampsBody('Hi')), { status: 200 }),
    );
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      fetchImpl,
    });
    const result = await adapter.synthesize({ text: 'Hi' });
    expect(result.alignment?.characterStartMs).toEqual([0, 100]);
    expect(result.alignment?.characterEndMs).toEqual([100, 200]);
  });

  it('routes eleven_v3 through the dialogue endpoint, not plain text-to-speech', async () => {
    let calledUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      calledUrl = url;
      return new Response(JSON.stringify(withTimestampsBody('Hi')), { status: 200 });
    });
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      modelId: 'eleven_v3',
      fetchImpl,
    });
    await adapter.synthesize({ text: 'Hi' });
    expect(calledUrl).toContain('/v1/text-to-dialogue/with-timestamps');
  });

  it('refuses to synthesize text longer than the model char cap without ever calling the transport', async () => {
    const fetchImpl = vi.fn();
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      modelId: 'eleven_v3',
      fetchImpl,
    });
    const tooLong = 'x'.repeat(5_001);
    await expect(adapter.synthesize({ text: tooLong })).rejects.toThrow(TtsRequestTooLargeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('estimateCostUsd matches the corpus-verified per-1k-char price', () => {
    const adapter = new ElevenLabsAdapter({ apiKey: 'test-key-not-real', voiceId: 'voice-1' });
    expect(adapter.estimateCostUsd(2000)).toBeCloseTo(0.1, 5);
  });

  it('fetchAccountTier reads the subscription endpoint', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ tier: 'creator' }), { status: 200 }),
    );
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      fetchImpl,
    });
    await expect(adapter.fetchAccountTier()).resolves.toBe('creator');
  });
});
