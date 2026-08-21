import type { SynthesizeOptions, SynthesizeResult, TtsAdapter, TtsCapabilities } from '../types.js';

export const XAI_MODEL = 'grok-voice';
export const XAI_COST_PER_THOUSAND_CHARS = 0.015;
/** No documented per-request char cap as of the corpus's 2026-08-20 pass; capped conservatively pending re-evaluation. */
export const XAI_MAX_CHARS_PER_REQUEST = 5_000;

/**
 * AC5: xAI's voice API declared on the watch list (ADR-006: "API weeks
 * old with no timestamp story ... re-evaluate quarterly"). This adapter is
 * intentionally a stub: it satisfies the `TtsAdapter` interface and
 * declares honest capabilities (no timestamps, a conservative char cap)
 * so provider selection and cost-estimation code can reference it today,
 * but `synthesize()` throws rather than silently returning fabricated
 * audio, since there is no verified request/response contract to
 * implement against yet (receipt:
 * https://docs.x.ai/developers/model-capabilities/audio/voice was the
 * newest primary source the corpus pass found, and it does not document a
 * stable request/response shape).
 */
export class XaiAdapter implements TtsAdapter {
  readonly capabilities: TtsCapabilities = {
    provider: 'xai',
    model: XAI_MODEL,
    timestamps: 'none',
    maxCharsPerRequest: XAI_MAX_CHARS_PER_REQUEST,
    costPerThousandChars: XAI_COST_PER_THOUSAND_CHARS,
    beta: true,
  };

  /**
   * Deliberately `async` even though the body only throws: that makes the
   * throw surface as a REJECTED PROMISE, matching every other adapter's
   * `synthesize()` contract, rather than a synchronous throw a caller
   * awaiting the call would not expect.
   */
  async synthesize(_options: SynthesizeOptions): Promise<SynthesizeResult> {
    throw new Error(
      'xAI voice synthesis is not yet implemented (ADR-006 watch list: "API weeks old, re-evaluate quarterly"). ' +
        'This adapter exists so provider selection and cost estimation can reference "xai" today; wire the real request/response contract once xAI publishes one.',
    );
  }

  estimateCostUsd(charCount: number): number {
    return (charCount / 1000) * this.capabilities.costPerThousandChars;
  }
}
