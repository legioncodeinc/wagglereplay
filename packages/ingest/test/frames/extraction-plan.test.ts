import { describe, expect, it } from 'vitest';
import { buildExtractionPlan, stepDirName } from '../../src/frames/extraction-plan.js';
import type { StepTiming } from '../../src/segment/types.js';

function timing(overrides: Partial<StepTiming> & { stepIndex: number }): StepTiming {
  return {
    actionRelMs: 10_000,
    settledRelMs: null,
    clickPoint: null,
    route: '/',
    ...overrides,
  };
}

describe('AC2: buildExtractionPlan', () => {
  it('names step directories zero-padded and sortable', () => {
    expect(stepDirName(0)).toBe('step-000');
    expect(stepDirName(12)).toBe('step-012');
    expect(stepDirName(999)).toBe('step-999');
  });

  it('always requests before.png and click.png; settled.png only when settledRelMs is present', () => {
    const [withSettle, withoutSettle] = buildExtractionPlan(
      [
        timing({ stepIndex: 0, settledRelMs: 10_500 }),
        timing({ stepIndex: 1, settledRelMs: null }),
      ],
      100_000,
    );
    const rolesWith = withSettle?.requests.map((r) => r.role) ?? [];
    const rolesWithout = withoutSettle?.requests.map((r) => r.role) ?? [];
    expect(rolesWith).toContain('settled');
    expect(rolesWithout).not.toContain('settled');
  });

  it('produces 11 evenly-spaced samples across a +-5s window at the 1s default interval', () => {
    const [plan] = buildExtractionPlan([timing({ stepIndex: 0, actionRelMs: 20_000 })], 100_000);
    const samples = plan?.requests.filter((r) => r.role === 'sample') ?? [];
    expect(samples).toHaveLength(11);
    expect(samples[0]?.relMs).toBe(15_000);
    expect(samples[10]?.relMs).toBe(25_000);
  });

  it('clamps every requested time into [0, durationMs] rather than going negative or past the end', () => {
    const durationMs = 3_000;
    const [plan] = buildExtractionPlan([timing({ stepIndex: 0, actionRelMs: 500 })], durationMs);
    for (const request of plan?.requests ?? []) {
      expect(request.relMs).toBeGreaterThanOrEqual(0);
      expect(request.relMs).toBeLessThanOrEqual(durationMs);
    }
    expect(plan?.requests.find((r) => r.fileName === 'before.png')?.relMs).toBe(0);
  });

  it('is a pure function: identical input produces identical output (idempotency building block)', () => {
    const timings = [timing({ stepIndex: 0 }), timing({ stepIndex: 1, actionRelMs: 30_000 })];
    const first = buildExtractionPlan(timings, 100_000);
    const second = buildExtractionPlan(timings, 100_000);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('honors a custom window and sample interval', () => {
    const [plan] = buildExtractionPlan([timing({ stepIndex: 0, actionRelMs: 10_000 })], 100_000, {
      windowMs: 2_000,
      sampleIntervalMs: 500,
    });
    const samples = plan?.requests.filter((r) => r.role === 'sample') ?? [];
    expect(samples).toHaveLength(9); // -2000..+2000 step 500
  });
});
