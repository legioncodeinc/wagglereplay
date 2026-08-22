// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';
import type { PreDraftAdapter, PreDraftRequest } from './adapter-types.js';
import { PreDraftParseError, PreDraftProviderError } from './adapter-types.js';
import { parseModelReply } from './parse-reply.js';
import type { ModelReply } from './schema.js';
import { type FetchLike, fetchWithRetry } from './shared-http.js';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * The Anthropic Messages API response envelope this adapter reads.
 * Documented at https://docs.claude.com/en/api/messages. NEVER OBSERVED
 * AGAINST A LIVE RESPONSE - see this PRD's report: there is no
 * `ANTHROPIC_API_KEY` in this environment.
 */
const AnthropicMessagesResponseSchema = z.object({
  content: z
    .array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
      }),
    )
    .min(1),
});

interface AnthropicTextBlock {
  readonly type: 'text';
  readonly text: string;
}

interface AnthropicImageBlock {
  readonly type: 'image';
  readonly source: {
    readonly type: 'base64';
    readonly media_type: string;
    readonly data: string;
  };
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock;

/** Images first, then the text turn: Anthropic's own docs recommend images precede the text that references them. */
function buildUserContent(request: PreDraftRequest, retryNote?: string): AnthropicContentBlock[] {
  const blocks: AnthropicContentBlock[] = [];
  for (const image of request.images) {
    blocks.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mimeType, data: image.base64 },
    });
  }
  blocks.push({
    type: 'text',
    text: retryNote ? `${request.userPrompt}\n\n${retryNote}` : request.userPrompt,
  });
  return blocks;
}

export interface AnthropicAdapterOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
}

const RETRY_NOTE =
  'Your previous reply was not valid JSON matching the required schema. Reply again with ONLY the JSON object.';

export function createAnthropicAdapter(options: AnthropicAdapterOptions): PreDraftAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.baseUrl ?? ANTHROPIC_MESSAGES_URL;

  async function callOnce(
    systemPrompt: string,
    userContent: AnthropicContentBlock[],
  ): Promise<string> {
    const response = await fetchWithRetry(fetchImpl, url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new PreDraftProviderError('anthropic', `HTTP ${String(response.status)}: ${bodyText}`, {
        status: response.status,
      });
    }

    const bodyJson: unknown = await response.json();
    const parsed = AnthropicMessagesResponseSchema.safeParse(bodyJson);
    if (!parsed.success) {
      throw new PreDraftProviderError(
        'anthropic',
        `unexpected response envelope: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const textBlock = parsed.data.content.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      throw new PreDraftProviderError('anthropic', 'response had no text content block');
    }
    return textBlock.text;
  }

  return {
    provider: 'anthropic',
    model: options.model,
    async generate(request: PreDraftRequest): Promise<ModelReply> {
      const firstReplyText = await callOnce(request.systemPrompt, buildUserContent(request));
      const firstParsed = parseModelReply(firstReplyText);
      if (firstParsed.ok) return firstParsed.value;

      const secondReplyText = await callOnce(
        request.systemPrompt,
        buildUserContent(request, RETRY_NOTE),
      );
      const secondParsed = parseModelReply(secondReplyText);
      if (secondParsed.ok) return secondParsed.value;

      throw new PreDraftParseError(
        'anthropic',
        `model reply did not parse after one retry: ${secondParsed.reason}`,
      );
    },
  };
}
