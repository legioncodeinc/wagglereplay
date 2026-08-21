import { mkdtempSync, rmSync } from 'node:fs';
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
});
