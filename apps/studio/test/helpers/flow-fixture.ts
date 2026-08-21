import { assertWalkthroughFlow, type WalkthroughFlow } from '@waggle/ir';

/** A small, hand-built, schema-valid two-step Walkthrough IR flow for unit tests that don't need a real recording. */
export function buildTwoStepFlow(): WalkthroughFlow {
  const raw = {
    title: 'Test walkthrough',
    steps: [
      {
        type: 'navigate',
        url: 'https://example.test/',
        waggle: {
          classification: 'navigate',
          routeBefore: 'https://example.test/',
          routeAfter: 'https://example.test/login',
          masked: false,
          assets: { settled: 'steps/v1/step-000/settled.png' },
        },
      },
      {
        type: 'click',
        selectors: [['[data-testid="cta-start"]']],
        offsetX: 10,
        offsetY: 5,
        waggle: {
          classification: 'state-change',
          domDelta: { summary: 'Opened the start dialog', ariaChanges: [] },
          element: { role: 'button', name: 'Start', rect: { x: 10, y: 20, w: 100, h: 40 } },
          masked: false,
          assets: { click: 'steps/v1/step-001/click.png' },
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
  };
  return assertWalkthroughFlow(raw, 'test fixture flow');
}
