// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  formatIssuePath,
  StepCoreSchema,
  UserFlowCoreSchema,
  validateUserFlowCore,
  validateWalkthroughFlow,
  WAGGLE_IR_SCHEMA_VERSION,
  WalkthroughFlowSchema,
  WalkthroughStepSchema,
} from '../src/index.js';
import { loadFixture, RECORDER_FIXTURES, VALID_FLOW_FIXTURES } from './fixtures.js';

/**
 * AC1: types plus zod schemas for the flow, the Puppeteer Replay step core,
 * and the Waggle extension keys, with the core proven to be a faithful
 * superset.
 *
 * AC2: the validator accepts the documented fixture set and rejects a
 * mutation battery with precise error paths.
 */

/** Structured-clone deep copy so a mutation never leaks into another case. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('fixture root is not an object');
  }
  return value as Record<string, unknown>;
}

function stepAt(flow: unknown, index: number): Record<string, unknown> {
  const steps = asRecord(flow).steps;
  if (!Array.isArray(steps)) {
    throw new TypeError('fixture has no steps array');
  }
  const step = steps[index];
  if (typeof step !== 'object' || step === null) {
    throw new TypeError(`fixture has no step at index ${index}`);
  }
  return step as Record<string, unknown>;
}

function waggleOf(flow: unknown): Record<string, unknown> {
  return asRecord(asRecord(flow).waggle);
}

describe('AC1: formatIssuePath renders a precise JSON path', () => {
  it('uses brackets for array indices and dots for keys', () => {
    expect(formatIssuePath(['steps', 2, 'selectors', 0])).toBe('steps[2].selectors[0]');
    expect(formatIssuePath(['steps', 2, 'waggle', 'element', 'rect', 'w'])).toBe(
      'steps[2].waggle.element.rect.w',
    );
    expect(formatIssuePath(['waggle', 'recordedViewport', 'h'])).toBe('waggle.recordedViewport.h');
    expect(formatIssuePath([0, 'x'])).toBe('[0].x');
    expect(formatIssuePath([])).toBe('(root)');
  });
});

describe('AC1: the step core is a faithful Puppeteer Replay superset', () => {
  it.each(RECORDER_FIXTURES)('accepts every step of the bare Recorder fixture %s', (name) => {
    const flow = loadFixture(name);
    const parsed = UserFlowCoreSchema.safeParse(flow);
    expect(parsed.success).toBe(true);

    const steps = asRecord(flow).steps as unknown[];
    for (const step of steps) {
      expect(StepCoreSchema.safeParse(step).success).toBe(true);
    }
  });

  it('is purely additive: a valid core step becomes a valid IR step by adding `waggle`', () => {
    const recorder = loadFixture('chrome-recorder-export');
    const steps = asRecord(recorder).steps as unknown[];

    for (const step of steps) {
      // The bare Recorder step is a valid core step but NOT yet a valid IR
      // step: `waggle` is required on every IR step.
      expect(StepCoreSchema.safeParse(step).success).toBe(true);
      expect(WalkthroughStepSchema.safeParse(step).success).toBe(false);

      // Adding the Waggle key, and changing nothing else, makes it valid.
      const withWaggle = {
        ...(step as object),
        waggle: { classification: 'input', masked: false },
      };
      expect(WalkthroughStepSchema.safeParse(withWaggle).success).toBe(true);
    }
  });

  it('covers every documented Waggle extension key', () => {
    const flow = WalkthroughFlowSchema.parse(loadFixture('flow-state-change'));
    const step = flow.steps[0];
    if (step === undefined) {
      throw new Error('flow-state-change fixture lost its first step');
    }

    expect(flow.waggle.schemaVersion).toBe(WAGGLE_IR_SCHEMA_VERSION);
    expect(flow.waggle.recordedViewport).toEqual({ w: 1440, h: 900, dpr: 2 });
    expect(flow.waggle.cursorTrail).toHaveLength(4);
    expect(flow.waggle.clicks).toHaveLength(2);

    expect(step.waggle.classification).toBe('state-change');
    expect(step.waggle.routeBefore).toBe('/dashboard');
    expect(step.waggle.routeAfter).toBe('/dashboard');
    expect(step.waggle.domDelta?.ariaChanges).toHaveLength(2);
    expect(step.waggle.settle).toEqual({ source: 'animation-end', ms: 220 });
    expect(step.waggle.element?.role).toBe('button');
    expect(step.waggle.assets?.click).toBe('steps/v1/000-click.png');
    expect(step.waggle.masked).toBe(false);
  });
});

describe('AC2: the validator accepts the documented fixture set', () => {
  it.each(VALID_FLOW_FIXTURES)('accepts %s', (name) => {
    const result = validateWalkthroughFlow(loadFixture(name));
    if (!result.ok) {
      throw new Error(
        `fixture ${name} should be valid but failed:\n${result.issues
          .map((issue) => `  - ${issue.path}: ${issue.message}`)
          .join('\n')}`,
      );
    }
    expect(result.value.title.length).toBeGreaterThan(0);
  });

  it('covers all four step classifications across the fixture set', () => {
    const seen = new Set<string>();
    for (const name of VALID_FLOW_FIXTURES) {
      const flow = WalkthroughFlowSchema.parse(loadFixture(name));
      for (const step of flow.steps) {
        seen.add(step.waggle.classification);
      }
    }
    expect([...seen].sort()).toEqual(['input', 'navigate', 'scroll', 'state-change']);
  });
});

interface RejectionCase {
  readonly name: string;
  readonly expectedPath: string;
  readonly mutate: (flow: unknown) => unknown;
}

/**
 * The mutation battery. Every case names the exact JSON path the validator
 * must point at, which is the property under test: a validator that only
 * reports "invalid input" is useless against a 200-step IR that a human has
 * to hand-fix in a PR review.
 */
const REJECTION_BATTERY: readonly RejectionCase[] = [
  // --- bad selector arrays -----------------------------------------------
  {
    name: 'empty selectors array',
    expectedPath: 'steps[0].selectors',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).selectors = [];
      return next;
    },
  },
  {
    name: 'selectors entry is an empty chain array',
    expectedPath: 'steps[0].selectors[0]',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).selectors = [[]];
      return next;
    },
  },
  {
    name: 'selectors entry is a number',
    expectedPath: 'steps[0].selectors[0]',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).selectors = [42];
      return next;
    },
  },
  {
    name: 'selectors entry is an empty string',
    expectedPath: 'steps[0].selectors[0]',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).selectors = [''];
      return next;
    },
  },
  {
    // zod resolves this all the way to the offending chain entry, which is
    // the level of precision the AC asks for.
    name: 'selectors chain contains an empty string',
    expectedPath: 'steps[0].selectors[0][1]',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).selectors = [['#toolbar', '']];
      return next;
    },
  },
  {
    name: 'selectors is not an array at all',
    expectedPath: 'steps[0].selectors',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).selectors = '#filters-button';
      return next;
    },
  },
  {
    name: 'a step that requires selectors has none',
    expectedPath: 'steps[0].selectors',
    mutate: (flow) => {
      const next = clone(flow);
      const step = stepAt(next, 0);
      delete step.selectors;
      return next;
    },
  },

  // --- negative times ------------------------------------------------------
  {
    name: 'negative cursor-trail timestamp',
    expectedPath: 'waggle.cursorTrail[1].t',
    mutate: (flow) => {
      const next = clone(flow);
      const trail = waggleOf(next).cursorTrail as Array<Record<string, unknown>>;
      const sample = trail[1];
      if (sample === undefined) {
        throw new Error('fixture cursorTrail is too short for this case');
      }
      sample.t = -120;
      return next;
    },
  },
  {
    name: 'negative click timestamp',
    expectedPath: 'waggle.clicks[0].t',
    mutate: (flow) => {
      const next = clone(flow);
      const clicks = waggleOf(next).clicks as Array<Record<string, unknown>>;
      const click = clicks[0];
      if (click === undefined) {
        throw new Error('fixture clicks is too short for this case');
      }
      click.t = -1;
      return next;
    },
  },
  {
    name: 'negative startEpochMs',
    expectedPath: 'waggle.startEpochMs',
    mutate: (flow) => {
      const next = clone(flow);
      waggleOf(next).startEpochMs = -1;
      return next;
    },
  },
  {
    name: 'negative settle duration',
    expectedPath: 'steps[0].waggle.settle.ms',
    mutate: (flow) => {
      const next = clone(flow);
      const waggle = asRecord(stepAt(next, 0).waggle);
      waggle.settle = { source: 'animation-end', ms: -220 };
      return next;
    },
  },
  {
    name: 'negative step timeout',
    expectedPath: 'steps[0].timeout',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).timeout = -500;
      return next;
    },
  },
  {
    name: 'step timeout of zero is below the Puppeteer Replay minimum',
    expectedPath: 'steps[0].timeout',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).timeout = 0;
      return next;
    },
  },
  {
    name: 'step timeout above the Puppeteer Replay maximum',
    expectedPath: 'steps[0].timeout',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).timeout = 30_001;
      return next;
    },
  },
  {
    name: 'negative source-recording duration',
    expectedPath: 'waggle.sourceRecording.durationMs',
    mutate: (flow) => {
      const next = clone(flow);
      waggleOf(next).sourceRecording = { videoRef: 'renders/source/x.webm', durationMs: -5 };
      return next;
    },
  },
  {
    name: 'negative frame index',
    expectedPath: 'steps[0].frame[0]',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).frame = [-1];
      return next;
    },
  },

  // --- missing viewport ----------------------------------------------------
  {
    name: 'missing recordedViewport',
    expectedPath: 'waggle.recordedViewport',
    mutate: (flow) => {
      const next = clone(flow);
      delete waggleOf(next).recordedViewport;
      return next;
    },
  },
  {
    name: 'recordedViewport height of zero',
    expectedPath: 'waggle.recordedViewport.h',
    mutate: (flow) => {
      const next = clone(flow);
      asRecord(waggleOf(next).recordedViewport).h = 0;
      return next;
    },
  },
  {
    name: 'recordedViewport width is a string',
    expectedPath: 'waggle.recordedViewport.w',
    mutate: (flow) => {
      const next = clone(flow);
      asRecord(waggleOf(next).recordedViewport).w = '1440';
      return next;
    },
  },
  {
    name: 'recordedViewport dpr of zero',
    expectedPath: 'waggle.recordedViewport.dpr',
    mutate: (flow) => {
      const next = clone(flow);
      asRecord(waggleOf(next).recordedViewport).dpr = 0;
      return next;
    },
  },

  // --- missing or malformed Waggle keys ------------------------------------
  {
    name: 'flow has no waggle key at all',
    expectedPath: 'waggle',
    mutate: (flow) => {
      const next = clone(flow);
      delete asRecord(next).waggle;
      return next;
    },
  },
  {
    name: 'step has no waggle key',
    expectedPath: 'steps[0].waggle',
    mutate: (flow) => {
      const next = clone(flow);
      delete stepAt(next, 0).waggle;
      return next;
    },
  },
  {
    name: 'unknown step classification',
    expectedPath: 'steps[0].waggle.classification',
    mutate: (flow) => {
      const next = clone(flow);
      asRecord(stepAt(next, 0).waggle).classification = 'teleport';
      return next;
    },
  },
  {
    name: 'masked is a string, not a boolean',
    expectedPath: 'steps[0].waggle.masked',
    mutate: (flow) => {
      const next = clone(flow);
      asRecord(stepAt(next, 0).waggle).masked = 'yes';
      return next;
    },
  },
  {
    name: 'negative element rect width',
    expectedPath: 'steps[0].waggle.element.rect.w',
    mutate: (flow) => {
      const next = clone(flow);
      const element = asRecord(asRecord(stepAt(next, 0).waggle).element);
      asRecord(element.rect).w = -96;
      return next;
    },
  },
  {
    name: 'unknown aria change kind',
    expectedPath: 'steps[0].waggle.domDelta.ariaChanges[0].change',
    mutate: (flow) => {
      const next = clone(flow);
      const domDelta = asRecord(asRecord(stepAt(next, 0).waggle).domDelta);
      const changes = domDelta.ariaChanges as Array<Record<string, unknown>>;
      const change = changes[0];
      if (change === undefined) {
        throw new Error('fixture ariaChanges is empty');
      }
      change.change = 'wiggled';
      return next;
    },
  },
  {
    name: 'wrong Waggle schema version',
    expectedPath: 'waggle.schemaVersion',
    mutate: (flow) => {
      const next = clone(flow);
      waggleOf(next).schemaVersion = 99;
      return next;
    },
  },

  // --- core step-shape violations -------------------------------------------
  {
    name: 'unknown step type',
    expectedPath: 'steps[0].type',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).type = 'teleport';
      return next;
    },
  },
  {
    name: 'click step missing offsetX',
    expectedPath: 'steps[0].offsetX',
    mutate: (flow) => {
      const next = clone(flow);
      delete stepAt(next, 0).offsetX;
      return next;
    },
  },
  {
    name: 'unknown pointer button',
    expectedPath: 'steps[0].button',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 0).button = 'thumb';
      return next;
    },
  },
  {
    name: 'empty flow title',
    expectedPath: 'title',
    mutate: (flow) => {
      const next = clone(flow);
      asRecord(next).title = '';
      return next;
    },
  },
  {
    name: 'waitForElement operator is not one of >= == <=',
    expectedPath: 'steps[1].operator',
    mutate: (flow) => {
      const next = clone(flow);
      stepAt(next, 1).operator = '!=';
      return next;
    },
  },
];

describe('AC2: the validator rejects the mutation battery with precise error paths', () => {
  const base = loadFixture('flow-state-change');

  it('has a battery that covers the three named minimums', () => {
    const names = REJECTION_BATTERY.map((entry) => entry.name).join(' ');
    expect(names).toContain('selectors');
    expect(names).toContain('negative');
    expect(names).toContain('missing recordedViewport');
    expect(REJECTION_BATTERY.length).toBeGreaterThanOrEqual(30);
  });

  it('confirms the unmutated base fixture is valid', () => {
    expect(validateWalkthroughFlow(base).ok).toBe(true);
  });

  it.each(REJECTION_BATTERY)('rejects: $name (at $expectedPath)', ({ expectedPath, mutate }) => {
    const result = validateWalkthroughFlow(mutate(base));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    const paths = result.issues.map((issue) => issue.path);
    expect(paths).toContain(expectedPath);
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    const mutated = clone(base);
    stepAt(mutated, 0).offsetZ = 4;
    const result = validateWalkthroughFlow(mutated);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.code === 'unrecognized_keys')).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes('offsetZ'))).toBe(true);
  });

  it('rejects a non-object document at the root', () => {
    const result = validateWalkthroughFlow('not a flow');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues[0]?.path).toBe('(root)');
  });
});

describe('AC2: the core validator rejects a broken Recorder export', () => {
  it('names the offending path in a bare Recorder document', () => {
    const recorder = clone(loadFixture('chrome-recorder-export'));
    stepAt(recorder, 2).selectors = [];
    const result = validateUserFlowCore(recorder);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.map((issue) => issue.path)).toContain('steps[2].selectors');
  });
});
