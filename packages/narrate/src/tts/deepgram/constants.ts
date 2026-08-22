// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Deepgram Aura-2 (ADR-006 budget adapter, corpus receipts:
 * https://deepgram.com/pricing , https://developers.deepgram.com/docs/text-to-speech).
 *
 * Aura-2 returns no timestamps at all (AC5: `timestamps: 'none'`); the
 * alignment pass that would give it word timing is explicitly deferred to
 * prd-013's shared forced-alignment module, not built here.
 */

export const DEEPGRAM_DEFAULT_MODEL = 'aura-2-thalia-en';
export const DEEPGRAM_MAX_CHARS_PER_REQUEST = 2_000;
export const DEEPGRAM_COST_PER_THOUSAND_CHARS = 0.03;
export const DEEPGRAM_DEFAULT_BASE_URL = 'https://api.deepgram.com';
