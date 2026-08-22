// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

/**
 * Deepgram's TTS endpoint (`POST /v1/speak`) returns raw audio bytes on
 * success, so there is no success-body schema to parse here (see
 * ./client.ts). This module only covers the JSON error envelope Deepgram
 * returns on a non-2xx response.
 * Receipt: https://developers.deepgram.com/docs/text-to-speech
 */
export const DeepgramErrorResponseSchema = z.object({
  err_code: z.string().optional(),
  err_msg: z.string().optional(),
});
