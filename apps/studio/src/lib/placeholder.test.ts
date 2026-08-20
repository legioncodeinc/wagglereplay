import { describe, expect, it } from 'vitest';
import { isPlaceholder, STUDIO_PLACEHOLDER } from './placeholder';

describe('apps/studio placeholder', () => {
  it('is a placeholder pending prd-005', () => {
    expect(isPlaceholder()).toBe(true);
    expect(STUDIO_PLACEHOLDER).toContain('prd-005');
  });
});
