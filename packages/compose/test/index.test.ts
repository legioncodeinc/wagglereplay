import { describe, expect, it } from 'vitest';
import { COMPOSE_PACKAGE_PLACEHOLDER, isPlaceholder } from '../src/index.js';

describe('packages/compose placeholder', () => {
  it('is a placeholder pending prd-007', () => {
    expect(isPlaceholder()).toBe(true);
    expect(COMPOSE_PACKAGE_PLACEHOLDER).toContain('prd-007');
  });
});
