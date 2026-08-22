// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  getApprovedSegmentTexts,
  NARRATION_SCRIPT_SCHEMA_VERSION,
  NarrationNotApprovedError,
  type NarrationScript,
} from '../../src/script/script-schema.js';

function scriptWith(overrides: Partial<NarrationScript['segments'][number]>): NarrationScript {
  return {
    schemaVersion: NARRATION_SCRIPT_SCHEMA_VERSION,
    segments: [
      {
        narrationSegmentId: 'step-0',
        stepIndex: 0,
        draftText: 'Draft text.',
        approvedText: null,
        approved: false,
        targetDurationMs: 1000,
        ...overrides,
      },
    ],
  };
}

describe('getApprovedSegmentTexts', () => {
  it('returns approvedText for every approved segment, in order', () => {
    const script: NarrationScript = {
      schemaVersion: NARRATION_SCRIPT_SCHEMA_VERSION,
      segments: [
        {
          narrationSegmentId: 'a',
          stepIndex: 0,
          draftText: 'draft a',
          approvedText: 'Approved A.',
          approved: true,
          targetDurationMs: 500,
        },
        {
          narrationSegmentId: 'b',
          stepIndex: 1,
          draftText: 'draft b',
          approvedText: 'Approved B.',
          approved: true,
          targetDurationMs: 500,
        },
      ],
    };
    expect(getApprovedSegmentTexts(script)).toEqual(['Approved A.', 'Approved B.']);
  });

  it('throws NarrationNotApprovedError when a segment is not approved', () => {
    const script = scriptWith({ approved: false, approvedText: null });
    expect(() => getApprovedSegmentTexts(script)).toThrow(NarrationNotApprovedError);
  });

  it('throws when approved is true but approvedText is still null (inconsistent state)', () => {
    const script = scriptWith({ approved: true, approvedText: null });
    expect(() => getApprovedSegmentTexts(script)).toThrow(NarrationNotApprovedError);
  });

  it('names every unapproved segment id on the thrown error', () => {
    const script: NarrationScript = {
      schemaVersion: NARRATION_SCRIPT_SCHEMA_VERSION,
      segments: [
        {
          narrationSegmentId: 'a',
          stepIndex: 0,
          draftText: 'draft a',
          approvedText: null,
          approved: false,
          targetDurationMs: 500,
        },
        {
          narrationSegmentId: 'b',
          stepIndex: 1,
          draftText: 'draft b',
          approvedText: 'Approved B.',
          approved: true,
          targetDurationMs: 500,
        },
      ],
    };
    expect.assertions(2);
    try {
      getApprovedSegmentTexts(script);
    } catch (error) {
      expect(error).toBeInstanceOf(NarrationNotApprovedError);
      expect((error as NarrationNotApprovedError).unapprovedSegmentIds).toEqual(['a']);
    }
  });
});
