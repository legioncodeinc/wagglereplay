import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createDefaultManifest,
  manifestPath,
  PROJECT_SUBDIRS,
  TRACKED_EMPTY_SUBDIRS,
  type WalkthroughFlow,
  writeNextIrVersion,
} from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NarrationDraftPendingApprovalError,
  runNarration,
} from '../../src/narrate/run-narration.js';
import { readNarrationScript, writeNarrationScript } from '../../src/script/script-io.js';
import { ElevenLabsAdapter } from '../../src/tts/elevenlabs/adapter.js';
import type { TtsAdapter } from '../../src/tts/types.js';
import { assertMonotonicWords, NarrationWordsDocumentSchema } from '../../src/words/schema.js';
import { buildFixtureFlow } from '../fixtures/flow.js';

/**
 * A fake ElevenLabs transport with no network access: it inspects the
 * request body/URL the real `ElevenLabsAdapter`/`ElevenLabsClient` sent
 * and returns a hand-built response in the exact shape documented at
 * https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
 * (per-character timing at a fixed, deterministic pace). Every layer above
 * the transport (request construction, retry, zod parsing, unit
 * conversion, chunk stitching, char-to-word aggregation, monotonicity
 * checks, file writers) runs for real against it.
 */
function fakeElevenLabsFetch(): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    const href = url.toString();
    if (href.includes('/v1/user/subscription')) {
      return new Response(JSON.stringify({ tier: 'creator' }), { status: 200 });
    }
    if (href.includes('/with-timestamps')) {
      const body = JSON.parse((init?.body as string) ?? '{}') as { text?: string };
      const text = body.text ?? '';
      const characters = text.split('');
      const msPerChar = 90;
      const alignment = {
        characters,
        character_start_times_seconds: characters.map((_, i) => (i * msPerChar) / 1000),
        character_end_times_seconds: characters.map((_, i) => ((i + 1) * msPerChar) / 1000),
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
  }) as typeof fetch;
}

describe('runNarration (AC6 end-to-end)', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function buildFixtureProject(flow: WalkthroughFlow = buildFixtureFlow()): string {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-narrate-e2e-'));
    cleanupDirs.push(projectDir);
    for (const subdir of PROJECT_SUBDIRS) {
      mkdirSync(path.join(projectDir, subdir), { recursive: true });
    }
    for (const subdir of TRACKED_EMPTY_SUBDIRS) {
      writeFileSync(path.join(projectDir, subdir, '.gitkeep'), '');
    }
    const manifest = createDefaultManifest('fixture');
    writeFileSync(manifestPath(projectDir), `${JSON.stringify(manifest, null, 2)}\n`);
    writeNextIrVersion(projectDir, flow);
    return projectDir;
  }

  it('drafts narration/script.json and refuses to synthesize until every segment is approved (AC1)', async () => {
    const projectDir = buildFixtureProject();
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      fetchImpl: fakeElevenLabsFetch(),
    });

    await expect(runNarration({ projectDir, adapter })).rejects.toThrow(
      NarrationDraftPendingApprovalError,
    );

    const scriptPath = path.join(projectDir, 'narration', 'script.json');
    expect(existsSync(scriptPath)).toBe(true);
    const script = readNarrationScript(scriptPath);
    expect(script.segments).toHaveLength(4);
    expect(script.segments.every((s) => !s.approved)).toBe(true);
  });

  it('produces audio, words.json, and captions with monotonic timings covering the full audio duration once approved', async () => {
    const projectDir = buildFixtureProject();
    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      fetchImpl: fakeElevenLabsFetch(),
    });

    // First call drafts and refuses (AC1's approval gate).
    await expect(runNarration({ projectDir, adapter })).rejects.toThrow(
      NarrationDraftPendingApprovalError,
    );

    // Simulate the author approving every segment in Studio (prd-005):
    // approve the draft text as-is.
    const scriptPath = path.join(projectDir, 'narration', 'script.json');
    const drafted = readNarrationScript(scriptPath);
    const approved = {
      schemaVersion: drafted.schemaVersion,
      segments: drafted.segments.map((segment) => ({
        ...segment,
        approvedText: segment.draftText,
        approved: true,
      })),
    };
    writeNarrationScript(scriptPath, approved);

    const result = await runNarration({ projectDir, adapter });

    expect(existsSync(result.audioPath)).toBe(true);
    expect(existsSync(result.transcriptPath)).toBe(true);
    expect(result.wordsPath).not.toBeNull();
    expect(result.srtPath).not.toBeNull();
    expect(result.vttPath).not.toBeNull();
    if (result.wordsPath === null || result.srtPath === null || result.vttPath === null) {
      throw new Error('expected timestamps for the ElevenLabs adapter');
    }
    expect(existsSync(result.wordsPath)).toBe(true);
    expect(existsSync(result.srtPath)).toBe(true);
    expect(existsSync(result.vttPath)).toBe(true);

    const wordsDoc = NarrationWordsDocumentSchema.parse(
      JSON.parse(readFileSync(result.wordsPath, 'utf8')),
    );
    expect(wordsDoc.words.length).toBeGreaterThan(0);

    // AC6: word timings monotonically increase and cover the full audio duration.
    expect(() => assertMonotonicWords(wordsDoc.words, wordsDoc.durationMs)).not.toThrow();
    const first = wordsDoc.words[0];
    const last = wordsDoc.words[wordsDoc.words.length - 1];
    expect(first?.startMs).toBeGreaterThanOrEqual(0);
    expect(last?.endMs).toBeCloseTo(wordsDoc.durationMs, 0);

    // Captions show the original author-approved text, not a normalized rewrite.
    const srt = readFileSync(result.srtPath, 'utf8');
    expect(srt).toContain('1\n00:00:00,000');
    const vtt = readFileSync(result.vttPath, 'utf8');
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);

    const transcript = readFileSync(result.transcriptPath, 'utf8');
    expect(transcript).toContain('Navigate to /dashboard.');
  });

  it('throws NoRecordingError when the project has no recorded IR', async () => {
    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-narrate-e2e-'));
    cleanupDirs.push(projectDir);
    for (const subdir of PROJECT_SUBDIRS) {
      mkdirSync(path.join(projectDir, subdir), { recursive: true });
    }
    const manifest = createDefaultManifest('empty');
    writeFileSync(manifestPath(projectDir), `${JSON.stringify(manifest, null, 2)}\n`);

    const adapter = new ElevenLabsAdapter({
      apiKey: 'test-key-not-real',
      voiceId: 'voice-1',
      fetchImpl: fakeElevenLabsFetch(),
    });
    await expect(runNarration({ projectDir, adapter })).rejects.toThrow(
      /no recorded Walkthrough IR/,
    );
  });

  it('scrubs credential refs, flagged placeholders, values, and canaries before TTS and every text artifact', async () => {
    const placeholder = '[credential-placeholder]';
    const canaryValue = 'canary.value+[x]';
    const canaryText = 'CANARY-NARRATION-991';
    const flow = buildFixtureFlow();
    const inputStep = flow.steps.find((step) => step.type === 'change');
    if (inputStep === undefined || inputStep.type !== 'change')
      throw new Error('fixture input missing');
    inputStep.value = placeholder;
    inputStep.waggle.masked = true;

    const projectDir = buildFixtureProject(flow);
    writeFileSync(
      path.join(projectDir, 'credentials.json'),
      JSON.stringify({
        schemaVersion: 1,
        credentials: [
          {
            id: 'demo',
            label: 'Demo',
            secret_env: 'DEMO_SECRET',
            applies_to: { secret: ['#email'] },
          },
        ],
      }),
    );

    const synthesized: string[] = [];
    const adapter: TtsAdapter = {
      capabilities: {
        provider: 'test',
        model: 'test',
        timestamps: 'none',
        maxCharsPerRequest: 10_000,
        costPerThousandChars: 0,
        beta: false,
      },
      async synthesize(options) {
        synthesized.push(options.text);
        return {
          audio: Uint8Array.from([1, 2, 3]),
          mimeType: 'audio/mpeg',
          originalText: options.text,
          alignment: null,
          normalizedAlignment: null,
        };
      },
      estimateCostUsd: () => 0,
    };

    await expect(
      runNarration({
        projectDir,
        adapter,
        sensitiveText: { values: [canaryValue], canaries: [canaryText] },
      }),
    ).rejects.toThrow(NarrationDraftPendingApprovalError);

    const scriptPath = path.join(projectDir, 'narration', 'script.json');
    const drafted = readNarrationScript(scriptPath);
    writeNarrationScript(scriptPath, {
      ...drafted,
      segments: drafted.segments.map((segment) => ({
        ...segment,
        draftText: `Draft ${canaryValue} DEMO_SECRET ${placeholder}`,
        approvedText: `Speak ${canaryValue} ${canaryText} DEMO_SECRET ${placeholder}`,
        approved: true,
      })),
    });

    const result = await runNarration({
      projectDir,
      adapter,
      sensitiveText: { values: [canaryValue], canaries: [canaryText] },
    });
    const artifacts = [
      JSON.stringify(synthesized),
      readFileSync(result.scriptPath, 'utf8'),
      readFileSync(result.transcriptPath, 'utf8'),
    ].join('\n');

    for (const forbidden of [placeholder, canaryValue, canaryText, 'DEMO_SECRET']) {
      expect(artifacts).not.toContain(forbidden);
    }
    expect(artifacts).toContain('[REDACTED]');
  });
});
