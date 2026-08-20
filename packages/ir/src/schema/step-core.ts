import { z } from 'zod';

/**
 * The step core: a faithful zod encoding of the Puppeteer Replay /
 * Chrome DevTools Recorder user-flow schema.
 *
 * ADR-001 makes the Walkthrough IR a strict SUPERSET of this schema, so
 * this module is deliberately a mirror of
 * https://github.com/puppeteer/replay/blob/main/src/Schema.ts and of the
 * runtime checks in `@puppeteer/replay`'s own `parse()` / `parseStep()`.
 * Nothing Waggle-specific belongs here; the additive Waggle keys live in
 * ./waggle-extensions.ts and are composed in ./flow.ts.
 *
 * Two deliberate tightenings over the upstream runtime parser, both of
 * which only reject inputs the Recorder never emits and which no replay
 * engine could act on:
 *
 *  1. Selector strings and selector-chain entries must be non-empty. An
 *     empty selector cannot select an element, so accepting it would only
 *     defer the failure to replay time (prd-009).
 *  2. Unknown keys are rejected rather than silently dropped. The IR is an
 *     immutable, git-committed artifact (ADR-015); silently discarding a
 *     field on the way through the version writer would lose user data
 *     with no diff to show for it. A rejected key names its own JSON path.
 */

/**
 * `@puppeteer/replay` enforces `1 <= timeout <= 30000` in `validTimeout()`
 * for both the flow-level and the step-level timeout. Mirrored exactly.
 */
export const MIN_TIMEOUT_MS = 1;
export const MAX_TIMEOUT_MS = 30_000;

export const TimeoutSchema = z
  .number()
  .min(MIN_TIMEOUT_MS, `timeout must be at least ${MIN_TIMEOUT_MS}ms`)
  .max(MAX_TIMEOUT_MS, `timeout must be at most ${MAX_TIMEOUT_MS}ms`);

/** Upstream `SelectorType`. Retained for consumers that classify selectors. */
export const SELECTOR_TYPES = ['css', 'aria', 'text', 'xpath', 'pierce'] as const;
export type SelectorType = (typeof SELECTOR_TYPES)[number];

/** Upstream `StepType`. */
export const STEP_TYPES = [
  'change',
  'click',
  'close',
  'customStep',
  'doubleClick',
  'emulateNetworkConditions',
  'hover',
  'keyDown',
  'keyUp',
  'navigate',
  'scroll',
  'setViewport',
  'waitForElement',
  'waitForExpression',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const POINTER_DEVICE_TYPES = ['mouse', 'pen', 'touch'] as const;
export const POINTER_BUTTON_TYPES = [
  'primary',
  'auxiliary',
  'secondary',
  'back',
  'forward',
] as const;

/**
 * A single alternative selector. A bare string points straight at the
 * target element; an array is a chain whose last entry is the target and
 * whose earlier entries are ancestors (shadow-root aware upstream).
 */
export const SelectorSchema = z.union([
  z.string().min(1, 'selector must not be an empty string'),
  z
    .array(z.string().min(1, 'selector chain entry must not be an empty string'))
    .min(1, 'selector chain must contain at least one entry'),
]);

export const SelectorsSchema = z
  .array(SelectorSchema)
  .min(1, 'selectors must contain at least one alternative selector');

export const NavigationAssertedEventSchema = z.strictObject({
  type: z.literal('navigation'),
  url: z.string().optional(),
  title: z.string().optional(),
});

export const AssertedEventSchema = NavigationAssertedEventSchema;

/** Fields every step may carry (upstream `BaseStep`). */
const baseShape = {
  timeout: TimeoutSchema.optional(),
  assertedEvents: z.array(AssertedEventSchema).optional(),
} as const;

/** Upstream `StepWithTarget`: `target` defaults to the main target. */
const targetShape = {
  ...baseShape,
  target: z.string().min(1, 'target must not be an empty string').optional(),
} as const;

/** Upstream `StepWithFrame`: `frame` is an index path into nested frames. */
const frameShape = {
  ...targetShape,
  frame: z.array(z.number().int().nonnegative('frame index must not be negative')).optional(),
} as const;

/** Upstream `StepWithSelectors`. */
const selectorsShape = {
  ...frameShape,
  selectors: SelectorsSchema,
} as const;

/** Upstream `ClickAttributes`. `offsetX` and `offsetY` are required. */
const clickAttributesShape = {
  deviceType: z.enum(POINTER_DEVICE_TYPES).optional(),
  button: z.enum(POINTER_BUTTON_TYPES).optional(),
  offsetX: z.number(),
  offsetY: z.number(),
  duration: z.number().nonnegative('duration must not be negative').optional(),
} as const;

export const ClickStepCoreSchema = z.strictObject({
  type: z.literal('click'),
  ...selectorsShape,
  ...clickAttributesShape,
});

export const DoubleClickStepCoreSchema = z.strictObject({
  type: z.literal('doubleClick'),
  ...selectorsShape,
  ...clickAttributesShape,
});

export const HoverStepCoreSchema = z.strictObject({
  type: z.literal('hover'),
  ...selectorsShape,
});

export const ChangeStepCoreSchema = z.strictObject({
  type: z.literal('change'),
  ...selectorsShape,
  value: z.string(),
});

export const CloseStepCoreSchema = z.strictObject({
  type: z.literal('close'),
  ...targetShape,
});

export const CustomStepCoreSchema = z.strictObject({
  type: z.literal('customStep'),
  ...frameShape,
  name: z.string().min(1, 'customStep name must not be empty'),
  parameters: z.unknown().optional(),
});

export const EmulateNetworkConditionsStepCoreSchema = z.strictObject({
  type: z.literal('emulateNetworkConditions'),
  ...targetShape,
  download: z.number().nonnegative('download throughput must not be negative'),
  upload: z.number().nonnegative('upload throughput must not be negative'),
  latency: z.number().nonnegative('latency must not be negative'),
});

export const KeyDownStepCoreSchema = z.strictObject({
  type: z.literal('keyDown'),
  ...targetShape,
  key: z.string().min(1, 'key must not be empty'),
});

export const KeyUpStepCoreSchema = z.strictObject({
  type: z.literal('keyUp'),
  ...targetShape,
  key: z.string().min(1, 'key must not be empty'),
});

export const NavigateStepCoreSchema = z.strictObject({
  type: z.literal('navigate'),
  ...targetShape,
  url: z.string().min(1, 'url must not be empty'),
});

export const ScrollStepCoreSchema = z.strictObject({
  type: z.literal('scroll'),
  ...frameShape,
  selectors: SelectorsSchema.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const SetViewportStepCoreSchema = z.strictObject({
  type: z.literal('setViewport'),
  ...targetShape,
  width: z.number().int().positive('viewport width must be a positive integer'),
  height: z.number().int().positive('viewport height must be a positive integer'),
  deviceScaleFactor: z.number().positive('deviceScaleFactor must be greater than zero'),
  isMobile: z.boolean(),
  hasTouch: z.boolean(),
  isLandscape: z.boolean(),
});

export const WaitForElementStepCoreSchema = z.strictObject({
  type: z.literal('waitForElement'),
  ...selectorsShape,
  operator: z.enum(['>=', '==', '<=']).optional(),
  count: z.number().int().nonnegative('count must not be negative').optional(),
  visible: z.boolean().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
});

export const WaitForExpressionStepCoreSchema = z.strictObject({
  type: z.literal('waitForExpression'),
  ...frameShape,
  expression: z.string().min(1, 'expression must not be empty'),
});

/**
 * The full upstream step union. A bare Chrome Recorder step validates
 * against this and only this; the Waggle keys are added in ./flow.ts.
 */
export const StepCoreSchema = z.discriminatedUnion('type', [
  ChangeStepCoreSchema,
  ClickStepCoreSchema,
  CloseStepCoreSchema,
  CustomStepCoreSchema,
  DoubleClickStepCoreSchema,
  EmulateNetworkConditionsStepCoreSchema,
  HoverStepCoreSchema,
  KeyDownStepCoreSchema,
  KeyUpStepCoreSchema,
  NavigateStepCoreSchema,
  ScrollStepCoreSchema,
  SetViewportStepCoreSchema,
  WaitForElementStepCoreSchema,
  WaitForExpressionStepCoreSchema,
]);

export type StepCore = z.infer<typeof StepCoreSchema>;

/**
 * The upstream `UserFlow`. This is exactly what `exportToPuppeteerReplay()`
 * produces and what `@puppeteer/replay`'s `parse()` consumes.
 */
export const UserFlowCoreSchema = z.strictObject({
  title: z.string().min(1, 'title must not be empty'),
  timeout: TimeoutSchema.optional(),
  selectorAttribute: z.string().min(1, 'selectorAttribute must not be empty').optional(),
  steps: z.array(StepCoreSchema),
});

export type UserFlowCore = z.infer<typeof UserFlowCoreSchema>;
