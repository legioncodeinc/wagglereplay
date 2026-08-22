// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CharAlignment } from '../../words/aggregate.js';
import type { SynthesizeOptions, SynthesizeResult, TtsAdapter, TtsCapabilities } from '../types.js';
import { TtsRequestTooLargeError } from '../types.js';
import { ElevenLabsClient, type FetchLike } from './client.js';
import { ELEVENLABS_MODELS, type ElevenLabsModelId } from './constants.js';
import type { ElevenLabsCharAlignment } from './response-schema.js';

export interface ElevenLabsAdapterOptions {
  readonly apiKey: string;
  readonly voiceId: string;
  readonly modelId?: ElevenLabsModelId;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

/**
 * ElevenLabs' `character_start_times_seconds` / `character_end_times_seconds`
 * are floating-point seconds; every other unit in this codebase (settle
 * times, durations, `words.json`) is milliseconds. This is the ONE place
 * that conversion happens (corpus: "provider units differ ... normalize in
 * the adapter").
 */
function toMsAlignment(alignment: ElevenLabsCharAlignment | null): CharAlignment | null {
  if (alignment === null) {
    return null;
  }
  return {
    characters: alignment.characters,
    characterStartMs: alignment.character_start_times_seconds.map((s) => s * 1000),
    characterEndMs: alignment.character_end_times_seconds.map((s) => s * 1000),
  };
}

function decodeBase64Audio(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * The default adapter (ADR-006): ElevenLabs Flash unless the caller
 * selects v3. Routes through the plain with-timestamps endpoint for
 * non-dialogue models and the text-to-dialogue with-timestamps endpoint
 * for v3 (ADR-006: "dialogue endpoint when model is v3").
 */
export class ElevenLabsAdapter implements TtsAdapter {
  readonly capabilities: TtsCapabilities;
  private readonly client: ElevenLabsClient;
  private readonly voiceId: string;
  private readonly modelId: ElevenLabsModelId;
  private readonly modelInfo: (typeof ELEVENLABS_MODELS)[ElevenLabsModelId];

  constructor(options: ElevenLabsAdapterOptions) {
    this.voiceId = options.voiceId;
    this.modelId = options.modelId ?? 'eleven_flash_v2_5';
    this.modelInfo = ELEVENLABS_MODELS[this.modelId];
    this.client = new ElevenLabsClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    });
    this.capabilities = {
      provider: 'elevenlabs',
      model: this.modelId,
      timestamps: 'char',
      maxCharsPerRequest: this.modelInfo.maxCharsPerRequest,
      costPerThousandChars: this.modelInfo.costPerThousandChars,
      beta: this.modelInfo.beta,
    };
  }

  async synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
    if (options.text.length > this.capabilities.maxCharsPerRequest) {
      throw new TtsRequestTooLargeError(
        options.text.length,
        this.capabilities.maxCharsPerRequest,
        this.modelId,
      );
    }
    const voiceId = options.voiceId ?? this.voiceId;

    const response = this.modelInfo.usesDialogueEndpoint
      ? await this.client.textToDialogueWithTimestamps({
          voiceId,
          text: options.text,
          modelId: this.modelId,
        })
      : await this.client.textToSpeechWithTimestamps({
          voiceId,
          text: options.text,
          modelId: this.modelId,
        });

    return {
      audio: decodeBase64Audio(response.audio_base64),
      mimeType: 'audio/mpeg',
      originalText: options.text,
      alignment: toMsAlignment(response.alignment),
      normalizedAlignment: toMsAlignment(response.normalized_alignment),
    };
  }

  estimateCostUsd(charCount: number): number {
    return (charCount / 1000) * this.capabilities.costPerThousandChars;
  }

  /** AC7: the plan tier the shareable-audio guardrail checks. */
  async fetchAccountTier(): Promise<string> {
    return this.client.fetchSubscriptionTier();
  }
}
