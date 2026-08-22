// SPDX-License-Identifier: AGPL-3.0-or-later
import { FIXED_INPUT_PLACEHOLDER } from '@waggle/extension';
import type { WalkthroughStep } from '@waggle/ir';
import type { EventGroup, GroupOrOrphan, StepTiming } from './types.js';

type ClickStep = Extract<WalkthroughStep, { type: 'click' }>;
type ScrollStep = Extract<WalkthroughStep, { type: 'scroll' }>;
type ChangeStep = Extract<WalkthroughStep, { type: 'change' }>;
type NavigateStep = Extract<WalkthroughStep, { type: 'navigate' }>;

export interface BuildStepsResult {
  readonly steps: WalkthroughStep[];
  readonly stepTimings: StepTiming[];
  readonly warnings: string[];
}

/**
 * AC1: turns the grouped/classified event stream (../group-events.ts)
 * into IR steps plus the parallel timing data ../frames and ../heatmap
 * need. `startEpochMs` converts every event's absolute `epochMs` into the
 * flow-relative `t` the IR and its consumers use throughout (corpus,
 * "Numbering and time").
 */
export function buildSteps(
  groups: readonly GroupOrOrphan[],
  startEpochMs: number,
): BuildStepsResult {
  const steps: WalkthroughStep[] = [];
  const stepTimings: StepTiming[] = [];
  const warnings: string[] = [];

  for (const group of groups) {
    if ('kind' in group) {
      // OrphanRoute: a route event with no preceding captured click. Still
      // becomes a real step (NavigateStepCoreSchema needs no selectors),
      // rather than being silently dropped.
      const stepIndex = steps.length;
      const step: NavigateStep = {
        type: 'navigate',
        url: group.event.after,
        waggle: {
          classification: 'navigate',
          routeBefore: group.event.before,
          routeAfter: group.event.after,
          masked: false,
        },
      };
      steps.push(step);
      stepTimings.push({
        stepIndex,
        actionRelMs: group.event.epochMs - startEpochMs,
        settledRelMs: null,
        clickPoint: null,
        route: group.routeAtStart,
      });
      continue;
    }

    const stepIndex = steps.length;
    const built = buildStepFromGroup(group, stepIndex, startEpochMs, warnings);
    steps.push(built.step);
    stepTimings.push(built.timing);
  }

  return { steps, stepTimings, warnings };
}

function buildStepFromGroup(
  group: EventGroup,
  stepIndex: number,
  startEpochMs: number,
  warnings: string[],
): { step: WalkthroughStep; timing: StepTiming } {
  const settledRelMs =
    group.outcome.settle !== null ? group.outcome.settle.epochMs - startEpochMs : null;

  if (group.actionType === 'click') {
    const click = group.actionEvents[0];
    if (click === undefined || click.type !== 'click') {
      throw new Error('internal error: click group with no click event');
    }

    // Falls back to 'state-change' with no domDelta when neither a route
    // nor a state-change event followed this click before the next action
    // closed it out. This is a legitimate outcome (see the fixture's
    // fetch-trigger click, whose only outcome is a settle event), not an
    // error: it means "we saw an action but no observable page effect
    // beyond a network settle."
    const classification: 'navigate' | 'state-change' = group.outcome.route
      ? 'navigate'
      : 'state-change';
    const routeBefore = group.outcome.route?.before;
    const routeAfter = group.outcome.route?.after;

    const step: ClickStep = {
      type: 'click',
      selectors: click.selectors.map((s) => s.value),
      offsetX: click.offsetX,
      offsetY: click.offsetY,
      button: click.button,
      waggle: {
        classification,
        ...(routeBefore !== undefined ? { routeBefore } : {}),
        ...(routeAfter !== undefined ? { routeAfter } : {}),
        ...(group.outcome.stateChange ? { domDelta: group.outcome.stateChange.domDelta } : {}),
        ...(group.outcome.settle ? { settle: group.outcome.settle.settle } : {}),
        element: click.element,
        masked: false,
      },
    };

    return {
      step,
      timing: {
        stepIndex,
        actionRelMs: click.epochMs - startEpochMs,
        settledRelMs,
        clickPoint: { x: click.x, y: click.y },
        route: group.routeAtStart,
      },
    };
  }

  if (group.actionType === 'scroll') {
    const last = group.actionEvents[group.actionEvents.length - 1];
    const first = group.actionEvents[0];
    if (last === undefined || first === undefined || last.type !== 'scroll') {
      throw new Error('internal error: scroll group with no scroll event');
    }
    if (group.outcome.route || group.outcome.stateChange) {
      warnings.push(
        `Step ${stepIndex} (scroll): an outcome event (route/state-change) landed on a scroll step, which is unexpected; kept for the record but not reflected in its classification.`,
      );
    }

    const step: ScrollStep = {
      type: 'scroll',
      ...(last.selectors ? { selectors: last.selectors.map((s) => s.value) } : {}),
      x: last.x,
      y: last.y,
      waggle: {
        classification: 'scroll',
        ...(group.outcome.settle ? { settle: group.outcome.settle.settle } : {}),
        masked: false,
      },
    };

    return {
      step,
      timing: {
        stepIndex,
        actionRelMs: first.epochMs - startEpochMs,
        settledRelMs,
        clickPoint: null,
        route: group.routeAtStart,
      },
    };
  }

  // group.actionType === 'input'
  const last = group.actionEvents[group.actionEvents.length - 1];
  const first = group.actionEvents[0];
  if (last === undefined || first === undefined || last.type !== 'input') {
    throw new Error('internal error: input group with no input event');
  }

  const step: ChangeStep = {
    type: 'change',
    selectors: last.selectors.map((s) => s.value),
    value: FIXED_INPUT_PLACEHOLDER,
    waggle: {
      classification: 'input',
      ...(group.outcome.settle ? { settle: group.outcome.settle.settle } : {}),
      masked: last.credential,
    },
  };

  return {
    step,
    timing: {
      stepIndex,
      actionRelMs: first.epochMs - startEpochMs,
      settledRelMs,
      clickPoint: null,
      route: group.routeAtStart,
    },
  };
}
