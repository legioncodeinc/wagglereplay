import { describe, expect, it, vi } from 'vitest';
import { ElevenLabsClient } from '../../../src/tts/elevenlabs/client.js';
import { TtsProviderError } from '../../../src/tts/types.js';

/**
 * Builds a fake ElevenLabs with-timestamps response body matching the
 * shape documented at
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
 * (corpus receipt). No network call happens; only the transport (`fetchImpl`)
 * is mocked, so every line of request construction, header setting, retry,
 * and zod response parsing in ElevenLabsClient still runs for real.
 */
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

describe('ElevenLabsClient', () => {
  it('requires a non-empty apiKey', () => {
    expect(() => new ElevenLabsClient({ apiKey: '' })).toThrow(RangeError);
  });

  it('sends the xi-api-key header and posts the text + model to the with-timestamps endpoint', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify(withTimestampsBody('Hi')), { status: 200 });
    });

    const client = new ElevenLabsClient({ apiKey: 'test-key-not-real', fetchImpl });
    const result = await client.textToSpeechWithTimestamps({
      voiceId: 'voice-1',
      text: 'Hi',
      modelId: 'eleven_flash_v2_5',
    });

    expect(capturedUrl).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice-1/with-timestamps');
    expect((capturedInit?.headers as Record<string, string>)['xi-api-key']).toBe(
      'test-key-not-real',
    );
    expect(JSON.parse(capturedInit?.body as string)).toEqual({
      text: 'Hi',
      model_id: 'eleven_flash_v2_5',
    });
    expect(result.alignment?.characters).toEqual(['H', 'i']);
  });

  it('posts to the dialogue with-timestamps endpoint with an inputs array', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(url).toBe('https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps');
      expect(body).toEqual({
        inputs: [{ text: 'Hi', voice_id: 'voice-1' }],
        model_id: 'eleven_v3',
      });
      return new Response(JSON.stringify(withTimestampsBody('Hi')), { status: 200 });
    });

    const client = new ElevenLabsClient({ apiKey: 'test-key-not-real', fetchImpl });
    await client.textToDialogueWithTimestamps({
      voiceId: 'voice-1',
      text: 'Hi',
      modelId: 'eleven_v3',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('parses the subscription tier from /v1/user/subscription', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ tier: 'free' }), { status: 200 }),
    );
    const client = new ElevenLabsClient({ apiKey: 'test-key-not-real', fetchImpl });
    await expect(client.fetchSubscriptionTier()).resolves.toBe('free');
  });

  it('retries on a 429 and eventually succeeds', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response(JSON.stringify({ detail: 'rate limited' }), { status: 429 });
      }
      return new Response(JSON.stringify(withTimestampsBody('Hi')), { status: 200 });
    });

    const client = new ElevenLabsClient({
      apiKey: 'test-key-not-real',
      fetchImpl,
      retryDelayMs: 0,
    });
    const result = await client.textToSpeechWithTimestamps({
      voiceId: 'voice-1',
      text: 'Hi',
      modelId: 'eleven_flash_v2_5',
    });
    expect(calls).toBe(3);
    expect(result.alignment?.characters).toEqual(['H', 'i']);
  });

  it('throws TtsProviderError naming the status and detail after exhausting retries', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ detail: 'invalid api key' }), { status: 401 }),
    );
    const client = new ElevenLabsClient({
      apiKey: 'test-key-not-real',
      fetchImpl,
      retryDelayMs: 0,
    });
    await expect(
      client.textToSpeechWithTimestamps({
        voiceId: 'voice-1',
        text: 'Hi',
        modelId: 'eleven_flash_v2_5',
      }),
    ).rejects.toThrow(TtsProviderError);
    await expect(
      client.textToSpeechWithTimestamps({
        voiceId: 'voice-1',
        text: 'Hi',
        modelId: 'eleven_flash_v2_5',
      }),
    ).rejects.toThrow(/invalid api key/);
  });

  it('gives up after maxRetries on repeated 500s', async () => {
    const fetchImpl = vi.fn(async () => new Response('server error', { status: 500 }));
    const client = new ElevenLabsClient({
      apiKey: 'test-key-not-real',
      fetchImpl,
      retryDelayMs: 0,
      maxRetries: 2,
    });
    await expect(
      client.textToSpeechWithTimestamps({
        voiceId: 'voice-1',
        text: 'Hi',
        modelId: 'eleven_flash_v2_5',
      }),
    ).rejects.toThrow(TtsProviderError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});
