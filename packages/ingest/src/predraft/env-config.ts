/**
 * AC4: provider-agnostic environment resolution for the pre-draft LLM
 * call, with graceful degradation as the primary contract - this module
 * NEVER throws. There is no LLM API key in this environment (per this
 * PRD's brief), so every path through here that matters today is the
 * `unavailable` one; the `configured` path is fully implemented and
 * exercised by test/predraft/*.test.ts against a mocked transport, but
 * has never been run against a live key (see this PRD's report).
 */

export type PreDraftProviderName = 'openai' | 'anthropic';

export const DEFAULT_MODEL_BY_PROVIDER: Record<PreDraftProviderName, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
};

export interface PreDraftProviderConfig {
  readonly provider: PreDraftProviderName;
  readonly apiKey: string;
  readonly model: string;
}

export type ResolvedPreDraftConfig =
  | { readonly kind: 'configured'; readonly config: PreDraftProviderConfig }
  | { readonly kind: 'unavailable'; readonly reason: string; readonly missingEnvVar: string };

const API_KEY_ENV_VAR: Record<PreDraftProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * Resolves which pre-draft provider (if any) is configured, from
 * `WAGGLE_PREDRAFT_PROVIDER` ('openai' | 'anthropic') and that provider's
 * API key env var. `WAGGLE_PREDRAFT_MODEL` overrides the default model.
 * Every `unavailable` result names the exact env var to set next, per
 * this PRD's "log exactly which env var to set" requirement.
 */
export function resolvePreDraftConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ResolvedPreDraftConfig {
  const provider = env.WAGGLE_PREDRAFT_PROVIDER;

  if (!provider) {
    return {
      kind: 'unavailable',
      reason: 'WAGGLE_PREDRAFT_PROVIDER is not set; no AI pre-draft provider is configured.',
      missingEnvVar: 'WAGGLE_PREDRAFT_PROVIDER',
    };
  }

  if (provider !== 'openai' && provider !== 'anthropic') {
    return {
      kind: 'unavailable',
      reason: `WAGGLE_PREDRAFT_PROVIDER is set to "${provider}", which is not a supported provider (expected "openai" or "anthropic").`,
      missingEnvVar: 'WAGGLE_PREDRAFT_PROVIDER',
    };
  }

  const apiKeyEnvVar = API_KEY_ENV_VAR[provider];
  const apiKey = env[apiKeyEnvVar];
  if (!apiKey) {
    return {
      kind: 'unavailable',
      reason: `WAGGLE_PREDRAFT_PROVIDER is "${provider}" but ${apiKeyEnvVar} is not set.`,
      missingEnvVar: apiKeyEnvVar,
    };
  }

  return {
    kind: 'configured',
    config: {
      provider,
      apiKey,
      model: env.WAGGLE_PREDRAFT_MODEL ?? DEFAULT_MODEL_BY_PROVIDER[provider],
    },
  };
}
