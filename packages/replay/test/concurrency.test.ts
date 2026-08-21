import { describe, expect, it } from 'vitest';
import {
  CONCURRENCY_ENV_VAR,
  ConcurrencyError,
  DEFAULT_CONCURRENCY,
  parseConcurrency,
  runWithConcurrency,
} from '../src/regen/concurrency.js';

describe('parseConcurrency', () => {
  it('defaults when unset or empty', () => {
    expect(parseConcurrency(undefined)).toBe(DEFAULT_CONCURRENCY);
    expect(parseConcurrency('')).toBe(DEFAULT_CONCURRENCY);
  });

  it('accepts integers in range', () => {
    expect(parseConcurrency('1')).toBe(1);
    expect(parseConcurrency('4')).toBe(4);
    expect(parseConcurrency('8')).toBe(8);
  });

  it('rejects typos loudly rather than falling back silently', () => {
    for (const bad of ['0', '-1', '1O', '2.5', '9', 'null']) {
      expect(() => parseConcurrency(bad)).toThrow(ConcurrencyError);
    }
    expect(() => parseConcurrency('0')).toThrow(CONCURRENCY_ENV_VAR);
  });
});

describe('runWithConcurrency', () => {
  it('runs every job and preserves input order', async () => {
    const log: number[] = [];
    const jobs = [3, 1, 2].map((value) => async (): Promise<number> => {
      await new Promise((resolve) => {
        setTimeout(resolve, value * 10);
      });
      log.push(value);
      return value * 10;
    });
    const results = await runWithConcurrency(jobs, 3);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([30, 10, 20]);
    expect(log.length).toBe(3);
  });

  it('never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const jobs = Array.from({ length: 10 }, () => async (): Promise<number> => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      inFlight -= 1;
      return inFlight;
    });
    await runWithConcurrency(jobs, 2);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('lets sibling jobs finish when one rejects', async () => {
    const jobs = [
      async (): Promise<number> => {
        throw new Error('boom');
      },
      async (): Promise<number> => 7,
    ];
    const results = await runWithConcurrency(jobs, 2);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]).toEqual({ status: 'fulfilled', value: 7 });
  });
});
