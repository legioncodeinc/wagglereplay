#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * AC4 Playwright smoke: loads a fixture Waggle project into the REAL
 * built `@waggle/studio` server, drives the real browser UI to edit a
 * step's description, and reads `narration/script.json` back off disk to
 * prove the write actually landed - not a mock, not a unit test calling a
 * function directly, the whole path: browser -> autosave debounce -> PUT
 * /api/steps/:stepIndex/description -> `$lib/server/narration-store.ts` ->
 * the file on disk.
 *
 * What this proves: a human editing a description in Studio's real UI
 * produces a real file write with the correct content and the
 * machine-drafted flag cleared. What it does NOT prove: the extension
 * upload endpoints (that is `test/routes/upload-endpoints.test.ts`,
 * unit-level against the real fixture recording) or every AC2/AC3/AC5/AC6
 * surface (those have their own unit/route coverage; this script is
 * intentionally narrow, matching this PRD's task table: "Playwright
 * smoke: load fixture project, edit a step, verify file write").
 *
 * Chromium resolution mirrors `apps/extension/test/e2e/run-alignment-e2e.ts`'s
 * `findCachedChromium()`: this environment's Playwright cache, no fresh
 * download attempted.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeHeatmap, writePreDraft } from '@waggle/ingest';
import {
  createDefaultManifest,
  manifestPath,
  subdirPath,
  TRACKED_EMPTY_SUBDIRS,
  writeNextIrVersion,
} from '@waggle/ir';
import { chromium } from 'playwright-core';
import { buildTwoStepFlow } from '../helpers/flow-fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(here, '../../');
const buildEntry = path.join(studioRoot, 'build', 'index.js');

/** A 1x1 transparent PNG, just enough for the film strip/scrubber `<img>` tags to decode without console errors. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function findCachedChromium(): string | null {
  const explicit = process.env.WAGGLE_E2E_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  const candidateRoots = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : null,
    process.env.HOME ? path.join(process.env.HOME, '.cache', 'ms-playwright') : null,
  ].filter((candidate): candidate is string => candidate !== null && existsSync(candidate));

  for (const root of candidateRoots) {
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
  }
  return null;
}

/** Builds a fixture Waggle project: manifest + IR v1 (two steps) + frame assets + heatmap + predraft, all real files on disk. */
function buildFixtureProject(): string {
  const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-smoke-project-'));
  writeFileSync(
    manifestPath(projectDir),
    `${JSON.stringify(createDefaultManifest('smoke-demo'), null, 2)}\n`,
    'utf8',
  );
  // Matches "waggle init"'s own layout (packages/cli/src/commands/init.ts):
  // narration/, brand/, baselines/, steps/, renders/ all exist from the start.
  for (const subdir of TRACKED_EMPTY_SUBDIRS) {
    mkdirSync(subdirPath(projectDir, subdir), { recursive: true });
  }

  const flow = buildTwoStepFlow();
  const writeResult = writeNextIrVersion(projectDir, flow);

  const framePlacements: ReadonlyArray<readonly [string, string]> = [
    ['step-000', 'settled.png'],
    ['step-001', 'click.png'],
  ];
  for (const [stepDir, fileName] of framePlacements) {
    const dir = path.join(
      subdirPath(projectDir, 'steps'),
      `v${String(writeResult.version)}`,
      stepDir,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, fileName), ONE_PIXEL_PNG);
  }

  writeHeatmap(projectDir, {
    schemaVersion: 1,
    irVersion: writeResult.version,
    routes: [{ route: 'https://example.test/login', points: [{ nx: 0.4, ny: 0.5, stepIndex: 1 }] }],
  });
  writePreDraft(projectDir, {
    schemaVersion: 1,
    irVersion: writeResult.version,
    steps: flow.steps.map((_step, index) => ({
      stepIndex: index,
      description: `Machine-drafted description for step ${String(index)}`,
      machineDrafted: true,
      confidence: 'medium',
      provider: 'smoke-fixture',
    })),
  });

  return projectDir;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server at ${url} did not become ready in time: ${String(lastError)}`);
}

function spawnStudioServer(projectDir: string, port: number): ChildProcess {
  return spawn(process.execPath, [buildEntry], {
    env: {
      ...process.env,
      WAGGLE_PROJECT_DIR: projectDir,
      HOST: '127.0.0.1',
      PORT: String(port),
      BODY_SIZE_LIMIT: 'Infinity',
    },
    stdio: 'pipe',
  });
}

async function main(): Promise<void> {
  console.log('=== AC4 Studio description-editor smoke ===');

  if (!existsSync(buildEntry)) {
    console.error(
      `"${buildEntry}" does not exist. Run "pnpm --filter @waggle/studio build" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const executablePath = findCachedChromium();
  if (!executablePath) {
    console.error('No cached Chromium executable found; cannot run this smoke test.');
    process.exitCode = 1;
    return;
  }

  const projectDir = buildFixtureProject();
  const port = await findFreePort();
  const server = spawnStudioServer(projectDir, port);
  server.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));

  let passed = false;
  try {
    await waitForServer(`http://127.0.0.1:${String(port)}/`, 15_000);
    console.log(`Studio server up at http://127.0.0.1:${String(port)}/ (project: ${projectDir})`);

    const browser = await chromium.launch({ executablePath, headless: true });
    try {
      const page = await browser.newPage();
      page.on('pageerror', (err) => console.log(`[browser:pageerror] ${String(err)}`));
      page.on('response', (res) => {
        // The description PUT is the one request this smoke test's pass/fail
        // hinges on; a non-2xx here is worth seeing even without --verbose.
        if (res.url().includes('/api/steps/') && !res.ok()) {
          console.log(`[response] ${res.request().method()} ${res.status()} ${res.url()}`);
        }
      });
      await page.goto(`http://127.0.0.1:${String(port)}/`);
      await page.waitForSelector('.step-card', { timeout: 10_000 });

      // Select step 2 (index 1) so the smoke test exercises selection,
      // not just whatever the page defaults to.
      const stepCards = page.locator('.step-card');
      await stepCards.nth(1).click();

      const editorSelector = '#description-1';
      await page.waitForSelector(editorSelector, { timeout: 10_000 });

      const editedText = `Edited via Playwright smoke at ${String(Date.now())}`;
      await page.fill(editorSelector, editedText);
      // Autosave debounces 600ms (DescriptionEditor.svelte); wait past it
      // plus a request round trip, then wait for the "Saved" indicator
      // rather than a fixed sleep alone.
      await page.waitForSelector('.save-state[data-state="saved"]', { timeout: 5_000 });

      const scriptPath = path.join(subdirPath(projectDir, 'narration'), 'script.json');
      const script = JSON.parse(readFileSync(scriptPath, 'utf8')) as {
        segments: Array<{ stepIndex: number; approved: boolean; approvedText: string | null }>;
      };
      const segment = script.segments.find((candidate) => candidate.stepIndex === 1);

      if (segment === undefined) {
        throw new Error('narration/script.json has no segment for step index 1.');
      }
      if (segment.approvedText !== editedText) {
        throw new Error(
          `Expected narration/script.json segment 1 approvedText to be "${editedText}", got "${String(segment.approvedText)}".`,
        );
      }
      if (!segment.approved) {
        throw new Error(
          'Expected the edited segment\'s "approved" flag to be true (machine-drafted flag cleared).',
        );
      }

      console.log('File write verified: narration/script.json segment 1:');
      console.log(JSON.stringify(segment, null, 2));
      passed = true;
    } finally {
      await browser.close();
    }
  } finally {
    server.kill('SIGTERM');
    rmSync(projectDir, { recursive: true, force: true });
  }

  console.log(passed ? 'PASSED' : 'FAILED');
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
