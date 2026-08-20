import { DeepgramAdapter } from './deepgram/adapter.js';
import { ElevenLabsAdapter } from './elevenlabs/adapter.js';
import {
  DEFAULT_ELEVENLABS_MODEL_ALIAS,
  ELEVENLABS_MODEL_ALIASES,
  type ElevenLabsModelAlias,
} from './elevenlabs/constants.js';
import type { TtsAdapter } from './types.js';
import { XaiAdapter } from './xai/adapter.js';

export const TTS_PROVIDERS = ['elevenlabs', 'deepgram', 'xai'] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];

/** ADR-006: ElevenLabs is the default provider, Flash is the default model. */
export const DEFAULT_TTS_PROVIDER: TtsProvider = 'elevenlabs';

/** Raised when env-based provider selection cannot construct an adapter: unknown provider, or a required key/id is missing. */
export class TtsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TtsConfigError';
  }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string, context: string): string {
  const value = env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new TtsConfigError(
      `${context} requires the "${name}" environment variable, which is not set.`,
    );
  }
  return value;
}

function resolveElevenLabsModelAlias(env: NodeJS.ProcessEnv): ElevenLabsModelAlias {
  const raw = env.WAGGLE_ELEVENLABS_MODEL;
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_ELEVENLABS_MODEL_ALIAS;
  }
  const alias = raw.trim().toLowerCase();
  if (alias in ELEVENLABS_MODEL_ALIASES) {
    return alias as ElevenLabsModelAlias;
  }
  throw new TtsConfigError(
    `WAGGLE_ELEVENLABS_MODEL="${raw}" is not one of: ${Object.keys(ELEVENLABS_MODEL_ALIASES).join(', ')}.`,
  );
}

function createElevenLabsAdapterFromEnv(env: NodeJS.ProcessEnv): ElevenLabsAdapter {
  const apiKey = requireEnv(env, 'ELEVENLABS_API_KEY', 'The ElevenLabs TTS adapter');
  const voiceId = requireEnv(env, 'WAGGLE_ELEVENLABS_VOICE_ID', 'The ElevenLabs TTS adapter');
  const alias = resolveElevenLabsModelAlias(env);
  return new ElevenLabsAdapter({
    apiKey,
    voiceId,
    modelId: ELEVENLABS_MODEL_ALIASES[alias],
    baseUrl: env.WAGGLE_ELEVENLABS_BASE_URL,
  });
}

function createDeepgramAdapterFromEnv(env: NodeJS.ProcessEnv): DeepgramAdapter {
  const apiKey = requireEnv(env, 'DEEPGRAM_API_KEY', 'The Deepgram TTS adapter');
  return new DeepgramAdapter({
    apiKey,
    model: env.WAGGLE_DEEPGRAM_MODEL,
    baseUrl: env.WAGGLE_DEEPGRAM_BASE_URL,
  });
}

function createXaiAdapterFromEnv(env: NodeJS.ProcessEnv): XaiAdapter {
  requireEnv(env, 'XAI_API_KEY', 'The xAI TTS adapter');
  return new XaiAdapter();
}

/**
 * AC2: env-based provider selection per ADR-006's defaults. `WAGGLE_TTS_PROVIDER`
 * picks the provider (default `elevenlabs`); each provider then reads its
 * own required env vars, throwing a `TtsConfigError` naming the exact
 * missing variable rather than failing deep inside a network call.
 */
export function createTtsAdapterFromEnv(env: NodeJS.ProcessEnv = process.env): TtsAdapter {
  const raw = env.WAGGLE_TTS_PROVIDER;
  const provider =
    raw === undefined || raw.trim().length === 0 ? DEFAULT_TTS_PROVIDER : raw.trim().toLowerCase();

  switch (provider) {
    case 'elevenlabs':
      return createElevenLabsAdapterFromEnv(env);
    case 'deepgram':
      return createDeepgramAdapterFromEnv(env);
    case 'xai':
      return createXaiAdapterFromEnv(env);
    default:
      throw new TtsConfigError(
        `WAGGLE_TTS_PROVIDER="${raw}" is not one of: ${TTS_PROVIDERS.join(', ')}.`,
      );
  }
}
