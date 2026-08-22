// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { DeepgramAdapter } from '../../src/tts/deepgram/adapter.js';
import { ElevenLabsAdapter } from '../../src/tts/elevenlabs/adapter.js';
import { createTtsAdapterFromEnv, TtsConfigError } from '../../src/tts/provider-selection.js';
import { XaiAdapter } from '../../src/tts/xai/adapter.js';
import { FAKE_TTS_KEY_FOR_TESTS } from '../fixtures.js';

describe('createTtsAdapterFromEnv', () => {
  it('defaults to ElevenLabs Flash when WAGGLE_TTS_PROVIDER is unset (ADR-006 default)', () => {
    const adapter = createTtsAdapterFromEnv({
      ELEVENLABS_API_KEY: FAKE_TTS_KEY_FOR_TESTS,
      WAGGLE_ELEVENLABS_VOICE_ID: 'voice-1',
    });
    expect(adapter).toBeInstanceOf(ElevenLabsAdapter);
    expect(adapter.capabilities.model).toBe('eleven_flash_v2_5');
  });

  it('selects the eleven_v3 model when WAGGLE_ELEVENLABS_MODEL=v3', () => {
    const adapter = createTtsAdapterFromEnv({
      ELEVENLABS_API_KEY: FAKE_TTS_KEY_FOR_TESTS,
      WAGGLE_ELEVENLABS_VOICE_ID: 'voice-1',
      WAGGLE_ELEVENLABS_MODEL: 'v3',
    });
    expect(adapter.capabilities.model).toBe('eleven_v3');
    expect(adapter.capabilities.beta).toBe(true);
  });

  it('throws TtsConfigError naming the missing key when ELEVENLABS_API_KEY is absent', () => {
    expect(() => createTtsAdapterFromEnv({ WAGGLE_ELEVENLABS_VOICE_ID: 'voice-1' })).toThrow(
      TtsConfigError,
    );
    expect(() => createTtsAdapterFromEnv({ WAGGLE_ELEVENLABS_VOICE_ID: 'voice-1' })).toThrow(
      /ELEVENLABS_API_KEY/,
    );
  });

  it('throws TtsConfigError naming the missing voice id when WAGGLE_ELEVENLABS_VOICE_ID is absent', () => {
    expect(() => createTtsAdapterFromEnv({ ELEVENLABS_API_KEY: FAKE_TTS_KEY_FOR_TESTS })).toThrow(
      /WAGGLE_ELEVENLABS_VOICE_ID/,
    );
  });

  it('selects Deepgram when WAGGLE_TTS_PROVIDER=deepgram', () => {
    const adapter = createTtsAdapterFromEnv({
      WAGGLE_TTS_PROVIDER: 'deepgram',
      DEEPGRAM_API_KEY: FAKE_TTS_KEY_FOR_TESTS,
    });
    expect(adapter).toBeInstanceOf(DeepgramAdapter);
    expect(adapter.capabilities.timestamps).toBe('none');
  });

  it('throws TtsConfigError naming DEEPGRAM_API_KEY when selecting deepgram without it', () => {
    expect(() => createTtsAdapterFromEnv({ WAGGLE_TTS_PROVIDER: 'deepgram' })).toThrow(
      /DEEPGRAM_API_KEY/,
    );
  });

  it('selects the xAI stub when WAGGLE_TTS_PROVIDER=xai', () => {
    const adapter = createTtsAdapterFromEnv({
      WAGGLE_TTS_PROVIDER: 'xai',
      XAI_API_KEY: FAKE_TTS_KEY_FOR_TESTS,
    });
    expect(adapter).toBeInstanceOf(XaiAdapter);
  });

  it('throws TtsConfigError for an unknown provider name', () => {
    expect(() => createTtsAdapterFromEnv({ WAGGLE_TTS_PROVIDER: 'not-a-real-provider' })).toThrow(
      TtsConfigError,
    );
  });
});
