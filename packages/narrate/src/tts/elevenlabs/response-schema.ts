import { z } from 'zod';

/**
 * zod schemas for ElevenLabs' own response shapes. These parse an EXTERNAL
 * API's JSON, so (per the zod-boundary guide) they only assert the fields
 * Waggle actually reads and otherwise stay loose: rejecting on an unknown
 * field ElevenLabs adds tomorrow would be a self-inflicted outage.
 *
 * Receipts: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps ,
 * https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps .
 * The dialogue-with-timestamps response is documented as the same
 * `audio_base64` / `alignment` / `normalized_alignment` envelope as the
 * plain with-timestamps endpoint; this is the one shape in this adapter
 * that could not be exercised against a live key (see the package README's
 * "needs a live key" list) and is implemented from that documented
 * contract.
 */

export const ElevenLabsCharAlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

export type ElevenLabsCharAlignment = z.infer<typeof ElevenLabsCharAlignmentSchema>;

export const ElevenLabsWithTimestampsResponseSchema = z.object({
  audio_base64: z.string().min(1, 'audio_base64 must not be empty'),
  alignment: ElevenLabsCharAlignmentSchema.nullable(),
  normalized_alignment: ElevenLabsCharAlignmentSchema.nullable(),
});

export type ElevenLabsWithTimestampsResponse = z.infer<
  typeof ElevenLabsWithTimestampsResponseSchema
>;

export const ElevenLabsSubscriptionResponseSchema = z.object({
  tier: z.string().min(1, 'tier must not be empty'),
});

export type ElevenLabsSubscriptionResponse = z.infer<typeof ElevenLabsSubscriptionResponseSchema>;

export const ElevenLabsErrorResponseSchema = z.object({
  detail: z
    .union([
      z.string(),
      z.object({ status: z.string().optional(), message: z.string().optional() }).loose(),
    ])
    .optional(),
});
