import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StepAssets } from '@waggle/ir';
import { subdirPath } from '@waggle/ir';
import type { StepTiming } from '../segment/types.js';
import {
  buildExtractionPlan,
  type ExtractionPlanOptions,
  type StepFramePlan,
} from './extraction-plan.js';
import type { FfmpegRunner } from './ffmpeg-runner.js';
import {
  activeFrameRedactions,
  buildRedactionFilter,
  type FrameRedaction,
  validateFrameRedactions,
} from './redaction.js';

/** Renders a millisecond offset as the `-ss` argument ffmpeg expects: seconds with millisecond precision. */
function toSeekArg(relMs: number): string {
  return (relMs / 1000).toFixed(3);
}

/**
 * One extracted frame's plan plus the exact argv used to produce it, for
 * callers (packages/ingest/src/pipeline/run-ingest.ts, and this report's
 * "ffmpeg command lines actually run") that want to show their work.
 */
export interface ExtractedFrame {
  readonly stepIndex: number;
  readonly role: StepFramePlan['requests'][number]['role'];
  readonly relMs: number;
  readonly absolutePath: string;
  readonly projectRelativePath: string;
  readonly argv: readonly string[];
}

export interface KeyframeExtractionResult {
  readonly frames: readonly ExtractedFrame[];
  /** Project-relative `assets` paths per step index, ready to merge into `step.waggle.assets`. */
  readonly assetsByStepIndex: ReadonlyMap<number, StepAssets>;
}

/**
 * AC2: shells out to ffmpeg once per requested frame (see
 * ./extraction-plan.ts for how the requests are computed), accurate-seek
 * form (`-i` before `-ss`) rather than fast-seek, because these are short
 * recordings decoded once at ingest time, not a hot path, and frame
 * accuracy matters more than shave-a-few-ms speed for a storyboard.
 *
 * `-y` overwrites without prompting (ingest already refuses to run twice
 * over the same IR version at the pipeline level - see
 * ../pipeline/run-ingest.ts - so an existing file here means a genuinely
 * repeated extraction of the identical plan, which should just succeed
 * with the identical bytes, not hang waiting on a TTY prompt that does
 * not exist in this process).
 */
export async function extractKeyframes(
  runner: FfmpegRunner,
  videoPath: string,
  projectDir: string,
  irVersion: number,
  stepTimings: readonly StepTiming[],
  durationMs: number,
  options: ExtractionPlanOptions = {},
  frameRedactions: readonly FrameRedaction[] = [],
): Promise<KeyframeExtractionResult> {
  const validatedRedactions = validateFrameRedactions(frameRedactions);
  const plans = buildExtractionPlan(stepTimings, durationMs, options);
  const stepsRoot = subdirPath(projectDir, 'steps');
  const versionRoot = path.join(stepsRoot, `v${String(irVersion)}`);

  const frames: ExtractedFrame[] = [];
  const assetsByStepIndex = new Map<number, StepAssets>();

  for (const plan of plans) {
    const stepDir = path.join(versionRoot, plan.dirName);
    await mkdir(stepDir, { recursive: true });

    const assets: { before?: string; click?: string; settled?: string } = {};

    for (const request of plan.requests) {
      const absolutePath = path.join(stepDir, request.fileName);
      const projectRelativePath = path.relative(projectDir, absolutePath).split(path.sep).join('/');
      const filter = buildRedactionFilter(
        activeFrameRedactions(validatedRedactions, request.relMs),
      );
      const argv = [
        '-y',
        '-i',
        videoPath,
        '-ss',
        toSeekArg(request.relMs),
        ...(filter === null ? [] : ['-vf', filter]),
        '-frames:v',
        '1',
        absolutePath,
      ];

      await runner(argv);

      frames.push({
        stepIndex: plan.stepIndex,
        role: request.role,
        relMs: request.relMs,
        absolutePath,
        projectRelativePath,
        argv,
      });

      if (request.role === 'before') assets.before = projectRelativePath;
      if (request.role === 'click') assets.click = projectRelativePath;
      if (request.role === 'settled') assets.settled = projectRelativePath;
    }

    assetsByStepIndex.set(plan.stepIndex, assets);
  }

  return { frames, assetsByStepIndex };
}
