// SPDX-License-Identifier: AGPL-3.0-or-later
import { type WalkthroughFlow, WalkthroughFlowSchema } from '@waggle/ir';

/**
 * A small, valid Walkthrough IR flow for narrate-package tests: one step
 * per classification the segmenter branches on (navigate, input,
 * state-change, scroll), each carrying the metadata AC1's drafter reads.
 * Validated through the real IR schema so a fixture that would not
 * actually pass `@waggle/ir` validation can never sneak into a test.
 */
export function buildFixtureFlow(): WalkthroughFlow {
  return WalkthroughFlowSchema.parse({
    title: 'Fixture walkthrough',
    steps: [
      {
        type: 'navigate',
        url: 'https://example.test/dashboard',
        waggle: {
          classification: 'navigate',
          routeAfter: '/dashboard',
          settle: { source: 'network-idle', ms: 800 },
          masked: false,
        },
      },
      {
        type: 'change',
        selectors: [['#email']],
        value: 'demo@example.test',
        waggle: {
          classification: 'input',
          element: { role: 'textbox', name: 'Email', rect: { x: 0, y: 0, w: 200, h: 32 } },
          settle: { source: 'mutation-quiet', ms: 200 },
          masked: false,
        },
      },
      {
        type: 'click',
        selectors: [['#submit']],
        offsetX: 5,
        offsetY: 5,
        waggle: {
          classification: 'state-change',
          domDelta: {
            summary: 'the dashboard shows a success banner',
            ariaChanges: [],
          },
          settle: { source: 'animation-end', ms: 400 },
          masked: false,
        },
      },
      {
        type: 'scroll',
        waggle: {
          classification: 'scroll',
          element: {
            role: 'region',
            name: 'Recent activity',
            rect: { x: 0, y: 400, w: 800, h: 300 },
          },
          settle: { source: 'timeout', ms: 150 },
          masked: false,
        },
      },
    ],
    waggle: {
      schemaVersion: 1,
      recordedViewport: { w: 1280, h: 800, dpr: 1 },
      startEpochMs: 1_700_000_000_000,
      cursorTrail: [],
      clicks: [],
    },
  });
}
