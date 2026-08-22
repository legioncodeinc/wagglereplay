// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { PreDraftParseError, PreDraftProviderError } from '../../src/predraft/adapter-types.js';
import { createAnthropicAdapter } from '../../src/predraft/anthropic-adapter.js';
import type { FetchLike } from '../../src/predraft/shared-http.js';
import { FAKE_ANTHROPIC_KEY_FOR_TESTS } from './fixtures.js';

function messagesResponse(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
}

const validReply = JSON.stringify({ description: 'Scrolled the row list.', confidence: 'medium' });

describe('AC4: Anthropic pre-draft adapter (mocked transport)', () => {
  it('parses a valid first reply and never retries', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => messagesResponse(validReply));
    const adapter = createAnthropicAdapter({
      apiKey: FAKE_ANTHROPIC_KEY_FOR_TESTS,
      model: 'claude-haiku-4-5',
      fetchImpl,
    });

    const result = await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });

    expect(result).toEqual({ description: 'Scrolled the row list.', confidence: 'medium' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends images as base64 blocks preceding the text block, and the system prompt as a top-level field', async () => {
    let capturedBody: unknown;
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return messagesResponse(validReply);
    });
    const adapter = createAnthropicAdapter({
      apiKey: FAKE_ANTHROPIC_KEY_FOR_TESTS,
      model: 'claude-haiku-4-5',
      fetchImpl,
    });

    await adapter.generate({
      systemPrompt: 'be terse',
      userPrompt: 'describe this',
      images: [{ base64: 'ZmFrZQ==', mimeType: 'image/png' }],
    });

    const body = capturedBody as {
      system: string;
      messages: { role: string; content: { type: string }[] }[];
    };
    expect(body.system).toBe('be terse');
    const blocks = body.messages[0]?.content ?? [];
    expect(blocks[0]?.type).toBe('image');
    expect(blocks[1]?.type).toBe('text');
  });

  it('retries once with an amended prompt when the first reply is not valid JSON, and succeeds on the second', async () => {
    let call = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      call += 1;
      return call === 1 ? messagesResponse('nope') : messagesResponse(validReply);
    });
    const adapter = createAnthropicAdapter({
      apiKey: FAKE_ANTHROPIC_KEY_FOR_TESTS,
      model: 'claude-haiku-4-5',
      fetchImpl,
    });

    const result = await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });
    expect(result.description).toBe('Scrolled the row list.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws PreDraftParseError when the reply is still unparseable after one retry', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => messagesResponse('still nope'));
    const adapter = createAnthropicAdapter({
      apiKey: FAKE_ANTHROPIC_KEY_FOR_TESTS,
      model: 'claude-haiku-4-5',
      fetchImpl,
    });

    await expect(
      adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] }),
    ).rejects.toBeInstanceOf(PreDraftParseError);
  });

  it('throws PreDraftProviderError on a non-2xx HTTP response', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const adapter = createAnthropicAdapter({
      apiKey: 'bad-key',
      model: 'claude-haiku-4-5',
      fetchImpl,
    });

    await expect(
      adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] }),
    ).rejects.toBeInstanceOf(PreDraftProviderError);
  });

  it('sends the API key as x-api-key, not Authorization', async () => {
    let capturedHeaders: RequestInit['headers'];
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      capturedHeaders = init?.headers;
      return messagesResponse(validReply);
    });
    const adapter = createAnthropicAdapter({
      apiKey: FAKE_ANTHROPIC_KEY_FOR_TESTS,
      model: 'claude-haiku-4-5',
      fetchImpl,
    });

    await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });

    const headers = capturedHeaders as Record<string, string>;
    expect(headers['x-api-key']).toBe(FAKE_ANTHROPIC_KEY_FOR_TESTS);
    expect(headers.authorization).toBeUndefined();
  });
});
