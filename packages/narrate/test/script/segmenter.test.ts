import { describe, expect, it } from 'vitest';
import { draftNarrationScript, draftSegmentText } from '../../src/script/segmenter.js';
import { buildFixtureFlow } from '../fixtures/flow.js';

describe('draftSegmentText', () => {
  const flow = buildFixtureFlow();

  it('drafts a navigate sentence from routeAfter', () => {
    const step = flow.steps[0];
    if (step === undefined) throw new Error('fixture missing step 0');
    expect(draftSegmentText(step, 0)).toBe('Navigate to /dashboard.');
  });

  it('drafts an input sentence from the element label', () => {
    const step = flow.steps[1];
    if (step === undefined) throw new Error('fixture missing step 1');
    expect(draftSegmentText(step, 1)).toBe('Enter a value in "Email".');
  });

  it('drafts a state-change sentence from the domDelta summary', () => {
    const step = flow.steps[2];
    if (step === undefined) throw new Error('fixture missing step 2');
    expect(draftSegmentText(step, 2)).toBe('The dashboard shows a success banner.');
  });

  it('drafts a scroll sentence from the element label', () => {
    const step = flow.steps[3];
    if (step === undefined) throw new Error('fixture missing step 3');
    expect(draftSegmentText(step, 3)).toBe('Scroll to reveal "Recent activity".');
  });
});

describe('draftNarrationScript', () => {
  it('drafts one unapproved segment per step, each with a positional fallback id', () => {
    const script = draftNarrationScript(buildFixtureFlow());
    expect(script.segments).toHaveLength(4);
    expect(script.segments.map((s) => s.narrationSegmentId)).toEqual([
      'step-0',
      'step-1',
      'step-2',
      'step-3',
    ]);
    for (const segment of script.segments) {
      expect(segment.approved).toBe(false);
      expect(segment.approvedText).toBeNull();
    }
  });

  it('sets each segment targetDurationMs to at least its settle time', () => {
    const script = draftNarrationScript(buildFixtureFlow());
    // step 0's settle is 800ms, and its draft text reads far faster than that.
    expect(script.segments[0]?.targetDurationMs).toBeGreaterThanOrEqual(800);
  });
});
