// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';
import { WalkthroughFlowSchema } from '@waggle/ir';
import { describe, expect, it } from 'vitest';
import { segmentSession } from '../../src/segment/segment-session.js';
import { loadSixStepFixture } from '../helpers/load-fixture.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('AC1: segmentSession - determinism on the fixture recording', () => {
  it('produces byte-identical flow JSON across two runs on the same input (hashed)', () => {
    const { events, meta } = loadSixStepFixture();

    const first = segmentSession(events, meta);
    const second = segmentSession(events, meta);

    const firstJson = JSON.stringify(first.flow, null, 2);
    const secondJson = JSON.stringify(second.flow, null, 2);

    const firstHash = sha256(firstJson);
    const secondHash = sha256(secondJson);

    expect(secondHash).toBe(firstHash);
    expect(firstJson).toBe(secondJson);
    // A hash is only convincing evidence if it also can't be trivially
    // equal-by-construction: pin the exact value so a future change to
    // the segmenter that silently alters output shows up as a diff here.
    expect(firstHash).toMatchSnapshot();
  });

  it('produces a flow that independently validates against WalkthroughFlowSchema', () => {
    const { events, meta } = loadSixStepFixture();
    const { flow } = segmentSession(events, meta);
    const result = WalkthroughFlowSchema.safeParse(flow);
    expect(result.success).toBe(true);
  });

  it('produces one StepTiming per step, in order, with no gaps', () => {
    const { events, meta } = loadSixStepFixture();
    const { flow, stepTimings } = segmentSession(events, meta);
    expect(stepTimings).toHaveLength(flow.steps.length);
    stepTimings.forEach((timing, index) => expect(timing.stepIndex).toBe(index));
  });

  it('classifies the canonical 6-step walkthrough correctly', () => {
    const { events, meta } = loadSixStepFixture();
    const { flow } = segmentSession(events, meta);

    const classifications = flow.steps.map((step) => step.waggle.classification);
    // click(start)->navigate, input(username), input(password),
    // click(login)->navigate, click(item-2)->state-change,
    // click(continue-to-scroll)->navigate, scroll, click(continue-to-fetch)->navigate,
    // click(fetch-trigger)->state-change (settle only, no route/state-change event),
    // click(continue-to-confirm)->navigate
    expect(classifications).toEqual([
      'navigate',
      'input',
      'input',
      'navigate',
      'state-change',
      'navigate',
      'scroll',
      'navigate',
      'state-change',
      'navigate',
    ]);
  });

  it('masks every change step value: no captured character ever appears in the IR', () => {
    const { events, meta } = loadSixStepFixture();
    const { flow } = segmentSession(events, meta);
    const changeSteps = flow.steps.filter((step) => step.type === 'change');
    expect(changeSteps.length).toBeGreaterThan(0);
    for (const step of changeSteps) {
      expect(step.value).toBe('[REDACTED]');
    }
    // The real fixture typed "demo-user" and "demo-pass-0000"; neither
    // substring, nor any letter/digit from them, may appear anywhere in
    // the serialized flow.
    const serialized = JSON.stringify(flow);
    expect(serialized).not.toContain('demo-user');
    expect(serialized).not.toContain('demo-pass');
  });

  it('marks the credential-flagged input step masked:true, and the non-credential one masked:false', () => {
    const { events, meta } = loadSixStepFixture();
    const { flow } = segmentSession(events, meta);
    const changeSteps = flow.steps.filter((step) => step.type === 'change');
    expect(changeSteps.map((step) => step.waggle.masked)).toEqual([false, true]);
  });

  it('associates bounded credential boxes with their video-relative activation timestamp', () => {
    const { events, meta } = loadSixStepFixture();
    const shiftedMeta = {
      ...meta,
      video: { ...meta.video, anchorEpochMs: meta.video.anchorEpochMs + 100 },
    };
    const { frameRedactions } = segmentSession(events, shiftedMeta);
    expect(frameRedactions).toEqual([
      {
        startRelMs: 95.39990234375,
        geometry: {
          rect: { x: 384, y: 298, w: 512, h: 42 },
          viewport: { w: 1280, h: 800, dpr: 1 },
        },
      },
    ]);
  });

  it('redacts from video frame zero when a credential event predates the recording anchor', () => {
    const { events, meta } = loadSixStepFixture();
    const shiftedMeta = {
      ...meta,
      video: { ...meta.video, anchorEpochMs: meta.video.anchorEpochMs + 300 },
    };
    const { frameRedactions } = segmentSession(events, shiftedMeta);
    expect(frameRedactions[0]?.startRelMs).toBe(0);
  });

  it('carries the recorded viewport, startEpochMs, and cursor trail onto flow.waggle', () => {
    const { events, meta } = loadSixStepFixture();
    const { flow } = segmentSession(events, meta);
    expect(flow.waggle.recordedViewport).toEqual(meta.recordedViewport);
    expect(flow.waggle.startEpochMs).toBe(meta.startEpochMs);
    expect(flow.waggle.cursorTrail.length).toBeGreaterThan(0);
    expect(flow.waggle.clicks.length).toBe(events.filter((e) => e.type === 'click').length * 2);
  });
});
