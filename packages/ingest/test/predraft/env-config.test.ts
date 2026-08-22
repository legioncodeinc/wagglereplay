// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { resolvePreDraftConfig } from '../../src/predraft/env-config.js';
import { FAKE_ANTHROPIC_KEY_FOR_TESTS, FAKE_OPENAI_KEY_FOR_TESTS } from './fixtures.js';

describe('AC4: resolvePreDraftConfig - graceful degradation', () => {
  it('is unavailable, naming WAGGLE_PREDRAFT_PROVIDER, when nothing is set (this environment)', () => {
    const result = resolvePreDraftConfig({});
    expect(result.kind).toBe('unavailable');
    expect(result.kind === 'unavailable' && result.missingEnvVar).toBe('WAGGLE_PREDRAFT_PROVIDER');
  });

  it('is unavailable, naming OPENAI_API_KEY, when the provider is openai but no key is set', () => {
    const result = resolvePreDraftConfig({ WAGGLE_PREDRAFT_PROVIDER: 'openai' });
    expect(result.kind).toBe('unavailable');
    expect(result.kind === 'unavailable' && result.missingEnvVar).toBe('OPENAI_API_KEY');
  });

  it('is unavailable, naming ANTHROPIC_API_KEY, when the provider is anthropic but no key is set', () => {
    const result = resolvePreDraftConfig({ WAGGLE_PREDRAFT_PROVIDER: 'anthropic' });
    expect(result.kind).toBe('unavailable');
    expect(result.kind === 'unavailable' && result.missingEnvVar).toBe('ANTHROPIC_API_KEY');
  });

  it('is unavailable for an unknown provider name', () => {
    const result = resolvePreDraftConfig({ WAGGLE_PREDRAFT_PROVIDER: 'made-up-provider' });
    expect(result.kind).toBe('unavailable');
  });

  it('is configured with the default model when openai + a key are both set', () => {
    const result = resolvePreDraftConfig({
      WAGGLE_PREDRAFT_PROVIDER: 'openai',
      OPENAI_API_KEY: FAKE_OPENAI_KEY_FOR_TESTS,
    });
    expect(result).toEqual({
      kind: 'configured',
      config: { provider: 'openai', apiKey: FAKE_OPENAI_KEY_FOR_TESTS, model: 'gpt-4o-mini' },
    });
  });

  it('is configured with the default model when anthropic + a key are both set', () => {
    const result = resolvePreDraftConfig({
      WAGGLE_PREDRAFT_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: FAKE_ANTHROPIC_KEY_FOR_TESTS,
    });
    expect(result).toEqual({
      kind: 'configured',
      config: {
        provider: 'anthropic',
        apiKey: FAKE_ANTHROPIC_KEY_FOR_TESTS,
        model: 'claude-haiku-4-5',
      },
    });
  });

  it('honors WAGGLE_PREDRAFT_MODEL as a model override', () => {
    const result = resolvePreDraftConfig({
      WAGGLE_PREDRAFT_PROVIDER: 'openai',
      OPENAI_API_KEY: FAKE_OPENAI_KEY_FOR_TESTS,
      WAGGLE_PREDRAFT_MODEL: 'gpt-5-mini',
    });
    expect(result.kind === 'configured' && result.config.model).toBe('gpt-5-mini');
  });

  it('never throws for any input, including a completely empty env', () => {
    expect(() => resolvePreDraftConfig({})).not.toThrow();
  });
});
