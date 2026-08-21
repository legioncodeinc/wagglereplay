import { z } from 'zod';

/**
 * The Waggle extension keys: everything ADR-001 adds on top of the
 * Puppeteer Replay step core.
 *
 * These live under a single `waggle` key at both the flow level and the
 * step level, exactly as specified in
 * library/knowledge/private/waggle/walkthrough-ir-and-project-format.md.
 * Keeping them namespaced under one key is what makes the export in
 * ../export/puppeteer-replay.ts a single `delete`, and what keeps a bare
 * Chrome Recorder import (../import/chrome-recorder.ts) a pure addition
 * rather than a rewrite.
 *
 * Time convention (corpus, "Numbering and time"): every `t` / `ms` value is
 * milliseconds RELATIVE to `flow.waggle.startEpochMs`, which is itself the
 * only absolute epoch value in the document. Relative times are therefore
 * non-negative, and a negative one is a recorder bug, not a valid input.
 */

/** Bumped when a breaking change lands in the Waggle extension shape. */
export const WAGGLE_IR_SCHEMA_VERSION = 1;

/** Milliseconds since `flow.waggle.startEpochMs`. Never negative. */
export const RelativeTimeMsSchema = z
  .number()
  .nonnegative('time must not be negative (times are relative to flow.waggle.startEpochMs)');

/** A duration in milliseconds. Never negative. */
export const DurationMsSchema = z.number().nonnegative('duration must not be negative');

/**
 * The viewport the walkthrough was recorded at. Required on every Waggle
 * flow: without it, recorded-viewport pixels cannot be normalized and no
 * preset re-projection (../coords/projection.ts) is possible.
 */
export const RecordedViewportSchema = z.strictObject({
  w: z.number().int().positive('recorded viewport width must be a positive integer'),
  h: z.number().int().positive('recorded viewport height must be a positive integer'),
  dpr: z.number().positive('devicePixelRatio must be greater than zero'),
});

export type RecordedViewport = z.infer<typeof RecordedViewportSchema>;

/** One sampled cursor position on the raw pointer trail. */
export const CursorSampleSchema = z.strictObject({
  t: RelativeTimeMsSchema,
  x: z.number(),
  y: z.number(),
});

export type CursorSample = z.infer<typeof CursorSampleSchema>;

/** One pointer transition. `down` is true for press, false for release. */
export const CursorClickSchema = z.strictObject({
  t: RelativeTimeMsSchema,
  x: z.number(),
  y: z.number(),
  down: z.boolean(),
});

export type CursorClick = z.infer<typeof CursorClickSchema>;

/** Where the original screen recording lives, if one was kept. */
export const SourceRecordingSchema = z.strictObject({
  videoRef: z.string().min(1, 'videoRef must not be empty'),
  durationMs: DurationMsSchema,
});

export const WaggleFlowExtensionSchema = z.strictObject({
  schemaVersion: z.literal(WAGGLE_IR_SCHEMA_VERSION),
  recordedViewport: RecordedViewportSchema,
  userAgent: z.string().min(1, 'userAgent must not be empty').optional(),
  /** The one absolute wall-clock anchor in the document. */
  startEpochMs: z.number().int().nonnegative('startEpochMs must not be negative'),
  cursorTrail: z.array(CursorSampleSchema),
  clicks: z.array(CursorClickSchema),
  sourceRecording: SourceRecordingSchema.optional(),
});

export type WaggleFlowExtension = z.infer<typeof WaggleFlowExtensionSchema>;

/** How a step reads in the storyboard. Drives narration and replay pacing. */
export const STEP_CLASSIFICATIONS = ['navigate', 'state-change', 'input', 'scroll'] as const;
export type StepClassification = (typeof STEP_CLASSIFICATIONS)[number];

export const StepClassificationSchema = z.enum(STEP_CLASSIFICATIONS);

/** A CSS-pixel rectangle in recorded-viewport coordinates. */
export const RectSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative('rect width must not be negative'),
  h: z.number().nonnegative('rect height must not be negative'),
});

export type Rect = z.infer<typeof RectSchema>;

/** One accessibility-tree change observed across a step. */
export const AriaChangeSchema = z.strictObject({
  role: z.string().min(1, 'aria change role must not be empty'),
  name: z.string(),
  change: z.enum(['added', 'removed', 'updated']),
});

/**
 * What visibly changed during a `state-change` step. `summary` is the
 * human-readable line the narration writer (prd-006) starts from.
 */
export const DomDeltaSchema = z.strictObject({
  summary: z.string().min(1, 'domDelta summary must not be empty'),
  ariaChanges: z.array(AriaChangeSchema),
  rectDelta: RectSchema.optional(),
});

export type DomDelta = z.infer<typeof DomDeltaSchema>;

/** Which signal told the recorder the page had settled, and how long it took. */
export const SETTLE_SOURCES = [
  'network-idle',
  'mutation-quiet',
  'animation-end',
  'timeout',
] as const;

export const SettleSchema = z.strictObject({
  source: z.enum(SETTLE_SOURCES),
  ms: DurationMsSchema,
});

export type Settle = z.infer<typeof SettleSchema>;

/** The accessible identity of the element the step acted on. */
export const StepElementSchema = z.strictObject({
  role: z.string().min(1, 'element role must not be empty'),
  name: z.string(),
  text: z.string().optional(),
  rect: RectSchema,
});

export type StepElement = z.infer<typeof StepElementSchema>;

/** Frame assets captured around the step, as project-relative paths. */
export const StepAssetsSchema = z.strictObject({
  before: z.string().min(1, 'asset ref must not be empty').optional(),
  click: z.string().min(1, 'asset ref must not be empty').optional(),
  settled: z.string().min(1, 'asset ref must not be empty').optional(),
});

export type StepAssets = z.infer<typeof StepAssetsSchema>;

export const WaggleStepExtensionSchema = z.strictObject({
  classification: StepClassificationSchema,
  routeBefore: z.string().min(1, 'routeBefore must not be empty').optional(),
  routeAfter: z.string().min(1, 'routeAfter must not be empty').optional(),
  domDelta: DomDeltaSchema.optional(),
  settle: SettleSchema.optional(),
  element: StepElementSchema.optional(),
  narrationSegmentId: z.string().min(1, 'narrationSegmentId must not be empty').optional(),
  assets: StepAssetsSchema.optional(),
  /** True when the frame assets for this step were privacy-masked (ADR-008). */
  masked: z.boolean(),
});

export type WaggleStepExtension = z.infer<typeof WaggleStepExtensionSchema>;
