import type { ModelReply } from './schema.js';

/** One image attached to a pre-draft request (a `before`/`click` frame PNG, base64-encoded). */
export interface PreDraftImage {
  readonly base64: string;
  readonly mimeType: string;
}

export interface PreDraftRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly images: readonly PreDraftImage[];
}

export interface PreDraftAdapter {
  readonly provider: string;
  readonly model: string;
  /**
   * Sends one pre-draft request and returns a validated `ModelReply`.
   * Implementations retry a malformed (non-JSON, or schema-invalid) reply
   * exactly once by re-prompting the model before giving up (AC4:
   * "retry"); network-level 429/5xx retry happens one layer down, inside
   * `../shared-http.ts`'s `fetchWithRetry`.
   */
  generate(request: PreDraftRequest): Promise<ModelReply>;
}

/** Raised when the provider's HTTP call itself fails (after transport retries are exhausted). */
export class PreDraftProviderError extends Error {
  readonly provider: string;
  readonly status: number | undefined;

  constructor(provider: string, message: string, options?: { status?: number; cause?: unknown }) {
    super(`[${provider}] ${message}`, { cause: options?.cause });
    this.name = 'PreDraftProviderError';
    this.provider = provider;
    this.status = options?.status;
  }
}

/** Raised when the model's reply still does not parse as a valid `ModelReply` after one retry. */
export class PreDraftParseError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(`[${provider}] ${message}`, { cause: options?.cause });
    this.name = 'PreDraftParseError';
    this.provider = provider;
  }
}
