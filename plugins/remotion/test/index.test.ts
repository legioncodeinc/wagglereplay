// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { isPlaceholder, REMOTION_PLUGIN_PLACEHOLDER } from '../src/index.js';

describe('plugins/remotion placeholder', () => {
  it('is a placeholder pending prd-014', () => {
    expect(isPlaceholder()).toBe(true);
    expect(REMOTION_PLUGIN_PLACEHOLDER).toContain('prd-014');
  });
});
