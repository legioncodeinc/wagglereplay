// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { DeepgramAdapter } from '../../../src/tts/deepgram/adapter.js';
import { TtsProviderError, TtsRequestTooLargeError } from '../../../src/tts/types.js';
import { FAKE_TTS_KEY_FOR_TESTS } from '../../fixtures.js';

describe('DeepgramAdapter', () => {
  it('declares AC5 capabilities: no timestamps, 2k char cap, budget cost', () => {
    const adapter = new DeepgramAdapter({ apiKey: FAKE_TTS_KEY_FOR_TESTS });
    expect(adapter.capabilities).toEqual({
      provider: 'deepgram',
      model: 'aura-2-thalia-en',
      timestamps: 'none',
      maxCharsPerRequest: 2_000,
      costPerThousandChars: 0.03,
      beta: false,
    });
  });

  it('returns raw audio bytes with null alignment (never fabricates timing)', async () => {
    const fakeAudio = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(fakeAudio, { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
    );
    const adapter = new DeepgramAdapter({ apiKey: FAKE_TTS_KEY_FOR_TESTS, fetchImpl });
    const result = await adapter.synthesize({ text: 'Hello world' });
    expect(Array.from(result.audio)).toEqual([1, 2, 3, 4]);
    expect(result.alignment).toBeNull();
    expect(result.normalizedAlignment).toBeNull();
  });

  it('sends the Token authorization header and model query param', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(new Uint8Array([0]), { status: 200 });
    });
    const adapter = new DeepgramAdapter({ apiKey: FAKE_TTS_KEY_FOR_TESTS, fetchImpl });
    await adapter.synthesize({ text: 'Hi' });
    expect(capturedUrl).toBe('https://api.deepgram.com/v1/speak?model=aura-2-thalia-en');
    expect((capturedInit?.headers as Record<string, string>).authorization).toBe(
      `Token ${FAKE_TTS_KEY_FOR_TESTS}`,
    );
    expect(JSON.parse(capturedInit?.body as string)).toEqual({ text: 'Hi' });
  });

  it('refuses text over the 2k char cap without calling the transport', async () => {
    const fetchImpl = vi.fn();
    const adapter = new DeepgramAdapter({ apiKey: FAKE_TTS_KEY_FOR_TESTS, fetchImpl });
    await expect(adapter.synthesize({ text: 'x'.repeat(2001) })).rejects.toThrow(
      TtsRequestTooLargeError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws TtsProviderError on a non-2xx response', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ err_msg: 'bad request' }), { status: 400 }),
    );
    const adapter = new DeepgramAdapter({ apiKey: FAKE_TTS_KEY_FOR_TESTS, fetchImpl });
    await expect(adapter.synthesize({ text: 'Hi' })).rejects.toThrow(TtsProviderError);
  });
});
