// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WordTiming } from '@waggle/narrate';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND_KIT } from '../src/brand/defaults.js';
import { BrandKitSchema } from '../src/brand/schema.js';
import { buildAssDocument } from '../src/captions/ass-document.js';
import { buildKaraokeCues, renderKaraokeText } from '../src/captions/ass-karaoke.js';
import {
  escapeAssText,
  sanitizeAssField,
  toAssAlignment,
  toAssColor,
  toAssTime,
  toFfmpegColor,
} from '../src/captions/ass-primitives.js';
import { buildCaptionStyleRow } from '../src/captions/ass-style.js';
import { resolvePreset } from '../src/presets.js';
import { buildTimeline } from '../src/timeline.js';
import { makeWords } from './fixtures.js';

/**
 * prd-007 AC2: the ASS karaoke generator, golden-file tested.
 *
 * The golden files here are TEXT, small, and reviewable in a diff. That is
 * the point: a reviewer can see what changed about a caption without
 * decoding a video. Regenerate them deliberately with
 * `WAGGLE_UPDATE_GOLDEN=1 pnpm --filter @waggle/compose test`, never
 * casually, and read the diff before accepting it.
 */

const GOLDEN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

function assertGolden(name: string, actual: string): void {
  // Golden files are a flat directory of bare filenames; basename enforces
  // that contract (a name carrying a separator can never escape golden/).
  const goldenPath = path.join(GOLDEN_DIR, path.basename(name));
  if (process.env.WAGGLE_UPDATE_GOLDEN === '1') {
    writeFileSync(goldenPath, actual, 'utf8');
    return;
  }
  const expected = readFileSync(goldenPath, 'utf8');
  expect(actual).toBe(expected);
}

const PRESET = resolvePreset('16x9', {
  '16x9': { width: 1280, height: 720, fps: 30 },
}).preset;

describe('AC2: ASS primitives', () => {
  it('reverses the byte order and inverts the alpha for an ASS colour', () => {
    // #RRGGBB becomes &HAABBGGRR: red #ff0000 must land as 0000FF, not FF0000.
    expect(toAssColor('#ff0000')).toBe('&H000000FF');
    expect(toAssColor('#0000ff')).toBe('&H00FF0000');
    // Alpha is inverted: fully opaque is 00, fully transparent is FF.
    expect(toAssColor('#ffffff', 1)).toBe('&H00FFFFFF');
    expect(toAssColor('#ffffff', 0)).toBe('&HFFFFFFFF');
    expect(toAssColor('#ffffff', 0.5)).toBe('&H80FFFFFF');
  });

  it('expands three-digit hex and rejects anything else', () => {
    expect(toAssColor('#f00')).toBe('&H000000FF');
    expect(toFfmpegColor('#f0a')).toBe('0xFF00AA');
    expect(() => toAssColor('rebeccapurple')).toThrow(/is not a #rgb/);
  });

  it('formats ASS timestamps as H:MM:SS.cc with an unpadded hour', () => {
    expect(toAssTime(0)).toBe('0:00:00.00');
    expect(toAssTime(1234)).toBe('0:00:01.23');
    expect(toAssTime(61_050)).toBe('0:01:01.05');
    expect(toAssTime(3_723_450)).toBe('1:02:03.45');
  });

  it('escapes braces so narration text cannot inject an override block', () => {
    expect(escapeAssText('use {\\an8} carefully')).toBe('use \\{an8\\} carefully');
    // A literal newline would end the Dialogue line and truncate the cue.
    expect(escapeAssText('line one\nline two')).toBe('line one line two');
    // A CRLF pair is one break, so it collapses to one space, not two.
    expect(escapeAssText('line one\r\nline two')).toBe('line one line two');
    // ASS has no literal-backslash escape, so the three meaningful
    // sequences lose their backslash rather than breaking the line.
    expect(escapeAssText('a \\N b')).toBe('a N b');
  });

  it('leaves no caller-supplied backslash that could re-form a control sequence', () => {
    // Regression: the previous chained-replace escaper deleted ONE
    // backslash from `\N`, so a doubled backslash survived as a working
    // `\N` and injected a real hard line break into the caption. Verified
    // against libass by rendering: the frame came back as two lines.
    expect(escapeAssText('a \\\\N b')).toBe('a N b');
    expect(escapeAssText('a \\\\h b')).toBe('a h b');
    expect(escapeAssText('a \\\\n b')).toBe('a n b');
    // Every backslash in the result is one this function inserted, so no
    // output backslash can pair with a neighbour ahead of a brace.
    expect(escapeAssText('\\{\\an8\\}')).toBe('\\{an8\\}');
    expect(escapeAssText('C:\\Users\\demo')).toBe('C:Usersdemo');
    for (const output of ['a \\\\N b', '\\{\\an8\\}', 'x\\\\\\\\{y'].map(escapeAssText)) {
      expect(output.replace(/\\[{}]/g, '')).not.toContain('\\');
    }
  });

  it('strips commas from style fields, which ASS cannot quote', () => {
    expect(sanitizeAssField('Inter, Bold')).toBe('Inter  Bold');
  });

  it('maps anchors onto the ASS numpad alignment grid', () => {
    expect(toAssAlignment('bottom-left')).toBe(1);
    expect(toAssAlignment('bottom-center')).toBe(2);
    expect(toAssAlignment('center')).toBe(5);
    expect(toAssAlignment('top-right')).toBe(9);
  });
});

describe('AC2: the caption style row', () => {
  it('puts the highlight colour in Primary and the base colour in Secondary', () => {
    // This is the karaoke inversion: ASS paints unsung text in
    // SecondaryColour and repaints it in PrimaryColour as it is sung.
    const row = buildCaptionStyleRow(
      { ...DEFAULT_BRAND_KIT.captions, textColor: '#ffffff', highlightColor: '#f5b301' },
      PRESET,
    );
    const fields = row.replace('Style: ', '').split(',');
    expect(fields[3]).toBe(toAssColor('#f5b301'));
    expect(fields[4]).toBe(toAssColor('#ffffff'));
  });

  it('scales the font size from the preset height, so one kit fits every preset', () => {
    const landscape = buildCaptionStyleRow(DEFAULT_BRAND_KIT.captions, PRESET);
    const portrait = buildCaptionStyleRow(DEFAULT_BRAND_KIT.captions, resolvePreset('9x16').preset);
    const sizeOf = (row: string): number => Number(row.replace('Style: ', '').split(',')[2]);
    expect(sizeOf(landscape)).toBe(Math.round(DEFAULT_BRAND_KIT.captions.fontSizePct * 720));
    expect(sizeOf(portrait)).toBe(Math.round(DEFAULT_BRAND_KIT.captions.fontSizePct * 1920));
  });
});

describe('AC2: karaoke cue building', () => {
  const words: WordTiming[] = makeWords(
    'Open the dashboard and apply a filter to narrow the results down to just this week of activity',
    9000,
  ).words;

  it('wraps to the kit character budget without splitting a word', () => {
    const cues = buildKaraokeCues(words, { maxCharsPerLine: 42, maxLinesPerCue: 2 });
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2);
      for (const line of cue.lines) {
        const rendered = line.map((word) => word.word).join(' ');
        expect(rendered.length).toBeLessThanOrEqual(42);
      }
    }
  });

  it('keeps cues monotonic and spans them across their own words', () => {
    const cues = buildKaraokeCues(words);
    let previousEnd = -1;
    for (const cue of cues) {
      const flat = cue.lines.flat();
      const first = flat[0];
      const last = flat[flat.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      expect(cue.startMs).toBe(first?.startMs);
      expect(cue.endMs).toBe(last?.endMs);
      expect(cue.startMs).toBeGreaterThan(previousEnd);
      previousEnd = cue.endMs;
    }
  });

  it('never lets rounding drift accumulate across a line', () => {
    // Every `\k` duration is a difference of two absolute centisecond
    // instants, so the sum of a cue's tags must equal the cue's own span
    // exactly, no matter how many words it holds.
    const cues = buildKaraokeCues(words);
    for (const cue of cues) {
      const text = renderKaraokeText(cue, 'jump');
      const total = [...text.matchAll(/\{\\k(\d+)\}/g)].reduce(
        (sum, match) => sum + Number(match[1]),
        0,
      );
      const expected = Math.round(cue.endMs / 10) - Math.round(cue.startMs / 10);
      expect(total).toBe(expected);
    }
  });

  it('emits \\kf for sweep and \\k for jump', () => {
    const cue = buildKaraokeCues(words)[0];
    expect(cue).toBeDefined();
    if (cue === undefined) {
      return;
    }
    expect(renderKaraokeText(cue, 'sweep')).toContain('{\\kf');
    expect(renderKaraokeText(cue, 'jump')).toContain('{\\k');
    expect(renderKaraokeText(cue, 'jump')).not.toContain('{\\kf');
  });

  it('holds the highlight through an untimed gap instead of running ahead', () => {
    const gapped: WordTiming[] = [
      { word: 'first', startMs: 0, endMs: 400 },
      { word: 'second', startMs: 1400, endMs: 1800 },
    ];
    const cue = buildKaraokeCues(gapped)[0];
    expect(cue).toBeDefined();
    if (cue === undefined) {
      return;
    }
    const text = renderKaraokeText(cue, 'jump');
    // 40cs of word, 100cs of silence, 40cs of word.
    expect(text).toBe('{\\k40}first{\\k100} {\\k40}second');
  });

  it('renders a golden karaoke line', () => {
    const cues = buildKaraokeCues(words);
    const rendered = cues
      .map((cue) => `${cue.index} ${cue.startMs}-${cue.endMs}\n${renderKaraokeText(cue, 'sweep')}`)
      .join('\n\n');
    assertGolden('karaoke-lines.txt', `${rendered}\n`);
  });
});

describe('AC2: the full ASS document', () => {
  it('matches the golden document for a fully-featured kit', () => {
    const kit = BrandKitSchema.parse({
      ...DEFAULT_BRAND_KIT,
      id: 'golden',
      name: 'Golden kit',
      watermark: {
        kind: 'text',
        text: 'waggle',
        anchor: 'top-right',
        fontSizePct: 0.05,
        color: '#f5b301',
        outlineColor: '#101820',
        marginPct: 0.03,
        opacity: 0.9,
      },
      intro: {
        enabled: true,
        durationMs: 1200,
        backgroundColor: '#101820',
        title: 'Filter the dashboard',
        subtitle: 'A short walkthrough',
        titleColor: '#ffffff',
        subtitleColor: '#f5b301',
        titleSizePct: 0.11,
      },
      outro: {
        enabled: true,
        durationMs: 900,
        backgroundColor: '#101820',
        title: 'Try it yourself',
        subtitle: 'wagglereplay.dev',
        titleColor: '#ffffff',
        subtitleColor: '#f5b301',
        titleSizePct: 0.1,
      },
    });
    const timeline = buildTimeline(kit, 6000);
    const document = buildAssDocument({
      kit,
      preset: PRESET,
      timeline,
      words: makeWords('Open the dashboard and apply a filter to narrow the results.', 6000),
    });
    assertGolden('captions-full.ass', document.text);
    expect(document.cueCount).toBeGreaterThan(0);
  });

  it('shifts every caption by the intro duration', () => {
    const kit = BrandKitSchema.parse({
      ...DEFAULT_BRAND_KIT,
      intro: {
        enabled: true,
        durationMs: 2000,
        backgroundColor: '#101820',
        title: 'Title',
        subtitle: '',
        titleColor: '#ffffff',
        subtitleColor: '#f5b301',
        titleSizePct: 0.1,
      },
    });
    const words = makeWords('one two three four', 4000);
    const withIntro = buildAssDocument({
      kit,
      preset: PRESET,
      timeline: buildTimeline(kit, 4000),
      words,
    });
    // The first caption cue starts at 0ms of narration, so with a 2000ms
    // intro card it must be stamped at 0:00:02.00 on the timeline.
    const firstCue = withIntro.text
      .split('\n')
      .find((line) => line.startsWith('Dialogue:') && line.includes('WaggleCaption'));
    expect(firstCue).toBeDefined();
    expect(firstCue).toContain(',0:00:02.00,');
  });

  it('produces a document with no caption events when there is no narration', () => {
    const document = buildAssDocument({
      kit: DEFAULT_BRAND_KIT,
      preset: PRESET,
      timeline: buildTimeline(DEFAULT_BRAND_KIT, 4000),
      words: null,
    });
    expect(document.cueCount).toBe(0);
    expect(document.text).not.toContain('Dialogue:');
    // The style block still exists: a document without events is valid ASS.
    expect(document.text).toContain('Style: WaggleCaption');
  });
});
