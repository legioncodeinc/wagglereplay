// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildPreDraftPrompt, type PreDraftPromptInput } from '../../src/predraft/prompt.js';

function baseInput(overrides: Partial<PreDraftPromptInput> = {}): PreDraftPromptInput {
  return {
    stepIndex: 0,
    totalSteps: 6,
    stepType: 'click',
    classification: 'navigate',
    hasImages: false,
    ...overrides,
  };
}

describe('AC4 ADR-008: buildPreDraftPrompt never leaks a secret', () => {
  it('is a pure function of its typed input alone: it has no way to read a masked value, a length, or an env var', () => {
    // buildPreDraftPrompt's signature (PreDraftPromptInput) has no field
    // for a step's masked `value`, its length, or any environment
    // variable - this test documents that boundary by construction: every
    // field this function CAN read is listed here, and none of them is a
    // secret-shaped value.
    const input = baseInput({
      elementRole: 'textbox',
      elementName: 'Password',
      elementText: 'Password',
      domDeltaSummary: 'the login form appeared',
      routeBefore: '/login',
      routeAfter: '/items',
    });
    const prompt = buildPreDraftPrompt(input);

    const poisonedSecrets = [
      'demo-pass-0000',
      'sk-live-',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      '••••••••',
    ];
    for (const secret of poisonedSecrets) {
      expect(prompt).not.toContain(secret);
    }
  });

  it('mentions the element role and name when present', () => {
    const prompt = buildPreDraftPrompt(
      baseInput({ elementRole: 'button', elementName: 'Start Walkthrough' }),
    );
    expect(prompt).toContain('button');
    expect(prompt).toContain('Start Walkthrough');
  });

  it('describes a route transition when routeBefore differs from routeAfter', () => {
    const prompt = buildPreDraftPrompt(baseInput({ routeBefore: '/login', routeAfter: '/items' }));
    expect(prompt).toContain('/login');
    expect(prompt).toContain('/items');
  });

  it('notes when no images are attached vs. when they are', () => {
    const without = buildPreDraftPrompt(baseInput({ hasImages: false }));
    const withImages = buildPreDraftPrompt(baseInput({ hasImages: true }));
    expect(without).toContain('No frame images');
    expect(withImages).toContain('Two frames are attached');
  });

  it('is deterministic: identical input produces identical output', () => {
    const input = baseInput({ elementRole: 'button', elementName: 'Continue' });
    expect(buildPreDraftPrompt(input)).toBe(buildPreDraftPrompt(input));
  });
});
