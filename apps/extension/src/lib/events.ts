import {
  DomDeltaSchema,
  POINTER_BUTTON_TYPES,
  RecordedViewportSchema,
  RectSchema,
  SettleSchema,
  StepElementSchema,
} from '@waggle/ir';
import { z } from 'zod';

/**
 * The raw capture event schema: the `events.jsonl` + `meta.json` contract
 * this extension emits (AC7), consumed next by prd-004's ingest step.
 *
 * This is deliberately NOT the Walkthrough IR itself (`@waggle/ir`'s
 * `WalkthroughFlowSchema`). The extension records a flat, time-ordered
 * stream of low-level browser events; ingest (prd-004) is the layer that
 * groups that stream into IR steps (a click plus its settle window plus
 * its route/state-change outcome becomes one `WalkthroughStep`). Building
 * that grouping here would duplicate ingest's own job and couple this
 * package to a schema owned two PRDs downstream.
 *
 * What this module DOES do is reuse `@waggle/ir`'s Waggle-extension shapes
 * (`RecordedViewport`, `Rect`, `StepElement`, `DomDelta`, `Settle`, the
 * pointer-button enum) wherever the raw event and the eventual IR step
 * describe the same thing, so ingest never has to reshape a field, only
 * regroup a stream. `epochMs` here is a true epoch (see ./epoch.ts); the
 * IR's own `t`/`ms` fields are relative to `flow.waggle.startEpochMs`
 * (../schema/waggle-extensions.ts), so ingest computes
 * `epochMs - meta.startEpochMs` when it lowers an event onto an IR step.
 */

export const CAPTURE_SCHEMA_VERSION = 1;

export const SELECTOR_KINDS = ['css', 'aria', 'text', 'xpath', 'pierce'] as const;
export type SelectorKind = (typeof SELECTOR_KINDS)[number];

/** One candidate selector, ordered by preference in the array that holds it. */
export const GeneratedSelectorSchema = z.strictObject({
  type: z.enum(SELECTOR_KINDS),
  value: z.union([
    z.string().min(1, 'selector value must not be empty'),
    z.array(z.string().min(1, 'selector chain entry must not be empty')).min(1),
  ]),
});
export type GeneratedSelector = z.infer<typeof GeneratedSelectorSchema>;

export const ScrollOffsetSchema = z.strictObject({ x: z.number(), y: z.number() });
export type ScrollOffset = z.infer<typeof ScrollOffsetSchema>;

export const MaskedInputSchema = z.strictObject({
  length: z.number().int().nonnegative(),
  masked: z.literal(true),
});

const baseEventShape = {
  /** Monotonic sequence number within the session, 0-based. */
  seq: z.number().int().nonnegative(),
  /** True epoch (ms since 1970-01-01), see ./epoch.ts. */
  epochMs: z.number().nonnegative(),
  tabId: z.number().int(),
} as const;

export const ClickEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('click'),
  x: z.number(),
  y: z.number(),
  offsetX: z.number(),
  offsetY: z.number(),
  button: z.enum(POINTER_BUTTON_TYPES),
  selectors: z.array(GeneratedSelectorSchema).min(1),
  element: StepElementSchema,
  viewport: RecordedViewportSchema,
  scroll: ScrollOffsetSchema,
});

export const PointerMoveEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('pointermove'),
  x: z.number(),
  y: z.number(),
});

export const ScrollEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('scroll'),
  x: z.number(),
  y: z.number(),
  selectors: z.array(GeneratedSelectorSchema).optional(),
});

export const InputEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('input'),
  inputType: z.string().min(1),
  selectors: z.array(GeneratedSelectorSchema).min(1),
  value: MaskedInputSchema,
  /** True when the recorder believes this field carries a secret (ADR-008). */
  credential: z.boolean(),
});

export const ROUTE_SOURCES = ['webNavigation', 'history', 'navigation-api'] as const;
export type RouteSource = (typeof ROUTE_SOURCES)[number];

export const RouteEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('route'),
  before: z.string(),
  after: z.string(),
  source: z.enum(ROUTE_SOURCES),
});

export const StateChangeEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('state-change'),
  domDelta: DomDeltaSchema,
});

export const SettleEventSchema = z.strictObject({
  ...baseEventShape,
  type: z.literal('settle'),
  settle: SettleSchema,
});

export const CaptureEventSchema = z.discriminatedUnion('type', [
  ClickEventSchema,
  PointerMoveEventSchema,
  ScrollEventSchema,
  InputEventSchema,
  RouteEventSchema,
  StateChangeEventSchema,
  SettleEventSchema,
]);

export type CaptureEvent = z.infer<typeof CaptureEventSchema>;
export type ClickEvent = z.infer<typeof ClickEventSchema>;
export type PointerMoveEvent = z.infer<typeof PointerMoveEventSchema>;
export type ScrollEvent = z.infer<typeof ScrollEventSchema>;
export type InputEvent = z.infer<typeof InputEventSchema>;
export type RouteEvent = z.infer<typeof RouteEventSchema>;
export type StateChangeEvent = z.infer<typeof StateChangeEventSchema>;
export type SettleEvent = z.infer<typeof SettleEventSchema>;

export const SessionVideoInfoSchema = z.strictObject({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  /** True epoch sampled at `MediaRecorder.onstart`: the video's frame-0 timestamp. */
  // Not `.int()`: this is `performance.timeOrigin + performance.now()`
  // (offscreen/recorder.ts's MediaRecorder.onstart handler), which is
  // sub-millisecond precision and legitimately fractional - unlike
  // `startEpochMs` above, which is `Date.now()` in the background service
  // worker and is always a whole millisecond.
  anchorEpochMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
});

export const SessionMetaSchema = z.strictObject({
  schemaVersion: z.literal(CAPTURE_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  /** The one absolute anchor for this session; every event's epochMs is >= this. */
  startEpochMs: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ message: 'generatedAt must be an ISO 8601 timestamp' }),
  tabId: z.number().int(),
  initialUrl: z.string().min(1),
  userAgent: z.string().min(1),
  recordedViewport: RecordedViewportSchema,
  video: SessionVideoInfoSchema,
  eventCount: z.number().int().nonnegative(),
  /** Set only by fixture-driven test/e2e runs; absent in real recordings. */
  fixtureVariant: z.string().optional(),
});

export type SessionMeta = z.infer<typeof SessionMetaSchema>;

/**
 * A `CaptureEvent` before the session envelope (`seq`, `tabId`) is filled
 * in. Defined as a distributive omit (rather than a bare `Omit<CaptureEvent,
 * ...>`) because `Omit` over a discriminated union otherwise collapses to
 * the shared-key subset and loses the `type` discriminant's literal types -
 * exactly the union `content-script.ts` and `session.ts` need to stay
 * intact so a `switch (event.type)` downstream still narrows correctly.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CaptureEventDraft = DistributiveOmit<CaptureEvent, 'seq' | 'tabId'>;
