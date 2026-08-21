import type { PreDraftAdapter } from './adapter-types.js';
import { createAnthropicAdapter } from './anthropic-adapter.js';
import type { PreDraftProviderConfig } from './env-config.js';
import { createOpenAiAdapter } from './openai-adapter.js';
import type { FetchLike } from './shared-http.js';

/** AC4: provider-agnostic factory. Adding a third provider means one more case here, nothing else changes. */
export function createPreDraftAdapter(
  config: PreDraftProviderConfig,
  fetchImpl?: FetchLike,
): PreDraftAdapter {
  switch (config.provider) {
    case 'openai':
      return createOpenAiAdapter({ apiKey: config.apiKey, model: config.model, fetchImpl });
    case 'anthropic':
      return createAnthropicAdapter({ apiKey: config.apiKey, model: config.model, fetchImpl });
  }
}
