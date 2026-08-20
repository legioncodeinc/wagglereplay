import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NARRATION_WORDS_SCHEMA_VERSION,
  type WordTiming,
  WordTimingOrderError,
} from '../../src/words/schema.js';
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  renderSrt,
  renderTranscript,
  renderVtt,
  writeWordsJson,
} from '../../src/words/writers.js';

describe('formatSrtTimestamp / formatVttTimestamp', () => {
  it('renders zero as 00:00:00,000 / 00:00:00.000', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatVttTimestamp(0)).toBe('00:00:00.000');
  });

  it('uses a comma for SRT and a period for VTT (AC4)', () => {
    expect(formatSrtTimestamp(1234)).toBe('00:00:01,234');
    expect(formatVttTimestamp(1234)).toBe('00:00:01.234');
  });

  it('rolls over minutes and hours correctly', () => {
    // 1h 2m 3.456s = 3_723_456 ms
    expect(formatSrtTimestamp(3_723_456)).toBe('01:02:03,456');
  });
});

const sampleWords: WordTiming[] = [
  { word: 'Hello', startMs: 0, endMs: 400 },
  { word: 'world', startMs: 400, endMs: 900 },
];

describe('renderSrt / renderVtt', () => {
  it('renders an SRT document with comma decimals and 1-based cue numbers', () => {
    const srt = renderSrt(sampleWords);
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:00,900\nHello world');
  });

  it('renders a VTT document with a WEBVTT header and period decimals', () => {
    const vtt = renderVtt(sampleWords);
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
    expect(vtt).toContain('1\n00:00:00.000 --> 00:00:00.900\nHello world');
  });
});

describe('renderTranscript', () => {
  it('joins segments with a blank line between them', () => {
    expect(renderTranscript(['First segment.', 'Second segment.'])).toBe(
      'First segment.\n\nSecond segment.\n',
    );
  });
});

describe('writeWordsJson', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a valid document and round-trips it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-narrate-words-'));
    cleanupDirs.push(dir);
    const filePath = path.join(dir, 'words.json');

    writeWordsJson(filePath, {
      schemaVersion: NARRATION_WORDS_SCHEMA_VERSION,
      provider: 'elevenlabs-tts',
      sourceText: 'Hello world',
      durationMs: 900,
      words: sampleWords,
    });

    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    expect(parsed.provider).toBe('elevenlabs-tts');
    expect(parsed.words).toHaveLength(2);
  });

  it('refuses to write a document with out-of-order word timings', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-narrate-words-'));
    cleanupDirs.push(dir);
    const filePath = path.join(dir, 'words.json');

    expect(() =>
      writeWordsJson(filePath, {
        schemaVersion: NARRATION_WORDS_SCHEMA_VERSION,
        provider: 'elevenlabs-tts',
        sourceText: 'Hello world',
        durationMs: 900,
        words: [
          { word: 'Hello', startMs: 500, endMs: 900 },
          { word: 'world', startMs: 0, endMs: 400 },
        ],
      }),
    ).toThrow(WordTimingOrderError);
  });
});
