import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { readCurrentIr, subdirPath } from '@waggle/ir';
import { assertShareableAudioAllowed } from '../guardrails/shareable-audio.js';
import {
  narrationScriptExists,
  readNarrationScript,
  writeNarrationScript,
} from '../script/script-io.js';
import { getApprovedSegmentTexts, type NarrationScript } from '../script/script-schema.js';
import { draftNarrationScript } from '../script/segmenter.js';
import { synthesizeChunked } from '../tts/chunked-synthesize.js';
import { ElevenLabsAdapter } from '../tts/elevenlabs/adapter.js';
import { mapOriginalTextToNormalizedTiming } from '../tts/elevenlabs/alignment-mapping.js';
import { createTtsAdapterFromEnv } from '../tts/provider-selection.js';
import type { TtsAdapter } from '../tts/types.js';
import { aggregateCharsToWords } from '../words/aggregate.js';
import {
  assertMonotonicWords,
  NARRATION_WORDS_SCHEMA_VERSION,
  type WordTiming,
} from '../words/schema.js';
import { writeSrt, writeTranscript, writeVtt, writeWordsJson } from '../words/writers.js';

/** Thrown when a project has no recorded IR to narrate yet. */
export class NoRecordingError extends Error {
  constructor(projectDir: string) {
    super(
      `"${projectDir}" has no recorded Walkthrough IR yet. Run "waggle record" first (prd-004).`,
    );
    this.name = 'NoRecordingError';
  }
}

/**
 * Thrown when `narration/script.json` was just drafted (or gained new
 * segments after a re-record) and is waiting on author approval. This is
 * the enforcement point for AC1's "author-approved text is the ONLY input
 * to TTS": `runNarration` never proceeds to synthesis on an unapproved
 * script, it stops here and tells the caller exactly what to review.
 */
export class NarrationDraftPendingApprovalError extends Error {
  readonly scriptPath: string;
  readonly pendingSegmentIds: readonly string[];

  constructor(scriptPath: string, pendingSegmentIds: readonly string[]) {
    super(
      `Narration script drafted at "${scriptPath}" with ${pendingSegmentIds.length} segment(s) awaiting approval: ${pendingSegmentIds.join(', ')}. ` +
        'Review and approve each segment (edit approvedText, set approved: true), then run "waggle narrate" again.',
    );
    this.name = 'NarrationDraftPendingApprovalError';
    this.scriptPath = scriptPath;
    this.pendingSegmentIds = pendingSegmentIds;
  }
}

/**
 * Reconciles a freshly-drafted script against one already on disk: existing
 * approvals are preserved by `narrationSegmentId`, and any step the IR now
 * has that the saved script does not (a re-record added steps) is appended
 * as a new, unapproved segment.
 */
function mergeNarrationScript(existing: NarrationScript, fresh: NarrationScript): NarrationScript {
  const existingById = new Map(
    existing.segments.map((segment) => [segment.narrationSegmentId, segment]),
  );
  const segments = fresh.segments.map(
    (freshSegment) => existingById.get(freshSegment.narrationSegmentId) ?? freshSegment,
  );
  return { schemaVersion: existing.schemaVersion, segments };
}

function loadOrDraftScript(projectDir: string, scriptPath: string): NarrationScript {
  const currentIr = readCurrentIr(projectDir);
  if (currentIr === null) {
    throw new NoRecordingError(projectDir);
  }

  const freshDraft = draftNarrationScript(currentIr.flow);

  if (!narrationScriptExists(scriptPath)) {
    writeNarrationScript(scriptPath, freshDraft);
    throw new NarrationDraftPendingApprovalError(
      scriptPath,
      freshDraft.segments.map((segment) => segment.narrationSegmentId),
    );
  }

  const existing = readNarrationScript(scriptPath);
  const merged = mergeNarrationScript(existing, freshDraft);
  const newlyAdded = merged.segments.filter((segment) => !segment.approved);
  if (newlyAdded.length > existing.segments.filter((segment) => !segment.approved).length) {
    // The merge introduced segments the author has not seen yet: persist
    // and stop, same as the first-draft case, rather than silently
    // synthesizing around a gap.
    writeNarrationScript(scriptPath, merged);
  }
  return merged;
}

function audioExtensionForMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) {
    return 'wav';
  }
  if (mimeType.includes('ogg')) {
    return 'ogg';
  }
  return 'mp3';
}

export interface RunNarrationOptions {
  readonly projectDir: string;
  /** Injected for tests / explicit provider choice; defaults to `createTtsAdapterFromEnv()`. */
  readonly adapter?: TtsAdapter;
  readonly env?: NodeJS.ProcessEnv;
  readonly voiceId?: string;
}

export interface RunNarrationResult {
  readonly scriptPath: string;
  readonly audioPath: string;
  readonly transcriptPath: string;
  /** `null` when the adapter's `capabilities.timestamps === 'none'` (AC5: Deepgram, xAI). */
  readonly wordsPath: string | null;
  readonly srtPath: string | null;
  readonly vttPath: string | null;
}

/**
 * AC6: the full narration pipeline `waggle narrate` wires up. Draft (or
 * load + merge) the script, gate on author approval, run the AC7
 * shareable-audio guardrail, synthesize through the chunk-stitching
 * entry point, aggregate word timings when the adapter supports them, and
 * write every deliverable the corpus lists: audio, `words.json`, SRT,
 * VTT, transcript.
 */
export async function runNarration(options: RunNarrationOptions): Promise<RunNarrationResult> {
  const env = options.env ?? process.env;
  const narrationDir = subdirPath(options.projectDir, 'narration');
  const scriptPath = path.join(narrationDir, 'script.json');

  const script = loadOrDraftScript(options.projectDir, scriptPath);
  const approvedTexts = getApprovedSegmentTexts(script);
  const fullText = approvedTexts.join(' ');

  const adapter = options.adapter ?? createTtsAdapterFromEnv(env);

  const planTier = adapter instanceof ElevenLabsAdapter ? await adapter.fetchAccountTier() : null;
  assertShareableAudioAllowed({
    provider: adapter.capabilities.provider,
    planTier,
    modelIsBeta: adapter.capabilities.beta,
    env,
  });

  const stitched = await synthesizeChunked(adapter, fullText, { voiceId: options.voiceId });

  const audioPath = path.join(
    narrationDir,
    `audio.${audioExtensionForMimeType(stitched.mimeType)}`,
  );
  writeFileSync(audioPath, stitched.audio);

  const transcriptPath = path.join(narrationDir, 'transcript.txt');
  writeTranscript(transcriptPath, approvedTexts);

  let wordsPath: string | null = null;
  let srtPath: string | null = null;
  let vttPath: string | null = null;

  if (adapter.capabilities.timestamps === 'char' && stitched.alignment !== null) {
    const words: WordTiming[] =
      stitched.normalizedAlignment !== null
        ? mapOriginalTextToNormalizedTiming(stitched.alignment, stitched.normalizedAlignment)
        : aggregateCharsToWords(stitched.alignment);
    assertMonotonicWords(words, stitched.durationMs);

    wordsPath = path.join(narrationDir, 'words.json');
    writeWordsJson(wordsPath, {
      schemaVersion: NARRATION_WORDS_SCHEMA_VERSION,
      provider: `${adapter.capabilities.provider}-tts`,
      sourceText: fullText,
      durationMs: stitched.durationMs,
      words,
    });

    srtPath = path.join(narrationDir, 'captions.srt');
    writeSrt(srtPath, words);

    vttPath = path.join(narrationDir, 'captions.vtt');
    writeVtt(vttPath, words);
  }

  return { scriptPath, audioPath, transcriptPath, wordsPath, srtPath, vttPath };
}
