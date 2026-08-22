// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FetchLike } from '../shared/http.js';
import type { SynthesizeOptions, SynthesizeResult, TtsAdapter, TtsCapabilities } from '../types.js';
import { TtsRequestTooLargeError } from '../types.js';
import { DeepgramClient } from './client.js';
import {
  DEEPGRAM_COST_PER_THOUSAND_CHARS,
  DEEPGRAM_DEFAULT_MODEL,
  DEEPGRAM_MAX_CHARS_PER_REQUEST,
} from './constants.js';

export interface DeepgramAdapterOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

/**
 * AC5: Deepgram Aura-2 behind the same `TtsAdapter` interface as
 * ElevenLabs, explicitly marked `timestamps: 'none'`. Deepgram's `/v1/speak`
 * returns no per-character timing at all, so `synthesize()` always returns
 * `alignment: null` / `normalizedAlignment: null` rather than fabricating
 * anything; the run-narration pipeline skips words.json/caption generation
 * for a `'none'`-timestamp adapter for exactly this reason. The alignment
 * pass that WOULD give this adapter word timing is prd-013's shared
 * forced-alignment module, not this package's job.
 */
export class DeepgramAdapter implements TtsAdapter {
  readonly capabilities: TtsCapabilities;
  private readonly client: DeepgramClient;
  private readonly model: string;

  constructor(options: DeepgramAdapterOptions) {
    this.model = options.model ?? DEEPGRAM_DEFAULT_MODEL;
    this.client = new DeepgramClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      fetchImpl: options.fetchImpl,
    });
    this.capabilities = {
      provider: 'deepgram',
      model: this.model,
      timestamps: 'none',
      maxCharsPerRequest: DEEPGRAM_MAX_CHARS_PER_REQUEST,
      costPerThousandChars: DEEPGRAM_COST_PER_THOUSAND_CHARS,
      beta: false,
    };
  }

  async synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
    if (options.text.length > this.capabilities.maxCharsPerRequest) {
      throw new TtsRequestTooLargeError(
        options.text.length,
        this.capabilities.maxCharsPerRequest,
        this.model,
      );
    }
    const result = await this.client.speak({ text: options.text, model: this.model });
    return {
      audio: result.audio,
      mimeType: result.mimeType,
      originalText: options.text,
      alignment: null,
      normalizedAlignment: null,
    };
  }

  estimateCostUsd(charCount: number): number {
    return (charCount / 1000) * this.capabilities.costPerThousandChars;
  }
}
