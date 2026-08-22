// SPDX-License-Identifier: AGPL-3.0-or-later
import { type FetchLike, fetchWithRetry } from '../shared/http.js';
import { TtsProviderError } from '../types.js';
import { ELEVENLABS_DEFAULT_BASE_URL, type ElevenLabsModelId } from './constants.js';
import {
  ElevenLabsErrorResponseSchema,
  ElevenLabsSubscriptionResponseSchema,
  type ElevenLabsWithTimestampsResponse,
  ElevenLabsWithTimestampsResponseSchema,
} from './response-schema.js';

export type { FetchLike };

export interface ElevenLabsClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  /** Retries on 429/5xx before giving up. Defaults to 2 (3 total attempts). */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff between retries, in ms. Defaults to 200ms (tests override to 0). */
  readonly retryDelayMs?: number;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const parsed = ElevenLabsErrorResponseSchema.safeParse(body);
    if (parsed.success && parsed.data.detail !== undefined) {
      return typeof parsed.data.detail === 'string'
        ? parsed.data.detail
        : (parsed.data.detail.message ?? JSON.stringify(parsed.data.detail));
    }
    return JSON.stringify(body);
  } catch {
    return response.statusText;
  }
}

/**
 * Thin HTTP client for the ElevenLabs endpoints this adapter needs:
 * with-timestamps text-to-speech, with-timestamps text-to-dialogue (v3),
 * and the account subscription lookup the AC7 guardrail reads. Retry
 * policy lives in ../shared/http.ts; response SHAPE parsing lives in
 * ./response-schema.ts and gets called from here so every caller gets a
 * validated, typed result or a thrown `TtsProviderError` naming the
 * provider, status, and detail.
 */
export class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: ElevenLabsClientOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new RangeError('ElevenLabsClient requires a non-empty apiKey.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 200;
  }

  private async requestJson(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetchWithRetry(
      this.fetchImpl,
      `${this.baseUrl}${path}`,
      { ...init, headers: { 'xi-api-key': this.apiKey, ...init.headers } },
      { maxRetries: this.maxRetries, retryDelayMs: this.retryDelayMs },
    );
    if (response.ok) {
      return await response.json();
    }
    const detail = await readErrorDetail(response);
    throw new TtsProviderError('elevenlabs', `HTTP ${response.status}: ${detail}`, {
      status: response.status,
    });
  }

  /** `POST /v1/text-to-speech/{voiceId}/with-timestamps` - non-dialogue models (Flash, Multilingual v2). */
  async textToSpeechWithTimestamps(options: {
    voiceId: string;
    text: string;
    modelId: ElevenLabsModelId;
  }): Promise<ElevenLabsWithTimestampsResponse> {
    const body: unknown = await this.requestJson(
      `/v1/text-to-speech/${encodeURIComponent(options.voiceId)}/with-timestamps`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: options.text, model_id: options.modelId }),
      },
    );
    return ElevenLabsWithTimestampsResponseSchema.parse(body);
  }

  /**
   * `POST /v1/text-to-dialogue/with-timestamps` - the dialogue endpoint
   * required for eleven_v3 (ADR-006: "dialogue endpoint when model is
   * v3"). Documented to return the same envelope as the plain
   * with-timestamps endpoint for a single-speaker input; see the response
   * schema module doc for the live-key caveat on this specific path.
   */
  async textToDialogueWithTimestamps(options: {
    voiceId: string;
    text: string;
    modelId: ElevenLabsModelId;
  }): Promise<ElevenLabsWithTimestampsResponse> {
    const body: unknown = await this.requestJson('/v1/text-to-dialogue/with-timestamps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        inputs: [{ text: options.text, voice_id: options.voiceId }],
        model_id: options.modelId,
      }),
    });
    return ElevenLabsWithTimestampsResponseSchema.parse(body);
  }

  /** `GET /v1/user/subscription` - the plan tier the AC7 guardrail checks. */
  async fetchSubscriptionTier(): Promise<string> {
    const body: unknown = await this.requestJson('/v1/user/subscription', { method: 'GET' });
    return ElevenLabsSubscriptionResponseSchema.parse(body).tier;
  }
}
