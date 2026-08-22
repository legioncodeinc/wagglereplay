// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { ProjectState } from '../../../src/lib/state/project-state.svelte.js';
import type { StudioProjectState } from '../../../src/lib/types.js';

function projectState(): StudioProjectState {
  return {
    projectName: 'demo',
    irVersion: null,
    flow: null,
    heatmap: null,
    predraft: null,
    narration: null,
    settings: {
      schemaVersion: 1,
      brandKitId: null,
      voiceId: null,
      presetIds: [],
      credentialSetId: 'demo-account',
    },
    brandKits: [],
    credentialRefs: [
      {
        id: 'demo-account',
        label: 'Demo account',
        username_env: 'DEMO_USER',
        applies_to: { username: [], secret: [], totp: [] },
      },
    ],
    presetChoices: [],
    frameSamples: {},
  };
}

describe('ProjectState credential marking', () => {
  it('updates the runes-backed client view without adding credential values', () => {
    const state = new ProjectState(projectState());
    state.applyCredentialMarkings('demo-account', {
      username: ['[data-testid="opaque-login"]'],
      secret: [],
      totp: [],
    });

    expect(state.data.credentialRefs[0]?.applies_to.username).toEqual([
      '[data-testid="opaque-login"]',
    ]);
    expect(JSON.stringify(state.data)).not.toContain('resolved-credential-value');
  });
});
