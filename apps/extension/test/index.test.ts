import { describe, expect, it } from 'vitest';
import { EXTENSION_PLACEHOLDER, isPlaceholder } from '../src/index.js';

describe('apps/extension placeholder', () => {
  it('is a placeholder pending prd-003', () => {
    expect(isPlaceholder()).toBe(true);
    expect(EXTENSION_PLACEHOLDER).toContain('prd-003');
  });
});
