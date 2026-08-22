// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import * as replayPublicApi from '../src/index.js';

/**
 * PRD-010's highest-value export contract, given the regression test it
 * never had (HANDOFF-4 section 3 item 3): credential VALUES resolve only
 * inside the replay action callback, so the machinery that binds env-ref
 * values to steps (`createCredentialBindings`) must never be reachable
 * from the public `@waggle/replay` barrel. `src/credentials/index.ts`
 * deliberately omits it; this test fails the build if a future edit
 * re-exports it (directly or via a wildcard), the exact drift a post-merge
 * reviewer would otherwise have to catch by reading.
 */
describe('public barrel surface (prd-010 contract)', () => {
  it('does not export createCredentialBindings', () => {
    expect(Object.keys(replayPublicApi)).not.toContain('createCredentialBindings');
  });

  it('still exports the documented public credential surface', () => {
    // The contract is "resolver absent", not "credentials absent": the
    // public surface keeps the error type and the TOTP primitives the
    // CLI's `waggle creds check` consumes.
    expect(Object.keys(replayPublicApi)).toContain('CredentialBindingError');
    expect(Object.keys(replayPublicApi)).toContain('generateTotp');
  });
});
