// SPDX-License-Identifier: AGPL-3.0-or-later
import { type ModelReply, ModelReplySchema } from './schema.js';

/**
 * Strips a markdown code fence around a JSON blob, if the model added one
 * despite being asked not to (both providers occasionally do this
 * regardless of prompting). Idempotent on text that has no fence.
 */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

export type ParseReplyResult =
  | { readonly ok: true; readonly value: ModelReply }
  | { readonly ok: false; readonly reason: string };

/** Parses raw model text as `ModelReplySchema`, never throwing - callers decide whether to retry. */
export function parseModelReply(text: string): ParseReplyResult {
  const candidate = stripCodeFence(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return { ok: false, reason: `not valid JSON: ${(error as Error).message}` };
  }
  const result = ModelReplySchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => issue.message).join('; ');
    return { ok: false, reason: `did not match the expected schema: ${detail}` };
  }
  return { ok: true, value: result.data };
}
