import { describe, expect, it } from 'vitest';
import { createPerformanceEpochSource, epochFromTimeOrigin } from '../../src/lib/epoch.js';

describe('epochFromTimeOrigin', () => {
  it('adds the time origin and the relative timestamp', () => {
    expect(epochFromTimeOrigin(1_700_000_000_000, 123.5)).toBe(1_700_000_000_123.5);
  });

  it('is exact for a zero timestamp', () => {
    expect(epochFromTimeOrigin(42, 0)).toBe(42);
  });
});

describe('createPerformanceEpochSource', () => {
  it('sums timeOrigin and now() from the injected performance object', () => {
    const fakePerformance = { timeOrigin: 1_000, now: () => 50 } as Performance;
    const source = createPerformanceEpochSource(fakePerformance);
    expect(source.now()).toBe(1_050);
  });
});
