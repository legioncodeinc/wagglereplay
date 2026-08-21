import { describe, expect, it, vi } from 'vitest';
import { PreDraftParseError, PreDraftProviderError } from '../../src/predraft/adapter-types.js';
import { createOpenAiAdapter } from '../../src/predraft/openai-adapter.js';
import type { FetchLike } from '../../src/predraft/shared-http.js';

function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

const validReply = JSON.stringify({ description: 'Clicked the login button.', confidence: 'high' });

describe('AC4: OpenAI pre-draft adapter (mocked transport)', () => {
  it('parses a valid first reply and never retries', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => chatResponse(validReply));
    const adapter = createOpenAiAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    const result = await adapter.generate({
      systemPrompt: 'system',
      userPrompt: 'user',
      images: [],
    });

    expect(result).toEqual({ description: 'Clicked the login button.', confidence: 'high' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends images as base64 data URLs in the OpenAI content-array shape', async () => {
    let capturedBody: unknown;
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return chatResponse(validReply);
    });
    const adapter = createOpenAiAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    await adapter.generate({
      systemPrompt: 'system',
      userPrompt: 'user',
      images: [{ base64: 'ZmFrZQ==', mimeType: 'image/png' }],
    });

    const body = capturedBody as { messages: { role: string; content: unknown }[] };
    const userMessage = body.messages.find((m) => m.role === 'user');
    const content = userMessage?.content as { type: string; image_url?: { url: string } }[];
    const imagePart = content.find((c) => c.type === 'image_url');
    expect(imagePart?.image_url?.url).toBe('data:image/png;base64,ZmFrZQ==');
  });

  it('retries once with an amended prompt when the first reply is not valid JSON, and succeeds on the second', async () => {
    let call = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      call += 1;
      return call === 1 ? chatResponse('not json at all') : chatResponse(validReply);
    });
    const adapter = createOpenAiAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    const result = await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });

    expect(result.description).toBe('Clicked the login button.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws PreDraftParseError when the reply is still unparseable after one retry', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => chatResponse('still not json'));
    const adapter = createOpenAiAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    await expect(
      adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] }),
    ).rejects.toBeInstanceOf(PreDraftParseError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('strips a markdown code fence around the JSON if the model adds one', async () => {
    const fenced = `\`\`\`json\n${validReply}\n\`\`\``;
    const fetchImpl: FetchLike = vi.fn(async () => chatResponse(fenced));
    const adapter = createOpenAiAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    const result = await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });
    expect(result.confidence).toBe('high');
  });

  it('throws PreDraftProviderError on a non-2xx HTTP response', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => new Response('unauthorized', { status: 401 }));
    const adapter = createOpenAiAdapter({ apiKey: 'bad-key', model: 'gpt-4o-mini', fetchImpl });

    await expect(
      adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] }),
    ).rejects.toBeInstanceOf(PreDraftProviderError);
  });

  it('retries a transient 500 at the transport layer before giving up', async () => {
    let call = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      call += 1;
      if (call < 3) return new Response('server error', { status: 500 });
      return chatResponse(validReply);
    });
    const adapter = createOpenAiAdapter({ apiKey: 'sk-test', model: 'gpt-4o-mini', fetchImpl });

    const result = await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });
    expect(result.description).toBe('Clicked the login button.');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('sends the API key as a Bearer Authorization header', async () => {
    let capturedHeaders: RequestInit['headers'];
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      capturedHeaders = init?.headers;
      return chatResponse(validReply);
    });
    const adapter = createOpenAiAdapter({
      apiKey: 'sk-secret-123',
      model: 'gpt-4o-mini',
      fetchImpl,
    });

    await adapter.generate({ systemPrompt: 's', userPrompt: 'u', images: [] });

    expect((capturedHeaders as Record<string, string>).authorization).toBe('Bearer sk-secret-123');
  });
});
