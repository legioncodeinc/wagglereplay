import { describe, expect, it } from 'vitest';
import { isPlaceholder, REPLAY_PACKAGE_PLACEHOLDER } from '../src/index.js';

describe('packages/replay placeholder', () => {
  it('is a placeholder pending prd-009', () => {
    expect(isPlaceholder()).toBe(true);
    expect(REPLAY_PACKAGE_PLACEHOLDER).toContain('prd-009');
  });
});
