#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * One-off generator for packages/ingest's checked-in fixture recording.
 *
 * Not part of any package's build or test run. It drives the REAL, built
 * `apps/extension/dist/content-script.js` and `dist/route-main-world.js`
 * bundles (the exact production telemetry pipeline: telemetry.ts,
 * selectors.ts, element-sampler.ts, epoch.ts, state-change.ts,
 * route-main-world.ts, session.ts, finalizer.ts) against a real Chromium
 * page running the real fixture app, using the same seam-injection
 * technique as test/e2e/run-alignment-e2e.ts (see that file's header for
 * why this is "genuine" telemetry and not hand-authored events).
 *
 * What is genuine: click, pointermove, scroll, input, and route events all
 * come from the real content script reacting to real Playwright-driven
 * browser interaction (mouse, keyboard, wheel) against the real fixture
 * app, including real MAIN-world history-patch route detection
 * (route-main-world.js) and real state-change DOM-mutation detection
 * (state-change.ts).
 *
 * What is NOT genuine, and why: a single 'settle' event for the fetch
 * step. Settle detection (network-quiescence.ts) is wired to
 * `chrome.webRequest` in the real background service worker
 * (background/service-worker.ts), which has no equivalent outside a
 * loaded MV3 extension - there is no seam to inject it through the way
 * there is for the content-script bundle. That one event is synthesized
 * here with a comment marking it as such; every other line of this
 * fixture is real captured output. packages/ingest's own unit tests cover
 * settle-attachment logic separately against small, clearly-labeled
 * synthetic event arrays, exactly as they do for every other grouping
 * rule - this fixture is for proving segmentation determinism on a real,
 * end-to-end recording, not for exercising every rule in isolation.
 *
 * Run (from apps/extension): pnpm exec tsx scripts/generate-ingest-fixture.ts
 */

import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureApp, TEST_IDS } from '@waggle/fixture-demo-app';
import { chromium } from 'playwright-core';
import type { CaptureEventDraft } from '../src/lib/events.js';
import { finalizeSession } from '../src/lib/finalizer.js';
import { CaptureSession } from '../src/lib/session.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, '..');
const repoRoot = path.resolve(extensionDir, '../..');
const extensionDistDir = path.join(extensionDir, 'dist');
const outDir = path.join(repoRoot, 'packages/ingest/test/fixtures/six-step-session');

function findCachedChromium(): string {
  const root = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
    : null;
  if (!root || !existsSync(root)) {
    throw new Error('No cached Playwright Chromium found (LOCALAPPDATA/ms-playwright missing).');
  }
  const entries = readdirSync(root)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort()
    .reverse();
  for (const entry of entries) {
    const winPath = path.join(root, entry, 'chrome-win64', 'chrome.exe');
    const linuxPath = path.join(root, entry, 'chrome-linux', 'chrome');
    if (existsSync(winPath)) return winPath;
    if (existsSync(linuxPath)) return linuxPath;
  }
  throw new Error(`No chrome executable found under ${root}`);
}

const CHROME_SHIM_SCRIPT = `
  window.__waggleEvents = [];
  window.chrome = {
    runtime: {
      id: 'ingest-fixture-gen',
      sendMessage: function (message) {
        if (message.kind === 'telemetry:event') {
          window.__waggleEvents.push(message.event);
        }
      },
      onMessage: {
        addListener: function (fn) {
          window.__waggleOnMessage = fn;
        },
      },
    },
  };
`;

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const executablePath = findCachedChromium();
  const routeMainWorldBundle = await readFile(
    path.join(extensionDistDir, 'route-main-world.js'),
    'utf8',
  );
  const contentScriptBundle = await readFile(
    path.join(extensionDistDir, 'content-script.js'),
    'utf8',
  );

  const fixture = await startFixtureApp();
  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(fixture.url);

    // Whole-millisecond wall-clock anchor, exactly like
    // background/service-worker.ts's real startCapture and the e2e
    // harness above: this becomes both the session's and the video's
    // start epoch, so a synthetic video anchored at the same instant
    // lines up with every event's relative time.
    const sessionStartEpochMs = Date.now();

    // Route detection first (installs the history patch before any
    // pushState happens), then the isolated-world telemetry pipeline.
    await page.addScriptTag({ content: routeMainWorldBundle });
    await page.evaluate(CHROME_SHIM_SCRIPT);
    await page.addScriptTag({ content: contentScriptBundle });
    await page.evaluate(
      `window.__waggleOnMessage && window.__waggleOnMessage({ kind: 'capture:start', sessionId: 'ingest-fixture', startEpochMs: ${sessionStartEpochMs} });`,
    );

    await page.hover(`[data-testid="${TEST_IDS.ctaStart}"]`);

    // 1. Landing -> Start Walkthrough.
    await page.click(`[data-testid="${TEST_IDS.ctaStart}"]`);
    await page.waitForURL(/\/login/);

    // 2. Login -> fill + submit (real input events, real navigate route).
    await page.fill(`[data-testid="${TEST_IDS.inputUsername}"]`, 'demo-user');
    await page.fill(`[data-testid="${TEST_IDS.inputPassword}"]`, 'demo-pass-0000');
    await page.click(`[data-testid="${TEST_IDS.btnLogin}"]`);
    await page.waitForURL(/\/items/);

    // 3. Items -> click item-2 (real state-change, no route change).
    await page.click(`[data-testid="${TEST_IDS.item2}"]`);
    // Give the state-change MutationObserver window (300ms default) time
    // to resolve and sink its event before moving on.
    await page.waitForTimeout(400);

    // 4. Continue to scroll.
    await page.click(`[data-testid="${TEST_IDS.btnContinueToScroll}"]`);
    await page.waitForURL(/\/scroll/);

    // Real wheel-driven scroll gesture inside the scroll region.
    const scrollRegion = page.locator(`[data-testid="${TEST_IDS.scrollRegion}"]`);
    await scrollRegion.hover();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);

    // 5. Continue to fetch, trigger it, wait for it to resolve.
    await page.click(`[data-testid="${TEST_IDS.btnContinueToFetch}"]`);
    await page.waitForURL(/\/fetch/);
    const fetchClickEpochMs = Date.now();
    await page.click(`[data-testid="${TEST_IDS.fetchTrigger}"]`);
    await page.waitForFunction(
      (testId) =>
        document.querySelector(`[data-testid="${testId}"]`)?.textContent?.startsWith('Loaded'),
      TEST_IDS.fetchResult,
    );
    const fetchSettledEpochMs = Date.now();

    // 6. Continue to confirm.
    await page.click(`[data-testid="${TEST_IDS.btnContinueToConfirm}"]`);
    await page.waitForURL(/\/confirm/);
    await page.waitForTimeout(100);

    const rawEvents = (await page.evaluate(
      () => (window as unknown as { __waggleEvents: unknown[] }).__waggleEvents,
    )) as CaptureEventDraft[];

    // The one synthesized event (see file header): a settle event for the
    // fetch step, timed between the fetch click and the observed resolve.
    const syntheticSettle: CaptureEventDraft = {
      type: 'settle',
      epochMs: fetchSettledEpochMs,
      settle: { source: 'network-idle', ms: fetchSettledEpochMs - fetchClickEpochMs },
    };

    const allDrafts = [...rawEvents, syntheticSettle].sort((a, b) => a.epochMs - b.epochMs);

    const session = new CaptureSession({
      sessionId: 'ingest-fixture',
      tabId: 1,
      startEpochMs: sessionStartEpochMs,
      initialUrl: fixture.url,
      userAgent: await page.evaluate(() => navigator.userAgent),
      recordedViewport: { w: 1280, h: 800, dpr: 1 },
      fixtureVariant: fixture.variant,
    });
    for (const draft of allDrafts) {
      session.record(draft);
    }

    const durationMs = Date.now() - sessionStartEpochMs;
    const { eventsJsonl, meta } = finalizeSession({
      session,
      video: {
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        anchorEpochMs: sessionStartEpochMs,
        durationMs,
        chunkCount: 1,
      },
      // Fixed, not `new Date().toISOString()`'s wall-clock default: this
      // file is checked into git, and a checked-in fixture must not carry
      // a different byte every time someone regenerates it.
      generatedAt: '2026-08-20T00:00:00.000Z',
    });

    await writeFile(path.join(outDir, 'events.jsonl'), `${eventsJsonl}\n`, 'utf8');
    await writeFile(path.join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

    console.log(`Wrote ${meta.eventCount} events to ${outDir}`);
    console.log(`Session duration: ${durationMs}ms`);
    console.log('Event type counts:');
    const counts = new Map<string, number>();
    for (const line of eventsJsonl.split('\n')) {
      const t = (JSON.parse(line) as { type: string }).type;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      console.log(`  ${type}: ${count}`);
    }
  } finally {
    await browser.close();
    await fixture.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
