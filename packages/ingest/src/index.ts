/**
 * `@waggle/ingest`: the PRD-004 ingest pipeline.
 *
 * Turns a finished capture session (video, events.jsonl, meta.json - the
 * exact output of `apps/extension/src/lib/finalizer.ts`) into a
 * Walkthrough IR version (`@waggle/ir`) plus storyboard assets inside the
 * project directory: segmented steps (AC1), ffmpeg keyframes (AC2), a
 * per-route click heatmap (AC3), and AI pre-draft step descriptions
 * (AC4). `runIngest` (./pipeline/run-ingest.ts) is the AC5 entry point
 * `packages/cli`'s `record` command calls.
 */

export { FrameExtractionError, IngestSessionError } from './errors.js';
export {
  type ExtractedFrame,
  extractKeyframes,
  type KeyframeExtractionResult,
} from './frames/extract-keyframes.js';
export {
  buildExtractionPlan,
  DEFAULT_SAMPLE_INTERVAL_MS,
  DEFAULT_WINDOW_MS,
  type ExtractionPlanOptions,
  type FrameRequest,
  type FrameRole,
  type StepFramePlan,
  stepDirName,
} from './frames/extraction-plan.js';
// --- Keyframe extraction (AC2) ---------------------------------------------
export {
  createRealFfmpegRunner,
  type FfmpegRunner,
} from './frames/ffmpeg-runner.js';
export { aggregateHeatmap } from './heatmap/aggregate.js';
// --- Heatmap aggregation (AC3) ---------------------------------------------
export {
  HEATMAP_SCHEMA_VERSION,
  type HeatmapDocument,
  HeatmapDocumentSchema,
  type HeatmapPoint,
  HeatmapPointSchema,
  type RouteHeatmap,
  RouteHeatmapSchema,
} from './heatmap/schema.js';
export { HEATMAP_FILENAME, heatmapPath, writeHeatmap } from './heatmap/write-heatmap.js';
export { type RunIngestOptions, type RunIngestResult, runIngest } from './pipeline/run-ingest.js';
// --- Session I/O and the full pipeline (AC5) --------------------------------
export {
  EVENTS_FILENAME,
  type LoadedSession,
  loadSession,
  META_FILENAME,
} from './pipeline/session-io.js';
export {
  type PreDraftAdapter,
  type PreDraftImage,
  PreDraftParseError,
  PreDraftProviderError,
  type PreDraftRequest,
} from './predraft/adapter-types.js';
export {
  type AnthropicAdapterOptions,
  createAnthropicAdapter,
} from './predraft/anthropic-adapter.js';
export { createPreDraftAdapter } from './predraft/create-adapter.js';
export {
  DEFAULT_MODEL_BY_PROVIDER,
  type PreDraftProviderConfig,
  type PreDraftProviderName,
  type ResolvedPreDraftConfig,
  resolvePreDraftConfig,
} from './predraft/env-config.js';
export { createOpenAiAdapter, type OpenAiAdapterOptions } from './predraft/openai-adapter.js';
export { buildFailureEntry, buildPlaceholderEntry } from './predraft/placeholder.js';
export {
  buildPreDraftPrompt,
  PREDRAFT_SYSTEM_PROMPT,
  type PreDraftPromptInput,
} from './predraft/prompt.js';
export {
  type RunPreDraftOptions,
  type RunPreDraftResult,
  runPreDraft,
} from './predraft/run-predraft.js';
// --- AI pre-draft (AC4) -----------------------------------------------------
export {
  type ModelReply,
  ModelReplySchema,
  PREDRAFT_SCHEMA_VERSION,
  type PreDraftDocument,
  PreDraftDocumentSchema,
  type PreDraftEntry,
  PreDraftEntrySchema,
} from './predraft/schema.js';
export type { FetchLike } from './predraft/shared-http.js';
export {
  PREDRAFT_FILENAME,
  predraftPath,
  writePreDraft,
} from './predraft/write-predraft.js';
export { type BuildStepsResult, buildSteps } from './segment/build-steps.js';
export { type GroupingResult, groupEvents } from './segment/group-events.js';
// --- Segmentation (AC1) ----------------------------------------------------
export { type SegmentationResult, segmentSession } from './segment/segment-session.js';
export type { EventGroup, GroupOrOrphan, OrphanRoute, StepTiming } from './segment/types.js';
