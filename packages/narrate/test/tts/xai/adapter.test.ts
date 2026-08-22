// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { XaiAdapter } from '../../../src/tts/xai/adapter.js';

describe('XaiAdapter (AC5 stub)', () => {
  it('declares honest capabilities: no timestamps, flagged beta (ADR-006 watch list)', () => {
    const adapter = new XaiAdapter();
    expect(adapter.capabilities.provider).toBe('xai');
    expect(adapter.capabilities.timestamps).toBe('none');
    expect(adapter.capabilities.beta).toBe(true);
  });

  it('estimateCostUsd works even though synthesize is unimplemented', () => {
    const adapter = new XaiAdapter();
    expect(adapter.estimateCostUsd(1000)).toBeCloseTo(0.015, 5);
  });

  it('synthesize rejects rather than fabricating audio', async () => {
    const adapter = new XaiAdapter();
    await expect(adapter.synthesize({ text: 'Hi' })).rejects.toThrow(/not yet implemented/);
  });
});
