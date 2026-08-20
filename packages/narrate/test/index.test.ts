import { describe, expect, it } from 'vitest';
import { isPlaceholder, NARRATE_PACKAGE_PLACEHOLDER } from '../src/index.js';

describe('packages/narrate placeholder', () => {
  it('is a placeholder pending prd-006', () => {
    expect(isPlaceholder()).toBe(true);
    expect(NARRATE_PACKAGE_PLACEHOLDER).toContain('prd-006');
  });
});
