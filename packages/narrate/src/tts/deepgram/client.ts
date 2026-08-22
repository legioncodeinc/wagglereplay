// SPDX-License-Identifier: AGPL-3.0-or-later
import { type FetchLike, fetchWithRetry } from '../shared/http.js';
import { TtsProviderError } from '../types.js';
import { DEEPGRAM_DEFAULT_BASE_URL } from './constants.js';
import { DeepgramErrorResponseSchema } from './response-schema.js';

export interface DeepgramClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly maxRetries?: number;
  readonly retryDelayMs?: number;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const parsed = DeepgramErrorResponseSchema.safeParse(body);
    if (parsed.success && parsed.data.err_msg !== undefined) {
      return parsed.data.err_msg;
    }
    return JSON.stringify(body);
  } catch {
    return response.statusText;
  }
}

export interface DeepgramSpeakResult {
  readonly audio: Uint8Array;
  readonly mimeType: string;
}

/**
 * Thin HTTP client for Deepgram's `POST /v1/speak` (AC5: the budget
 * adapter). Unlike ElevenLabs, a successful response body IS the raw
 * audio bytes, not a JSON envelope, so this client reads
 * `response.arrayBuffer()` on success and only parses JSON on the error
 * path.
 */
export class DeepgramClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: DeepgramClientOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new RangeError('DeepgramClient requires a non-empty apiKey.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? DEEPGRAM_DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 200;
  }

  async speak(options: { text: string; model: string }): Promise<DeepgramSpeakResult> {
    const response = await fetchWithRetry(
      this.fetchImpl,
      `${this.baseUrl}/v1/speak?model=${encodeURIComponent(options.model)}`,
      {
        method: 'POST',
        headers: {
          authorization: `Token ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: options.text }),
      },
      { maxRetries: this.maxRetries, retryDelayMs: this.retryDelayMs },
    );

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new TtsProviderError('deepgram', `HTTP ${response.status}: ${detail}`, {
        status: response.status,
      });
    }

    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') ?? 'audio/mpeg';
    return { audio: new Uint8Array(buffer), mimeType };
  }
}
