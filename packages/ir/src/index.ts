// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `@waggle/ir`: the Walkthrough IR.
 *
 * This package is the workspace's lowest layer and the only definition of
 * what a walkthrough IS. Everything downstream (the recorder ingest in
 * prd-004, Studio in prd-005, narration in prd-006, replay in prd-009,
 * composition in prd-007, and the CLI) consumes this module and nothing
 * else for schema, validation, versioning, import, export, and coordinate
 * projection.
 *
 * Governed by:
 *  - ADR-001, the IR is a strict superset of the Puppeteer Replay schema
 *  - ADR-015, the project directory is the datastore and IR versions are
 *    immutable files
 *  - library/knowledge/private/waggle/walkthrough-ir-and-project-format.md
 */

export type { NormalizedPoint, Point, ViewportSize } from './coords/projection.js';
// --- Coordinate projection (AC6) ------------------------------------------
export {
  fromNormalized,
  ProjectionError,
  projectPoint,
  projectPoints,
  toNormalized,
  viewportSize,
} from './coords/projection.js';
// --- Puppeteer Replay export (AC5) ----------------------------------------
export { exportToPuppeteerReplay } from './export/puppeteer-replay.js';
export type { ChromeRecorderImportOptions } from './import/chrome-recorder.js';
// --- Chrome Recorder import (AC3) -----------------------------------------
export {
  classifyRecorderStep,
  DEFAULT_RECORDED_VIEWPORT,
  importChromeRecorderFlow,
} from './import/chrome-recorder.js';
export {
  createProjectTextScrubber,
  flaggedPlaceholders,
  ProjectTextScrubberConfigError,
  projectCredentialEnvNames,
} from './privacy/project-literals.js';
export type {
  SensitiveTextLiterals,
  SensitiveTextScrubber,
  SensitiveTextScrubberOptions,
} from './privacy/scrub.js';
export {
  createSensitiveTextScrubber,
  DEFAULT_SCRUB_REPLACEMENT,
  scrubSensitiveText,
} from './privacy/scrub.js';
export type {
  CredentialAppliesTo,
  CredentialSet,
  CredentialsFile,
} from './project/credentials.js';
// --- Credentials file schema (ADR-008, prd-010) ---------------------------
// Reference-only by construction: every field is an id, a label, or an
// env-var NAME. The value-resolution side lives in @waggle/replay and
// nowhere else.
export {
  CREDENTIALS_SCHEMA_VERSION,
  CredentialAppliesToSchema,
  CredentialSetSchema,
  CredentialsFileSchema,
  exampleCredentialSet,
} from './project/credentials.js';
export type { ProjectSubdir } from './project/layout.js';
// --- Project layout and manifest (ADR-015) --------------------------------
// These live here rather than in @waggle/cli because the version writer
// owns the manifest's currentIrVersion pointer; @waggle/cli re-exports them
// so there is exactly one definition of the project shape in the workspace.
export {
  CREDENTIALS_FILENAME,
  credentialsPath,
  FIRST_IR_VERSION,
  GITIGNORE_FILENAME,
  gitignorePath,
  MANIFEST_FILENAME,
  manifestPath,
  PROJECT_SUBDIRS,
  parseWalkthroughVersion,
  subdirPath,
  TRACKED_EMPTY_SUBDIRS,
  WALKTHROUGH_FILENAME_PATTERN,
  walkthroughFilename,
  walkthroughPath,
} from './project/layout.js';
export type { WaggleManifest } from './project/manifest.js';
export {
  createDefaultManifest,
  WAGGLE_MANIFEST_SCHEMA_VERSION,
  WaggleManifestSchema,
} from './project/manifest.js';
export type { WalkthroughFlow, WalkthroughStep } from './schema/flow.js';
// --- Schema: the composed Walkthrough IR flow -----------------------------
export {
  ChangeStepSchema,
  ClickStepSchema,
  CloseStepSchema,
  CustomStepSchema,
  DoubleClickStepSchema,
  EmulateNetworkConditionsStepSchema,
  HoverStepSchema,
  KeyDownStepSchema,
  KeyUpStepSchema,
  NavigateStepSchema,
  ScrollStepSchema,
  SetViewportStepSchema,
  WaitForElementStepSchema,
  WaitForExpressionStepSchema,
  WalkthroughFlowSchema,
  WalkthroughStepSchema,
} from './schema/flow.js';
export type { SelectorType, StepCore, StepType, UserFlowCore } from './schema/step-core.js';
// --- Schema: the Puppeteer Replay step core (ADR-001) ---------------------
export {
  AssertedEventSchema,
  ChangeStepCoreSchema,
  ClickStepCoreSchema,
  CloseStepCoreSchema,
  CustomStepCoreSchema,
  DoubleClickStepCoreSchema,
  EmulateNetworkConditionsStepCoreSchema,
  HoverStepCoreSchema,
  KeyDownStepCoreSchema,
  KeyUpStepCoreSchema,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  NavigateStepCoreSchema,
  NavigationAssertedEventSchema,
  POINTER_BUTTON_TYPES,
  POINTER_DEVICE_TYPES,
  ScrollStepCoreSchema,
  SELECTOR_TYPES,
  SelectorSchema,
  SelectorsSchema,
  SetViewportStepCoreSchema,
  STEP_TYPES,
  StepCoreSchema,
  TimeoutSchema,
  UserFlowCoreSchema,
  WaitForElementStepCoreSchema,
  WaitForExpressionStepCoreSchema,
} from './schema/step-core.js';
export type {
  CursorClick,
  CursorSample,
  DomDelta,
  RecordedViewport,
  Rect,
  Settle,
  StepAssets,
  StepClassification,
  StepElement,
  WaggleFlowExtension,
  WaggleStepExtension,
} from './schema/waggle-extensions.js';
// --- Schema: the Waggle extension keys (ADR-001) --------------------------
export {
  AriaChangeSchema,
  CursorClickSchema,
  CursorSampleSchema,
  DomDeltaSchema,
  DurationMsSchema,
  RecordedViewportSchema,
  RectSchema,
  RelativeTimeMsSchema,
  SETTLE_SOURCES,
  SettleSchema,
  SourceRecordingSchema,
  STEP_CLASSIFICATIONS,
  StepAssetsSchema,
  StepClassificationSchema,
  StepElementSchema,
  WAGGLE_IR_SCHEMA_VERSION,
  WaggleFlowExtensionSchema,
  WaggleStepExtensionSchema,
} from './schema/waggle-extensions.js';
export type { IrValidationIssue, IrValidationResult } from './validate.js';
// --- Validation (AC2) ------------------------------------------------------
export {
  assertUserFlowCore,
  assertWalkthroughFlow,
  formatIssuePath,
  IrValidationError,
  validateUserFlowCore,
  validateWalkthroughFlow,
} from './validate.js';
export type { IrWriteResult } from './version/writer.js';
// --- Immutable version writer (AC4) ---------------------------------------
export {
  IrWriteError,
  latestIrVersion,
  listIrVersions,
  readCurrentIr,
  readIrVersion,
  writeNextIrVersion,
} from './version/writer.js';
