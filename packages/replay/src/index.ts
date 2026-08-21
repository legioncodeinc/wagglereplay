/**
 * `@waggle/replay`: the Playwright replay engine (prd-009) plus the
 * credential resolution layer prd-010 anchors here.
 *
 * Governed by:
 *  - ADR-002, capture is CDP screencast piped to ffmpeg
 *  - ADR-011, non-responsive apps reframe from the 16:9 master viewport
 *  - ADR-014, everything runs locally; ADR-004's runner profiles inject
 *    the browser
 *  - ADR-008, credential VALUES resolve here and nowhere else
 *  - library/knowledge/private/waggle/replay-and-render.md
 */

export {
  CAPTURE_THREADS,
  SCREENCAST_QUALITY,
  ScreencastCapture,
  type ScreencastCaptureOptions,
  ScreencastError,
} from './capture/screencast.js';
export {
  buildReplayManifest,
  type FocusPoint,
  FocusPointSchema,
  type ReplayManifest,
  ReplayManifestSchema,
  type ReplayStepRecord,
} from './capture/timing-manifest.js';
export * from './credentials/index.js';
export {
  ANIMATION_KILL_CSS,
  ANIMATION_KILL_INIT_SCRIPT,
  ANIMATION_KILL_STYLE_ID,
  buildDeterminismInitScript,
} from './determinism/assets.js';
export {
  createDeterministicContext,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE_ID,
  type DeterminismOptions,
} from './determinism/context.js';
export {
  capturePresetFor,
  probeReflow,
  REFLOW_OVERFLOW_TOLERANCE_PX,
  type ReflowDecision,
  type ReflowProbeOptions,
  type ReflowProbeResult,
} from './presets/reflow-probe.js';
export {
  DEFAULT_REPLAY_PRESET_ID,
  REPLAY_PRESETS,
  type ReplayPreset,
  ReplayPresetError,
  resolveReplayPreset,
} from './presets/registry.js';
export {
  buildFocusTrack,
  FOCUS_EASE_MS,
  type FocusTrackOptions,
} from './reframe/focus-track.js';
export {
  CONCURRENCY_ENV_VAR,
  ConcurrencyError,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  parseConcurrency,
  runWithConcurrency,
} from './regen/concurrency.js';
export {
  RegenInputError,
  type RegenOptions,
  type RegenResult,
  resolveConfiguredPresets,
  runRegen,
} from './regen/orchestrate.js';
export {
  collectDriftNotes,
  type DriftNote,
  RUN_REPORT_DIR,
  RUN_REPORT_FILENAME,
  RUN_REPORT_SCHEMA_VERSION,
  type RunReport,
  type RunReportPreset,
  type RunReportStep,
  writeRunReport,
} from './report/run-report.js';
export * from './security/credential-scrub.js';
export {
  DEFAULT_CAPTURE_FPS,
  DEFAULT_MIN_STEP_DWELL_MS,
  DEFAULT_STEP_TIMEOUT_MS,
  REPLAY_MANIFEST_FILENAME,
  type ReplaySessionOptions,
  type ReplaySessionResult,
  runReplaySession,
  sessionStartUrl,
} from './session/replay-session.js';
export {
  type ActContext,
  type ActWithValue,
  actStep,
  type CustomStepHandler,
} from './steps/act.js';
export {
  executeStep,
  type SelectorUseRecord,
  type StepExecutionOptions,
  type StepExecutionResult,
} from './steps/replay-step.js';
export {
  hasKnownSelectorPrefix,
  type LocateOptions,
  type LocateSuccess,
  locateWithCascade,
  type SelectorAlternative,
  type SelectorCandidate,
  translateSelector,
} from './steps/selector-cascade.js';
export {
  REPLAY_SETTLE_SOURCES,
  type ReplaySettleSource,
  type SettleExclusion,
  type SettleOptions,
  type SettleOutcome,
  settleStep,
} from './steps/settle.js';
export {
  isStepFailure,
  STEP_FAILURE_PHASES,
  StepFailure,
  type StepFailureDetail,
  type StepFailurePhase,
} from './steps/step-failure.js';
