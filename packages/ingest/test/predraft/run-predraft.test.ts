// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WalkthroughFlow } from '@waggle/ir';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPreDraft } from '../../src/predraft/run-predraft.js';
import type { FetchLike } from '../../src/predraft/shared-http.js';

function fixtureFlow(): WalkthroughFlow {
  return {
    title: 'Fixture walkthrough',
    steps: [
      {
        type: 'navigate',
        url: 'https://example.test/dashboard',
        waggle: {
          classification: 'navigate',
          routeAfter: '/dashboard',
          masked: false,
        },
      },
      {
        type: 'click',
        selectors: ['#confirm'],
        offsetX: 5,
        offsetY: 5,
        waggle: {
          classification: 'state-change',
          domDelta: { summary: 'a modal appeared', ariaChanges: [] },
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
  };
}

describe('AC4: runPreDraft - graceful degradation (no provider configured)', () => {
  it('produces a placeholder entry for every step, naming the missing env var, and never throws', async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-'));
    const { document, warnings } = await runPreDraft({
      flow: fixtureFlow(),
      projectDir,
      irVersion: 1,
      env: {},
    });

    expect(document.steps).toHaveLength(2);
    for (const entry of document.steps) {
      expect(entry.machineDrafted).toBe(true);
      expect(entry.confidence).toBeNull();
      expect(entry.provider).toBeNull();
      expect(entry.description).toContain('WAGGLE_PREDRAFT_PROVIDER');
    }
    expect(warnings.some((w) => w.includes('WAGGLE_PREDRAFT_PROVIDER'))).toBe(true);

    rmSync(projectDir, { recursive: true, force: true });
  });

  it('scrubs a credential env name from unavailable-provider output', async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-'));
    writeFileSync(
      path.join(projectDir, 'credentials.json'),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'collision',
            label: 'Provider-name collision',
            secret_env: 'OPENAI_API_KEY',
            applies_to: { username: [], secret: [], totp: [] },
          },
        ],
      }),
    );

    const result = await runPreDraft({
      flow: fixtureFlow(),
      projectDir,
      irVersion: 1,
      env: { WAGGLE_PREDRAFT_PROVIDER: 'openai' },
    });

    expect(JSON.stringify(result)).not.toContain('OPENAI_API_KEY');
    expect(JSON.stringify(result)).toContain('[REDACTED]');
    rmSync(projectDir, { recursive: true, force: true });
  });
});

describe('AC4: runPreDraft - configured provider (mocked transport)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drafts a real description per step when openai + a key are configured', async () => {
    const fetchImpl: FetchLike = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    description: 'A drafted caption.',
                    confidence: 'high',
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );

    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-'));
    const { document, warnings } = await runPreDraft({
      flow: fixtureFlow(),
      projectDir,
      irVersion: 1,
      env: { WAGGLE_PREDRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
    });

    expect(warnings).toEqual([]);
    expect(document.steps).toHaveLength(2);
    for (const entry of document.steps) {
      expect(entry.description).toBe('A drafted caption.');
      expect(entry.confidence).toBe('high');
      expect(entry.provider).toBe('openai');
      expect(entry.machineDrafted).toBe(true);
    }

    rmSync(projectDir, { recursive: true, force: true });
  });

  it('degrades just the failing step to a placeholder when the provider call fails, and keeps going', async () => {
    let call = 0;
    const fetchImpl: FetchLike = vi.fn(async () => {
      call += 1;
      // The transport-level retry policy (../shared-http.ts) makes up to
      // 3 attempts (1 initial + 2 retries) before giving up; failing all
      // 3 exhausts step 0's call entirely, so it falls back to a
      // placeholder, while step 1's first attempt (call 4) succeeds.
      if (call <= 3) return new Response('server exploded', { status: 500 });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ description: 'Second step is fine.', confidence: 'low' }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-'));
    const { document, warnings } = await runPreDraft({
      flow: fixtureFlow(),
      projectDir,
      irVersion: 1,
      env: { WAGGLE_PREDRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
    });

    // First step's HTTP call retries internally up to the retry policy's
    // cap on 5xx before this test's fake starts returning 200s, so it
    // still ends up degraded to a failure placeholder.
    expect(document.steps[0]?.description).toContain('Machine draft failed');
    expect(document.steps[0]?.provider).toBeNull();
    expect(warnings.some((w) => w.includes('Step 0'))).toBe(true);

    rmSync(projectDir, { recursive: true, force: true });
  });

  it('scrubs credential refs, flagged placeholders, values, and canaries before the provider and persisted document', async () => {
    const canaryValue = 'canary.value+[x]';
    const canaryText = 'CANARY-TEXT-441';
    const placeholder = '[credential-placeholder]';
    const flow = fixtureFlow();
    flow.steps.push({
      type: 'change',
      selectors: ['#password'],
      value: placeholder,
      waggle: {
        classification: 'input',
        routeAfter: `/account/${canaryText}`,
        element: {
          role: 'textbox',
          name: 'DEMO_SECRET',
          text: canaryValue,
          rect: { x: 0, y: 0, w: 100, h: 20 },
        },
        masked: true,
      },
    });

    const requestBodies: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      requestBodies.push(String(init?.body ?? ''));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  description: `Echo ${canaryValue} ${canaryText} DEMO_SECRET ${placeholder}`,
                  confidence: 'high',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-'));
    writeFileSync(
      path.join(projectDir, 'credentials.json'),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'demo',
            label: 'Demo',
            secret_env: 'DEMO_SECRET',
            applies_to: { secret: ['#password'] },
          },
        ],
      }),
    );

    const result = await runPreDraft({
      flow,
      projectDir,
      irVersion: 1,
      env: { WAGGLE_PREDRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      sensitiveText: { values: [canaryValue], canaries: [canaryText] },
    });

    const combined = JSON.stringify({ requestBodies, result });
    for (const forbidden of [canaryValue, canaryText, 'DEMO_SECRET', placeholder]) {
      expect(combined).not.toContain(forbidden);
    }
    expect(combined).toContain('[REDACTED]');

    // The returned document is the exact object writePreDraft persists.
    writeFileSync(path.join(projectDir, 'predraft.json'), JSON.stringify(result.document));
    const persisted = readFileSync(path.join(projectDir, 'predraft.json'), 'utf8');
    expect(persisted).not.toContain(canaryValue);
    expect(persisted).not.toContain('DEMO_SECRET');
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('never sends an image reference that escapes the project directory to the provider', async () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-boundary-'));
    const projectDir = path.join(fixtureRoot, 'project');
    mkdirSync(projectDir);
    const outsideBytes = Buffer.from('outside-project-image-canary');
    writeFileSync(path.join(fixtureRoot, 'outside.png'), outsideBytes);

    const flow = fixtureFlow();
    const firstStep = flow.steps[0];
    if (firstStep === undefined) throw new Error('Fixture step missing');
    firstStep.waggle.assets = { before: '../outside.png' };

    const requestBodies: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      requestBodies.push(String(init?.body ?? ''));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ description: 'Safe caption.', confidence: 'high' }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    });

    await runPreDraft({
      flow,
      projectDir,
      irVersion: 1,
      env: { WAGGLE_PREDRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
      verifiedImageRefs: new Set(['../outside.png']),
    });

    expect(requestBodies.join('\n')).not.toContain(outsideBytes.toString('base64'));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('does not read an in-project PNG unless this ingest run verified the asset reference', async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-predraft-unverified-'));
    const imageBytes = Buffer.from('unverified-image-canary');
    writeFileSync(path.join(projectDir, 'frame.png'), imageBytes);
    const flow = fixtureFlow();
    const firstStep = flow.steps[0];
    if (firstStep === undefined) throw new Error('Fixture step missing');
    firstStep.waggle.assets = { before: 'frame.png' };

    const requestBodies: string[] = [];
    const fetchImpl: FetchLike = vi.fn(async (_url, init) => {
      requestBodies.push(String(init?.body ?? ''));
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ description: 'Safe.', confidence: 'high' }) } },
          ],
        }),
        { status: 200 },
      );
    });

    await runPreDraft({
      flow,
      projectDir,
      irVersion: 1,
      env: { WAGGLE_PREDRAFT_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
    });

    expect(requestBodies.join('\n')).not.toContain(imageBytes.toString('base64'));
    rmSync(projectDir, { recursive: true, force: true });
  });
});
