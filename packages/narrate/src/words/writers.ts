import { writeFileSync } from 'node:fs';
import { buildCaptionCues, type CaptionCue } from './captions.js';
import {
  assertMonotonicWords,
  type NarrationWordsDocument,
  NarrationWordsDocumentSchema,
  type WordTiming,
} from './schema.js';

/** Serializes a JSON document the way every Waggle project file is written (matches @waggle/ir). */
function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Writes `words.json`, the shared contract both prd-007 and prd-013
 * consume (see ./schema.ts). Re-validates and re-checks monotonicity right
 * before writing so a bug anywhere upstream in either pipeline fails loud
 * here rather than producing a document a downstream consumer silently
 * mis-times.
 */
export function writeWordsJson(filePath: string, document: NarrationWordsDocument): void {
  const validated = NarrationWordsDocumentSchema.parse(document);
  assertMonotonicWords(validated.words, validated.durationMs);
  writeFileSync(filePath, serializeJson(validated), 'utf8');
}

function padStart(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** `HH:MM:SS,mmm` — SRT's comma decimal separator (AC4). */
export function formatSrtTimestamp(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  return `${padStart(hours, 2)}:${padStart(minutes, 2)}:${padStart(seconds, 2)},${padStart(millis, 3)}`;
}

/** `HH:MM:SS.mmm` — VTT's period decimal separator (AC4). */
export function formatVttTimestamp(ms: number): string {
  return formatSrtTimestamp(ms).replace(',', '.');
}

function cuesFromWords(words: readonly WordTiming[]): CaptionCue[] {
  return buildCaptionCues(words);
}

/** Renders caption cues as an SRT document (comma decimal separator). */
export function renderSrt(words: readonly WordTiming[]): string {
  const cues = cuesFromWords(words);
  return `${cues
    .map(
      (cue) =>
        `${cue.index}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.lines.join('\n')}`,
    )
    .join('\n\n')}\n`;
}

/** Renders caption cues as a WebVTT document (period decimal separator, `WEBVTT` header). */
export function renderVtt(words: readonly WordTiming[]): string {
  const cues = cuesFromWords(words);
  const body = cues
    .map(
      (cue) =>
        `${cue.index}\n${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}\n${cue.lines.join('\n')}`,
    )
    .join('\n\n');
  return `WEBVTT\n\n${body}\n`;
}

export function writeSrt(filePath: string, words: readonly WordTiming[]): void {
  writeFileSync(filePath, renderSrt(words), 'utf8');
}

export function writeVtt(filePath: string, words: readonly WordTiming[]): void {
  writeFileSync(filePath, renderVtt(words), 'utf8');
}

/** Plain-text transcript: the full author-approved narration, one paragraph per segment. */
export function renderTranscript(segments: readonly string[]): string {
  return `${segments.map((segment) => segment.trim()).join('\n\n')}\n`;
}

export function writeTranscript(filePath: string, segments: readonly string[]): void {
  writeFileSync(filePath, renderTranscript(segments), 'utf8');
}
