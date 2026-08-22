// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CharAlignment } from '../words/aggregate.js';

/**
 * The TTS adapter interface (AC2): every provider (ElevenLabs, Deepgram,
 * xAI, and whatever prd-013 or a future PRD adds) implements this and
 * nothing else needs to know which provider is behind it.
 *
 * `'char'` means the provider returns character-level timing Waggle can
 * aggregate into words (see ../words/aggregate.ts); `'none'` means it does
 * not, and the run-narration pipeline (../narrate/run-narration.ts) skips
 * words.json/caption generation for that adapter rather than fabricating
 * timing it does not have (AC5: Deepgram is `'none'`, the alignment pass
 * is deferred to prd-013's shared module).
 */
export type TtsTimestampGranularity = 'char' | 'none';

export interface TtsCapabilities {
  readonly provider: string;
  readonly model: string;
  readonly timestamps: TtsTimestampGranularity;
  /** The provider's own request character cap for this model (chunk-stitching splits against this). */
  readonly maxCharsPerRequest: number;
  readonly costPerThousandChars: number;
  /**
   * True when the selected model is flagged beta/alpha by the provider.
   * Feeds the AC7 guardrail: beta-model output is excluded from
   * ElevenLabs' commercial license (ADR-006, corpus).
   */
  readonly beta: boolean;
}

export interface SynthesizeOptions {
  /** The exact author-approved text to synthesize. Must not exceed `capabilities.maxCharsPerRequest`. */
  readonly text: string;
  readonly voiceId?: string;
}

export interface SynthesizeResult {
  readonly audio: Uint8Array;
  readonly mimeType: string;
  /** The exact text that was synthesized (echoes `SynthesizeOptions.text`). */
  readonly originalText: string;
  /**
   * Character-level timing keyed to `originalText` exactly (before any
   * provider-side text normalization). `null` when
   * `capabilities.timestamps === 'none'`.
   */
  readonly alignment: CharAlignment | null;
  /**
   * Character-level timing keyed to the provider's normalized/spoken text
   * (e.g. "$13" -> "thirteen dollars"). More accurate for audio pacing,
   * less useful for captions on its own (corpus: "use normalized for audio
   * timing, map back to original text for captions"). `null` under the
   * same condition as `alignment`.
   */
  readonly normalizedAlignment: CharAlignment | null;
}

export interface TtsAdapter {
  readonly capabilities: TtsCapabilities;
  synthesize(options: SynthesizeOptions): Promise<SynthesizeResult>;
  estimateCostUsd(charCount: number): number;
}

/** Raised when a caller asks an adapter to synthesize more text than its model allows in one request. */
export class TtsRequestTooLargeError extends Error {
  constructor(charCount: number, maxCharsPerRequest: number, model: string) {
    super(
      `Cannot synthesize ${charCount} characters in one request against model "${model}" (cap is ${maxCharsPerRequest} characters). Use synthesizeChunked() from ./chunked-synthesize.js instead of calling the adapter directly for long scripts.`,
    );
    this.name = 'TtsRequestTooLargeError';
  }
}

/** Raised for provider-side HTTP/response failures, distinct from configuration errors. */
export class TtsProviderError extends Error {
  readonly provider: string;
  readonly status: number | undefined;

  constructor(provider: string, message: string, options?: { status?: number; cause?: unknown }) {
    super(`[${provider}] ${message}`, { cause: options?.cause });
    this.name = 'TtsProviderError';
    this.provider = provider;
    this.status = options?.status;
  }
}
