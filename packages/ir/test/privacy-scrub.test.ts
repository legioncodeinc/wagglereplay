// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  createSensitiveTextScrubber,
  DEFAULT_SCRUB_REPLACEMENT,
  scrubSensitiveText,
} from '../src/privacy/scrub.js';

describe('sensitive text scrubber (prd-010 AC5)', () => {
  it('scrubs env names, values, placeholders, and canaries', () => {
    const output = scrubSensitiveText(
      'DEMO_USER secret.value [credential] CANARY-91 and DEMO_USER again',
      {
        envNames: ['DEMO_USER'],
        values: ['secret.value'],
        placeholders: ['[credential]'],
        canaries: ['CANARY-91'],
      },
    );

    expect(output).toBe(
      `${DEFAULT_SCRUB_REPLACEMENT} ${DEFAULT_SCRUB_REPLACEMENT} ${DEFAULT_SCRUB_REPLACEMENT} ${DEFAULT_SCRUB_REPLACEMENT} and ${DEFAULT_SCRUB_REPLACEMENT} again`,
    );
  });

  it('treats regex syntax and replacement tokens as literals', () => {
    const scrub = createSensitiveTextScrubber({
      values: ['pa$$.*[word](x)?', 'a/b\\c'],
      replacement: '$&-safe',
    });
    expect(scrub('pa$$.*[word](x)? then a/b\\c')).toBe('$&-safe then $&-safe');
  });

  it('orders overlapping literals longest first and ignores empty entries', () => {
    const scrub = createSensitiveTextScrubber({
      envNames: ['TOKEN'],
      values: ['TOKEN-extended', ''],
      canaries: ['TOKEN-extended-more'],
    });
    expect(scrub('TOKEN-extended-more TOKEN-extended TOKEN')).toBe(
      '[REDACTED] [REDACTED] [REDACTED]',
    );
  });

  it('is an identity function when no non-empty literals are supplied', () => {
    const input = 'ordinary narration text';
    expect(createSensitiveTextScrubber({ values: ['', ''] })(input)).toBe(input);
  });
});
