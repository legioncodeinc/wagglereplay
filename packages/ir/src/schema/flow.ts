import { z } from 'zod';
import {
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
  TimeoutSchema,
  WaitForElementStepCoreSchema,
  WaitForExpressionStepCoreSchema,
} from './step-core.js';
import { WaggleFlowExtensionSchema, WaggleStepExtensionSchema } from './waggle-extensions.js';

/**
 * The Walkthrough IR: the Puppeteer Replay step core plus the Waggle
 * extension key, composed exactly as ADR-001 specifies.
 *
 * Each step variant is its core variant `.extend`ed with a required
 * `waggle` key. Composing rather than redeclaring is what makes "strict
 * superset" a property of the code and not just of the prose: adding a
 * field to a core step schema automatically reaches the IR variant, and
 * there is no second copy of the upstream shape to drift.
 *
 * `waggle` is REQUIRED on every IR step. A bare Chrome Recorder export has
 * no `waggle` keys, which is why it is imported through
 * ../import/chrome-recorder.ts (which defaults them) rather than parsed
 * directly as an IR flow.
 */

export const ChangeStepSchema = ChangeStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const ClickStepSchema = ClickStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const CloseStepSchema = CloseStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const CustomStepSchema = CustomStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const DoubleClickStepSchema = DoubleClickStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const EmulateNetworkConditionsStepSchema = EmulateNetworkConditionsStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const HoverStepSchema = HoverStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const KeyDownStepSchema = KeyDownStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const KeyUpStepSchema = KeyUpStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const NavigateStepSchema = NavigateStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const ScrollStepSchema = ScrollStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const SetViewportStepSchema = SetViewportStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const WaitForElementStepSchema = WaitForElementStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});
export const WaitForExpressionStepSchema = WaitForExpressionStepCoreSchema.extend({
  waggle: WaggleStepExtensionSchema,
});

export const WalkthroughStepSchema = z.discriminatedUnion('type', [
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
]);

export type WalkthroughStep = z.infer<typeof WalkthroughStepSchema>;

export const WalkthroughFlowSchema = z.strictObject({
  title: z.string().min(1, 'title must not be empty'),
  timeout: TimeoutSchema.optional(),
  selectorAttribute: z.string().min(1, 'selectorAttribute must not be empty').optional(),
  steps: z.array(WalkthroughStepSchema),
  waggle: WaggleFlowExtensionSchema,
});

export type WalkthroughFlow = z.infer<typeof WalkthroughFlowSchema>;
