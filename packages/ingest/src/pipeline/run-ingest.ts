import { latestIrVersion, type WalkthroughFlow, writeNextIrVersion } from '@waggle/ir';
import { IngestSessionError } from '../errors.js';
import { extractKeyframes } from '../frames/extract-keyframes.js';
import type { ExtractionPlanOptions } from '../frames/extraction-plan.js';
import { createRealFfmpegRunner, type FfmpegRunner } from '../frames/ffmpeg-runner.js';
import { aggregateHeatmap } from '../heatmap/aggregate.js';
import { writeHeatmap } from '../heatmap/write-heatmap.js';
import { runPreDraft } from '../predraft/run-predraft.js';
import type { FetchLike } from '../predraft/shared-http.js';
import { writePreDraft } from '../predraft/write-predraft.js';
import { segmentSession } from '../segment/segment-session.js';
import { copySourceRecording } from './copy-recording.js';
import { loadSession } from './session-io.js';

export interface RunIngestOptions {
  readonly projectDir: string;
  /** Directory holding a finished capture session: events.jsonl, meta.json, and the video file. */
  readonly sessionDir: string;
  /** Defaults to a real `ffmpeg` on PATH; injectable for tests. */
  readonly ffmpegRunner?: FfmpegRunner;
  readonly extractionOptions?: ExtractionPlanOptions;
  /** Defaults to `process.env`; injectable for tests (AC4). */
  readonly predraftEnv?: Readonly<Record<string, string | undefined>>;
  /** Defaults to real `fetch`; injectable for tests (AC4). */
  readonly predraftFetch?: FetchLike;
}

export interface RunIngestResult {
  readonly irVersion: number;
  readonly irFilePath: string;
  readonly heatmapFilePath: string;
  readonly predraftFilePath: string;
  /** Absolute path the source recording was copied to (see ./copy-recording.ts). */
  readonly recordingFilePath: string;
  readonly framesExtracted: number;
  readonly stepCount: number;
  readonly warnings: readonly string[];
}

/**
 * AC5: the full ingest pipeline. A finished capture session in
 * `sessionDir` becomes: one new immutable IR version (AC1, with `assets`
 * populated by AC2 and `sourceRecording.videoRef` repointed by this
 * function before it is ever written - the IR file is written exactly
 * once per run, since IR versions are immutable, so keyframe extraction
 * and the recording copy both have to happen BEFORE the write, not
 * after), `heatmap.json` (AC3), and `predraft.json` (AC4).
 *
 * The source recording itself is copied into the project directory
 * (`recordings/v{irVersion}/`, see ./copy-recording.ts) rather than left
 * in `sessionDir`: `@waggle/compose`'s `resolveSourceVideo` resolves
 * `sourceRecording.videoRef` as `path.resolve(projectDir, videoRef)`, so
 * a session-relative video is invisible to render - this is the fix for
 * the "IR points at a source recording that does not exist" defect.
 *
 * Idempotent given identical inputs (AC5): every stage
 * (segmentSession, extractKeyframes, aggregateHeatmap, and runPreDraft on
 * its no-key placeholder path) is a pure function of `sessionDir`'s
 * contents plus, for pre-drafting, whatever a live provider would return
 * - which is why this environment's idempotency proof
 * (test/pipeline/run-ingest.test.ts) runs with no provider configured:
 * that is the only path whose determinism ingest itself controls. See
 * this PRD's report for the exact hashes and the one assertion that would
 * need a live key to extend this proof to the real-provider path.
 */
export async function runIngest(options: RunIngestOptions): Promise<RunIngestResult> {
  const { events, meta, videoPath } = loadSession(options.sessionDir);
  const {
    flow,
    stepTimings,
    frameRedactions,
    warnings: segmentWarnings,
  } = segmentSession(events, meta);

  const targetIrVersion = (latestIrVersion(options.projectDir) ?? 0) + 1;

  const runner = options.ffmpegRunner ?? createRealFfmpegRunner();
  const { frames, assetsByStepIndex } = await extractKeyframes(
    runner,
    videoPath,
    options.projectDir,
    targetIrVersion,
    stepTimings,
    meta.video.durationMs,
    options.extractionOptions,
    frameRedactions,
  );

  const { videoRef, destPath: recordingFilePath } = copySourceRecording(
    videoPath,
    options.projectDir,
    targetIrVersion,
    meta.video.filename,
  );

  const flowWithAssets: WalkthroughFlow = {
    ...flow,
    waggle: {
      ...flow.waggle,
      sourceRecording: flow.waggle.sourceRecording
        ? { ...flow.waggle.sourceRecording, videoRef }
        : flow.waggle.sourceRecording,
    },
    steps: flow.steps.map((step, index) => {
      const assets = assetsByStepIndex.get(index);
      if (!assets) return step;
      return { ...step, waggle: { ...step.waggle, assets } };
    }),
  };

  const writeResult = writeNextIrVersion(options.projectDir, flowWithAssets);
  if (writeResult.version !== targetIrVersion) {
    // Only reachable if another process wrote a version concurrently
    // between the peek above and this write; writeNextIrVersion's own
    // 'wx' flag would already have refused a literal collision, so this
    // is a defensive invariant check, not the primary safety mechanism.
    throw new IngestSessionError(
      `internal error: expected to write IR version ${String(targetIrVersion)} but wrote ${String(writeResult.version)}.`,
    );
  }

  const heatmapDocument = aggregateHeatmap(stepTimings, meta.recordedViewport, writeResult.version);
  const heatmapFilePath = writeHeatmap(options.projectDir, heatmapDocument);

  const { document: predraftDocument, warnings: predraftWarnings } = await runPreDraft({
    flow: flowWithAssets,
    projectDir: options.projectDir,
    irVersion: writeResult.version,
    env: options.predraftEnv,
    fetchImpl: options.predraftFetch,
    verifiedImageRefs: new Set(frames.map((frame) => frame.projectRelativePath)),
  });
  const predraftFilePath = writePreDraft(options.projectDir, predraftDocument);

  return {
    irVersion: writeResult.version,
    irFilePath: writeResult.filePath,
    heatmapFilePath,
    predraftFilePath,
    recordingFilePath,
    framesExtracted: frames.length,
    stepCount: flowWithAssets.steps.length,
    warnings: [...segmentWarnings, ...predraftWarnings],
  };
}
