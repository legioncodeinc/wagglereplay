// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { buildCaptionCues } from '../../src/words/captions.js';
import type { WordTiming } from '../../src/words/schema.js';

function words(...texts: string[]): WordTiming[] {
  return texts.map((word, i) => ({ word, startMs: i * 300, endMs: i * 300 + 250 }));
}

describe('buildCaptionCues', () => {
  it('fits everything on one line when it is short', () => {
    const cues = buildCaptionCues(words('Click', 'the', 'button'));
    expect(cues).toHaveLength(1);
    expect(cues[0]?.lines).toEqual(['Click the button']);
  });

  it('wraps to a second line before starting a new cue', () => {
    // Each word plus separators comfortably exceeds one 42-char line but fits two.
    const longWords = words(
      'This',
      'sentence',
      'is',
      'long',
      'enough',
      'to',
      'need',
      'a',
      'second',
      'caption',
      'line',
      'here',
    );
    const cues = buildCaptionCues(longWords, { maxCharsPerLine: 20, maxLinesPerCue: 2 });
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2);
      for (const line of cue.lines) {
        expect(line.length).toBeLessThanOrEqual(20);
      }
    }
    // Every word must appear exactly once across all cues, in order.
    const flat = cues.flatMap((cue) => cue.lines.join(' ').split(' '));
    expect(flat).toEqual(longWords.map((w) => w.word));
  });

  it('never splits a single word even if it exceeds maxCharsPerLine', () => {
    const cues = buildCaptionCues(words('supercalifragilisticexpialidocious'), {
      maxCharsPerLine: 10,
    });
    expect(cues).toHaveLength(1);
    expect(cues[0]?.lines).toEqual(['supercalifragilisticexpialidocious']);
  });

  it("derives a cue's startMs/endMs from its first and last word", () => {
    const cues = buildCaptionCues(words('Hello', 'world'));
    expect(cues[0]?.startMs).toBe(0);
    expect(cues[0]?.endMs).toBe(550);
  });

  it('numbers cues starting at 1', () => {
    const longWords = words('one', 'two', 'three', 'four', 'five', 'six');
    const cues = buildCaptionCues(longWords, { maxCharsPerLine: 6, maxLinesPerCue: 1 });
    expect(cues.map((c) => c.index)).toEqual(cues.map((_, i) => i + 1));
  });

  it('caps at 42 chars per line and 2 lines per cue by default (AC4)', () => {
    const manyWords = words(...Array.from({ length: 30 }, (_, i) => `word${i}`));
    const cues = buildCaptionCues(manyWords);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2);
      for (const line of cue.lines) {
        expect(line.length).toBeLessThanOrEqual(42);
      }
    }
  });
});
