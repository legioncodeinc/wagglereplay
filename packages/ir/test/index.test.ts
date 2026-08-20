import { describe, expect, it } from 'vitest';
import { IR_PACKAGE_PLACEHOLDER, isPlaceholder } from '../src/index.js';

describe('packages/ir placeholder', () => {
  it('is a placeholder pending prd-002', () => {
    expect(isPlaceholder()).toBe(true);
    expect(IR_PACKAGE_PLACEHOLDER).toContain('prd-002');
  });
});
