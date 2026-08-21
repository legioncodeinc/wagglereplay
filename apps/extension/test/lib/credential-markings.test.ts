import { describe, expect, it, vi } from 'vitest';
import {
  explicitCredentialKind,
  fetchCredentialMarkings,
} from '../../src/lib/credential-markings.js';

describe('credential markings', () => {
  it('classifies generated selectors from explicit project markings', () => {
    expect(
      explicitCredentialKind(
        [
          { type: 'css', value: '[data-testid="opaque"]' },
          { type: 'aria', value: 'aria/Account[role="textbox"]' },
        ],
        [{ selector: '[data-testid="opaque"]', kind: 'username' }],
      ),
    ).toBe('username');
  });

  it('fetches only the validated selector-role response', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            credentialSetId: 'demo',
            markings: [{ selector: '#otp', kind: 'totp' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    await expect(fetchCredentialMarkings('http://127.0.0.1:4310', fetchFn)).resolves.toEqual([
      { selector: '#otp', kind: 'totp' },
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      'http://127.0.0.1:4310/api/credential-markings',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('rejects a response that attempts to add a credential value', async () => {
    const fetchFn = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            credentialSetId: 'demo',
            markings: [{ selector: '#user', kind: 'username', value: 'must-not-pass' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    await expect(fetchCredentialMarkings('http://127.0.0.1:4310', fetchFn)).rejects.toThrow();
  });
});
