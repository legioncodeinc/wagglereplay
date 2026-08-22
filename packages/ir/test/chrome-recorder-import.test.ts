// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  classifyRecorderStep,
  DEFAULT_RECORDED_VIEWPORT,
  exportToPuppeteerReplay,
  IrValidationError,
  importChromeRecorderFlow,
  validateWalkthroughFlow,
  WAGGLE_IR_SCHEMA_VERSION,
} from '../src/index.js';
import { loadFixture, RECORDER_FIXTURES } from './fixtures.js';

/**
 * AC3: a bare Chrome Recorder export loads as a Walkthrough IR flow with
 * the Waggle keys defaulted sensibly.
 */

describe('AC3: Chrome Recorder JSON import', () => {
  it.each(RECORDER_FIXTURES)('imports %s as a valid Walkthrough IR flow', (name) => {
    const flow = importChromeRecorderFlow(loadFixture(name));
    const result = validateWalkthroughFlow(flow);
    if (!result.ok) {
      throw new Error(
        `imported ${name} is not a valid IR flow:\n${result.issues
          .map((issue) => `  - ${issue.path}: ${issue.message}`)
          .join('\n')}`,
      );
    }
  });

  it('takes the recorded viewport from the export`s setViewport step', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-export'));
    expect(flow.waggle.recordedViewport).toEqual({ w: 1512, h: 823, dpr: 2 });
  });

  it('falls back to the documented default viewport when the export has no setViewport step', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-no-viewport'));
    expect(flow.waggle.recordedViewport).toEqual(DEFAULT_RECORDED_VIEWPORT);
  });

  it('honours an explicit viewport override ahead of the setViewport step', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-export'), {
      recordedViewport: { w: 390, h: 844, dpr: 3 },
    });
    expect(flow.waggle.recordedViewport).toEqual({ w: 390, h: 844, dpr: 3 });
  });

  it('defaults the flow-level Waggle keys without inventing timing data', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-export'));
    expect(flow.waggle.schemaVersion).toBe(WAGGLE_IR_SCHEMA_VERSION);
    expect(flow.waggle.startEpochMs).toBe(0);
    expect(flow.waggle.cursorTrail).toEqual([]);
    expect(flow.waggle.clicks).toEqual([]);
    expect(flow.waggle.sourceRecording).toBeUndefined();
    expect(flow.waggle.userAgent).toBeUndefined();
  });

  it('is deterministic: importing the same export twice produces identical bytes', () => {
    const source = loadFixture('chrome-recorder-export');
    const first = JSON.stringify(importChromeRecorderFlow(source));
    const second = JSON.stringify(importChromeRecorderFlow(source));
    expect(first).toBe(second);
  });

  it('accepts an explicit startEpochMs and userAgent', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-export'), {
      startEpochMs: 1_755_648_000_000,
      userAgent: 'Waggle test agent',
    });
    expect(flow.waggle.startEpochMs).toBe(1_755_648_000_000);
    expect(flow.waggle.userAgent).toBe('Waggle test agent');
  });

  it('classifies every imported step by its step type', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-export'));
    expect(flow.steps.map((step) => `${step.type}:${step.waggle.classification}`)).toEqual([
      'setViewport:state-change',
      'navigate:navigate',
      'click:state-change',
      'change:input',
      'keyDown:input',
      'keyUp:input',
      'scroll:scroll',
      'waitForElement:state-change',
    ]);
  });

  it('maps every step type to a classification', () => {
    expect(classifyRecorderStep('navigate')).toBe('navigate');
    expect(classifyRecorderStep('change')).toBe('input');
    expect(classifyRecorderStep('scroll')).toBe('scroll');
    expect(classifyRecorderStep('doubleClick')).toBe('state-change');
  });

  it('leaves optional Waggle keys absent rather than stubbing them', () => {
    const flow = importChromeRecorderFlow(loadFixture('chrome-recorder-export'));
    for (const step of flow.steps) {
      expect(step.waggle.masked).toBe(false);
      expect(step.waggle.domDelta).toBeUndefined();
      expect(step.waggle.settle).toBeUndefined();
      expect(step.waggle.element).toBeUndefined();
      expect(step.waggle.assets).toBeUndefined();
      expect(step.waggle.narrationSegmentId).toBeUndefined();
      expect(step.waggle.routeBefore).toBeUndefined();
      expect(step.waggle.routeAfter).toBeUndefined();
    }
  });

  it('passes the step core through untouched', () => {
    const source = loadFixture('chrome-recorder-export');
    const roundTripped = exportToPuppeteerReplay(importChromeRecorderFlow(source));
    expect(roundTripped).toEqual(source);
  });

  it('rejects a malformed Recorder export with a precise path', () => {
    const broken = structuredClone(loadFixture('chrome-recorder-export')) as {
      steps: Array<Record<string, unknown>>;
    };
    const step = broken.steps[2];
    if (step === undefined) {
      throw new Error('recorder fixture lost its click step');
    }
    delete step.offsetY;

    let thrown: unknown;
    try {
      importChromeRecorderFlow(broken);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(IrValidationError);
    const issues = (thrown as IrValidationError).issues;
    expect(issues.map((issue) => issue.path)).toContain('steps[2].offsetY');
  });
});
