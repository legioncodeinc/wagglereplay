// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CaptureEvent } from '@waggle/extension';
import type { ActionEvent, EventGroup, GroupOrOrphan, OutcomeEvent } from './types.js';

/**
 * AC1: the grouping state machine. Walks a session's event stream, in
 * `seq` order, and produces one `EventGroup` per step-worthy action
 * (click, scroll, input) plus any `OrphanRoute` a route event produces
 * when no group was open to receive it.
 *
 * Grouping rules (corpus, capture-layer.md "Telemetry" and "Routes and
 * state changes"; PRD-004 AC1 "click/input/scroll grouping, route
 * boundaries, settle attachment"):
 *
 *  - `pointermove` never opens or extends a group; it is filtered out
 *    before this function runs (see ./segment-session.ts) because it only
 *    feeds `flow.waggle.cursorTrail`.
 *  - A `click` ALWAYS starts a new group. Two clicks are never the same
 *    step, even back to back, because each is a distinct user action with
 *    its own selectors/element/offset.
 *  - Consecutive `scroll` events coalesce into ONE group as long as the
 *    previous group is still open, is itself a scroll group, and the gap
 *    since the last scroll sample is within `SCROLL_COALESCE_GAP_MS`: a
 *    single scroll gesture fires many DOM `scroll` events, and the
 *    storyboard wants one step ("the user scrolled down"), not dozens.
 *  - Consecutive `input` events coalesce the same way, but ONLY when they
 *    target the same field (compared by their first selector's value):
 *    typing into one field is one step; moving to the next field starts a
 *    new one even with no gap at all (see the real fixture recording,
 *    packages/ingest/test/fixtures/six-step-session/events.jsonl, where
 *    the username and password `input` events are adjacent in the stream
 *    but must stay two separate `change` steps).
 *  - A `route` event closes whatever group is open (attaching it as that
 *    group's outcome) and stops it from accepting more action events. If
 *    no group is open, it becomes an `OrphanRoute` (../segment/types.ts)
 *    rather than being dropped.
 *  - A `state-change` event likewise closes the open group. If none is
 *    open, it is unattachable (a state-change event without a preceding
 *    click has no element/selector data to build a step from) and is
 *    recorded as a warning, not thrown - a single stray telemetry event
 *    should never fail an entire ingest run.
 *  - A `settle` event attaches to whichever group is currently open
 *    without closing it (settle commonly arrives well after the group's
 *    classifying route/state-change, or after none at all - see the real
 *    fixture's fetch-trigger step, whose settle event arrives while its
 *    group is still open and the group is only later closed by the next
 *    click). If no group is open when settle arrives, it attaches to the
 *    most recently CLOSED group instead (the settle for an action almost
 *    always still belongs to the step that triggered it), and only
 *    becomes a warning if there has been no group at all yet.
 *  - The final open group (if any) closes at end of stream.
 *
 * Implementation note: the close-current-group step is inlined at each
 * call site (rather than factored into a shared `closeOpen()` helper)
 * deliberately. A shared helper closing over the loop's mutable `open`
 * and `lastClosed` variables is the more conventional shape, but this
 * repo's TypeScript toolchain (7.x) does not always carry a `let`
 * variable's declared type through a closure-mediated reassignment inside
 * a loop, which surfaced as a spurious "does not exist on type 'never'"
 * error on the later `else if (lastClosed)` read even though `lastClosed`
 * is explicitly typed `EventGroup | null`. Four short inlined blocks are
 * a small price for control flow the checker can follow exactly.
 */

const SCROLL_COALESCE_GAP_MS = 250;
const INPUT_COALESCE_GAP_MS = 250;

export interface GroupingResult {
  readonly groups: GroupOrOrphan[];
  readonly warnings: string[];
}

function isActionEvent(event: CaptureEvent): event is ActionEvent {
  return event.type === 'click' || event.type === 'scroll' || event.type === 'input';
}

function isOutcomeEvent(event: CaptureEvent): event is OutcomeEvent {
  return event.type === 'route' || event.type === 'state-change' || event.type === 'settle';
}

/** The selector value used to decide whether two `input` events target the same field. */
function inputFieldKey(event: Extract<ActionEvent, { type: 'input' }>): string {
  const first = event.selectors[0];
  return JSON.stringify(first?.value ?? null);
}

function canCoalesce(open: EventGroup, event: ActionEvent): boolean {
  if (open.actionType !== event.type) return false;
  if (event.type === 'click') return false; // clicks never coalesce, even with themselves
  const lastAction = open.actionEvents[open.actionEvents.length - 1];
  if (lastAction === undefined) return false;
  const gapMs = event.epochMs - lastAction.epochMs;
  if (event.type === 'scroll') {
    return gapMs <= SCROLL_COALESCE_GAP_MS;
  }
  // event.type === 'input'
  const lastInput = lastAction as Extract<ActionEvent, { type: 'input' }>;
  return gapMs <= INPUT_COALESCE_GAP_MS && inputFieldKey(lastInput) === inputFieldKey(event);
}

function newGroup(
  actionType: ActionEvent['type'],
  event: ActionEvent,
  routeAtStart: string,
): EventGroup {
  return {
    actionType,
    actionEvents: [event],
    outcome: { route: null, stateChange: null, settle: null },
    routeAtStart,
  };
}

/**
 * @param initialRoute The route the tab was on before any event in
 *   `events` fired (`meta.initialUrl`). Seeds `routeAtStart` for every
 *   group formed before the session's first `route` event; without it,
 *   the very first step (almost always the one that leaves the landing
 *   page) would have no route to attribute a heatmap point to.
 */
export function groupEvents(events: readonly CaptureEvent[], initialRoute: string): GroupingResult {
  const groups: GroupOrOrphan[] = [];
  const warnings: string[] = [];

  let open: EventGroup | null = null;
  let lastClosed: EventGroup | null = null;
  let currentRoute = initialRoute;

  for (const event of events) {
    if (event.type === 'pointermove') continue;

    if (isActionEvent(event)) {
      if (event.type === 'click') {
        if (open !== null) {
          groups.push(open);
          lastClosed = open;
        }
        open = newGroup('click', event, currentRoute);
        continue;
      }
      if (open !== null && canCoalesce(open, event)) {
        open.actionEvents.push(event);
        continue;
      }
      if (open !== null) {
        groups.push(open);
        lastClosed = open;
      }
      open = newGroup(event.type, event, currentRoute);
      continue;
    }

    if (isOutcomeEvent(event)) {
      if (event.type === 'route') {
        if (open !== null) {
          open.outcome.route = event;
          groups.push(open);
          lastClosed = open;
          open = null;
        } else {
          groups.push({ kind: 'orphan-route', event, routeAtStart: currentRoute });
        }
        currentRoute = event.after;
        continue;
      }
      if (event.type === 'state-change') {
        if (open !== null) {
          open.outcome.stateChange = event;
          groups.push(open);
          lastClosed = open;
          open = null;
        } else {
          warnings.push(
            `Dropped a "state-change" event at epochMs=${event.epochMs}: no open step to attach it to.`,
          );
        }
        continue;
      }
      // event.type === 'settle'
      if (open !== null) {
        open.outcome.settle = event;
      } else if (lastClosed !== null) {
        lastClosed.outcome.settle = event;
      } else {
        warnings.push(
          `Dropped a "settle" event at epochMs=${event.epochMs}: no step (open or closed) to attach it to.`,
        );
      }
      continue;
    }
  }

  if (open !== null) {
    groups.push(open);
  }

  return { groups, warnings };
}
