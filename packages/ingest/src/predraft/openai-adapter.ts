import { z } from 'zod';
import type { PreDraftAdapter, PreDraftRequest } from './adapter-types.js';
import { PreDraftParseError, PreDraftProviderError } from './adapter-types.js';
import { parseModelReply } from './parse-reply.js';
import type { ModelReply } from './schema.js';
import { type FetchLike, fetchWithRetry } from './shared-http.js';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * The OpenAI Chat Completions response envelope this adapter reads.
 * Documented at https://platform.openai.com/docs/api-reference/chat/object.
 * NEVER OBSERVED AGAINST A LIVE RESPONSE - see this PRD's report: there is
 * no `OPENAI_API_KEY` in this environment. Every field this schema reads
 * is stable, long-documented API surface, but the exact envelope should
 * be confirmed against one real response before this adapter is trusted
 * in production.
 */
const OpenAiChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable(),
        }),
      }),
    )
    .min(1),
});

interface OpenAiTextContentPart {
  readonly type: 'text';
  readonly text: string;
}

interface OpenAiImageContentPart {
  readonly type: 'image_url';
  readonly image_url: { readonly url: string };
}

type OpenAiContentPart = OpenAiTextContentPart | OpenAiImageContentPart;

function buildMessages(request: PreDraftRequest, retryNote?: string): unknown[] {
  const userContent: OpenAiContentPart[] = [
    {
      type: 'text',
      text: retryNote ? `${request.userPrompt}\n\n${retryNote}` : request.userPrompt,
    },
  ];
  for (const image of request.images) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  return [
    { role: 'system', content: request.systemPrompt },
    { role: 'user', content: userContent },
  ];
}

export interface OpenAiAdapterOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: FetchLike;
  readonly baseUrl?: string;
}

const RETRY_NOTE =
  'Your previous reply was not valid JSON matching the required schema. Reply again with ONLY the JSON object.';

export function createOpenAiAdapter(options: OpenAiAdapterOptions): PreDraftAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = options.baseUrl ?? OPENAI_CHAT_COMPLETIONS_URL;

  async function callOnce(messages: unknown[]): Promise<string> {
    const response = await fetchWithRetry(fetchImpl, url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new PreDraftProviderError('openai', `HTTP ${String(response.status)}: ${bodyText}`, {
        status: response.status,
      });
    }

    const bodyJson: unknown = await response.json();
    const parsed = OpenAiChatResponseSchema.safeParse(bodyJson);
    if (!parsed.success) {
      throw new PreDraftProviderError(
        'openai',
        `unexpected response envelope: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    const content = parsed.data.choices[0]?.message.content;
    if (!content) {
      throw new PreDraftProviderError('openai', 'response had no message content');
    }
    return content;
  }

  return {
    provider: 'openai',
    model: options.model,
    async generate(request: PreDraftRequest): Promise<ModelReply> {
      const firstReplyText = await callOnce(buildMessages(request));
      const firstParsed = parseModelReply(firstReplyText);
      if (firstParsed.ok) return firstParsed.value;

      const secondReplyText = await callOnce(buildMessages(request, RETRY_NOTE));
      const secondParsed = parseModelReply(secondReplyText);
      if (secondParsed.ok) return secondParsed.value;

      throw new PreDraftParseError(
        'openai',
        `model reply did not parse after one retry: ${secondParsed.reason}`,
      );
    },
  };
}
