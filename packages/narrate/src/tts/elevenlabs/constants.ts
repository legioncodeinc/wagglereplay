// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ElevenLabs model catalog relevant to narration (ADR-006, corpus receipts:
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps ,
 * https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps ,
 * https://elevenlabs.io/pricing/api).
 *
 * Char caps and per-1k costs are the corpus-verified figures as of
 * 2026-08-20 (ADR-006 "Consequences": "v3 5k, MLv2 10k, Flash 40k").
 */

export const ELEVENLABS_MODEL_IDS = [
  'eleven_flash_v2_5',
  'eleven_multilingual_v2',
  'eleven_v3',
] as const;
export type ElevenLabsModelId = (typeof ELEVENLABS_MODEL_IDS)[number];

/** ADR-006 provider aliases used for `WAGGLE_ELEVENLABS_MODEL` env selection. */
export const ELEVENLABS_MODEL_ALIASES = {
  flash: 'eleven_flash_v2_5',
  multilingual: 'eleven_multilingual_v2',
  v3: 'eleven_v3',
} as const satisfies Record<string, ElevenLabsModelId>;

export type ElevenLabsModelAlias = keyof typeof ELEVENLABS_MODEL_ALIASES;

export const DEFAULT_ELEVENLABS_MODEL_ALIAS: ElevenLabsModelAlias = 'flash';

export interface ElevenLabsModelInfo {
  readonly modelId: ElevenLabsModelId;
  readonly maxCharsPerRequest: number;
  readonly costPerThousandChars: number;
  /** True when the model is flagged beta/alpha by ElevenLabs (AC7 guardrail input). */
  readonly beta: boolean;
  /** True for models that must go through the text-to-dialogue endpoint rather than plain text-to-speech. */
  readonly usesDialogueEndpoint: boolean;
}

export const ELEVENLABS_MODELS: Record<ElevenLabsModelId, ElevenLabsModelInfo> = {
  eleven_flash_v2_5: {
    modelId: 'eleven_flash_v2_5',
    maxCharsPerRequest: 40_000,
    costPerThousandChars: 0.05,
    beta: false,
    usesDialogueEndpoint: false,
  },
  eleven_multilingual_v2: {
    modelId: 'eleven_multilingual_v2',
    maxCharsPerRequest: 10_000,
    costPerThousandChars: 0.05,
    beta: false,
    usesDialogueEndpoint: false,
  },
  eleven_v3: {
    modelId: 'eleven_v3',
    maxCharsPerRequest: 5_000,
    costPerThousandChars: 0.1,
    beta: true,
    usesDialogueEndpoint: true,
  },
};

export const ELEVENLABS_DEFAULT_BASE_URL = 'https://api.elevenlabs.io';

/** Plan tiers ElevenLabs' own `/v1/user/subscription` response can report. AC7 refuses `free`. */
export const ELEVENLABS_FREE_TIER_NAMES = new Set(['free', 'trial']);
