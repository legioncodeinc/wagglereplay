// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeNextIrVersion } from '@waggle/ir';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';

/**
 * Obviously-fake provider key for the env-var path these CLI tests take
 * (`process.env.ELEVENLABS_API_KEY`); the transport is faked below, so the
 * value only needs to be non-empty. One clearly-labeled constant instead
 * of inline literals, per the 2026-08-22 credential-scanner remediation
 * (narrate's test/fixtures.ts holds the same pattern for its suite).
 */
const FAKE_TTS_KEY_FOR_TESTS = 'test-key-not-real';

/**
 * A fake ElevenLabs transport, in the exact response shape documented at
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps.
 * Installed as the global `fetch` (`ElevenLabsAdapter` defaults to it when
 * no transport is injected, which is exactly the path `waggle narrate`
 * takes for real), so this test exercises the CLI wiring end to end:
 * command parsing, project/manifest resolution, `@waggle/narrate`'s full
 * pipeline, and exit-code translation, with only the network call faked.
 */
function installFakeElevenLabsFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const href = url.toString();
      if (href.includes('/v1/user/subscription')) {
        return new Response(JSON.stringify({ tier: 'creator' }), { status: 200 });
      }
      if (href.includes('/with-timestamps')) {
        const body = JSON.parse((init?.body as string) ?? '{}') as { text?: string };
        const characters = (body.text ?? '').split('');
        const alignment = {
          characters,
          character_start_times_seconds: characters.map((_, i) => (i * 90) / 1000),
          character_end_times_seconds: characters.map((_, i) => ((i + 1) * 90) / 1000),
        };
        return new Response(
          JSON.stringify({
            audio_base64: Buffer.from('fake-mp3-bytes').toString('base64'),
            alignment,
            normalized_alignment: alignment,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch to ${href} in test fake`);
    }),
  );
}

describe('`waggle narrate` (e2e)', () => {
  const cleanupDirs: string[] = [];
  const touchedEnvVars = ['ELEVENLABS_API_KEY', 'WAGGLE_ELEVENLABS_VOICE_ID'] as const;
  const originalEnvValues: Record<string, string | undefined> = {};
  for (const key of touchedEnvVars) {
    originalEnvValues[key] = process.env[key];
  }

  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    vi.unstubAllGlobals();
    for (const key of touchedEnvVars) {
      const original = originalEnvValues[key];
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  function tempParentDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-narrate-e2e-'));
    cleanupDirs.push(dir);
    return dir;
  }

  const fixtureFlow = {
    title: 'Fixture walkthrough',
    steps: [
      {
        type: 'navigate',
        url: 'https://example.test/dashboard',
        waggle: {
          classification: 'navigate',
          routeAfter: '/dashboard',
          settle: { source: 'network-idle', ms: 200 },
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

  it('exits NARRATION_NOT_APPROVED and writes an unapproved draft on the first run', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    writeNextIrVersion(projectDir, fixtureFlow);

    process.env.ELEVENLABS_API_KEY = FAKE_TTS_KEY_FOR_TESTS;
    process.env.WAGGLE_ELEVENLABS_VOICE_ID = 'voice-1';
    installFakeElevenLabsFetch();

    const code = await runCli(['node', 'waggle', 'narrate', '--project', projectDir]);
    expect(code).toBe(ExitCode.NARRATION_NOT_APPROVED);

    const scriptPath = path.join(projectDir, 'narration', 'script.json');
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('produces audio and words.json once the drafted script is approved', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    writeNextIrVersion(projectDir, fixtureFlow);

    process.env.ELEVENLABS_API_KEY = FAKE_TTS_KEY_FOR_TESTS;
    process.env.WAGGLE_ELEVENLABS_VOICE_ID = 'voice-1';
    installFakeElevenLabsFetch();

    await runCli(['node', 'waggle', 'narrate', '--project', projectDir]);

    const scriptPath = path.join(projectDir, 'narration', 'script.json');
    const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
    script.segments = script.segments.map((segment: { draftText: string }) => ({
      ...segment,
      approvedText: segment.draftText,
      approved: true,
    }));
    writeFileSync(scriptPath, `${JSON.stringify(script, null, 2)}\n`);

    const code = await runCli(['node', 'waggle', 'narrate', '--project', projectDir]);
    expect(code).toBe(ExitCode.SUCCESS);

    expect(existsSync(path.join(projectDir, 'narration', 'audio.mp3'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'narration', 'words.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'narration', 'captions.srt'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'narration', 'captions.vtt'))).toBe(true);
  });

  it('exits TTS_CONFIG_INVALID naming the missing env var when no provider config is set', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    writeNextIrVersion(projectDir, fixtureFlow);

    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.WAGGLE_ELEVENLABS_VOICE_ID;

    const scriptPath = path.join(projectDir, 'narration', 'script.json');
    writeFileSync(
      scriptPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          segments: [
            {
              narrationSegmentId: 'step-0',
              stepIndex: 0,
              draftText: 'Navigate to /dashboard.',
              approvedText: 'Navigate to /dashboard.',
              approved: true,
              targetDurationMs: 500,
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const code = await runCli(['node', 'waggle', 'narrate', '--project', projectDir]);
    expect(code).toBe(ExitCode.TTS_CONFIG_INVALID);
  });

  it('exits PROJECT_NOT_FOUND against a directory with no manifest', async () => {
    const parent = tempParentDir();
    const code = await runCli(['node', 'waggle', 'narrate', '--project', parent]);
    expect(code).toBe(ExitCode.PROJECT_NOT_FOUND);
  });
});
