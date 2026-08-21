import type { WalkthroughFlow } from '../schema/flow.js';
import type { StepCore, UserFlowCore } from '../schema/step-core.js';
import { assertUserFlowCore } from '../validate.js';

/**
 * Export to the bare Puppeteer Replay user-flow format (ADR-001: "export
 * to @puppeteer/replay works with extensions stripped").
 *
 * Because every Waggle addition is namespaced under a single `waggle` key
 * at exactly two levels (flow and step), stripping is total and provably
 * complete: there is no third place an extension could hide. The result is
 * re-validated against the core schema before it is returned, so a future
 * schema change that leaks a Waggle field into the core surfaces here
 * rather than inside a consumer's replay run.
 */

function stripStep(step: WalkthroughFlow['steps'][number]): StepCore {
  const { waggle: _waggle, ...core } = step;
  return core;
}

/**
 * Returns the flow with every `waggle` key removed, ready for
 * `@puppeteer/replay`'s `parse()`, `stringify()`, or `createRunner()`.
 *
 * The input is not mutated: the IR document a caller holds is unchanged by
 * exporting it, which matters because IR documents are immutable by
 * contract (ADR-015).
 */
export function exportToPuppeteerReplay(flow: WalkthroughFlow): UserFlowCore {
  const { waggle: _waggle, steps, ...rest } = flow;
  const exported = {
    ...rest,
    steps: steps.map(stripStep),
  };
  return assertUserFlowCore(exported, 'Exported Puppeteer Replay user flow');
}
