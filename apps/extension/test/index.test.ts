// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  CAPTURE_SCHEMA_VERSION,
  CaptureEventSchema,
  finalizeSession,
  maskInputValue,
} from '../src/index.js';

describe('@waggle/extension barrel', () => {
  it('exports a usable, working surface', () => {
    expect(CAPTURE_SCHEMA_VERSION).toBe(1);
    expect(maskInputValue('hunter2')).toEqual({ placeholder: '[REDACTED]', masked: true });
    expect(typeof finalizeSession).toBe('function');
    expect(() =>
      CaptureEventSchema.parse({
        type: 'pointermove',
        seq: 0,
        epochMs: 1,
        tabId: 1,
        x: 0,
        y: 0,
      }),
    ).not.toThrow();
  });
});
