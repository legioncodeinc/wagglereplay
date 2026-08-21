import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  boundedRedactionGeometry,
  CaptureSession,
  explicitCredentialKind,
  finalizeSession,
  type GeneratedSelector,
  maskInputValue,
} from '@waggle/extension';
import { createDefaultManifest, manifestPath } from '@waggle/ir';
import { afterEach, describe, expect, it } from 'vitest';
import { createRealFfmpegRunner } from '../../src/frames/ffmpeg-runner.js';
import { runIngest } from '../../src/pipeline/run-ingest.js';
import type { FetchLike } from '../../src/predraft/shared-http.js';

function runFfmpeg(args: readonly string[]): Buffer {
  const result = spawnSync('ffmpeg', [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr.toString('utf8')}`);
  }
  return result.stdout;
}

function writeVisibleCredentialVideo(filePath: string): void {
  runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=white:size=320x240:rate=10:duration=2',
    '-vf',
    'drawbox=x=80:y=60:w=80:h=60:color=red@1:t=fill',
    '-pix_fmt',
    'yuv420p',
    filePath,
  ]);
}

function fieldPixels(pngPath: string): Buffer {
  return runFfmpeg([
    '-i',
    pngPath,
    '-vf',
    'crop=80:60:80:60',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ]);
}

describe('credential capture to pre-draft redaction canary', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('covers marked-field pixels before any PNG is stored or sent to pre-draft', async () => {
    const canary = 'WAGGLE_TEST_ONLY_CREDENTIAL_CANARY';
    const projectDir = mkdtempSync(path.join(tmpdir(), 'waggle-redaction-project-'));
    const sessionDir = mkdtempSync(path.join(tmpdir(), 'waggle-redaction-session-'));
    cleanup.push(projectDir, sessionDir);
    writeFileSync(
      manifestPath(projectDir),
      `${JSON.stringify(createDefaultManifest('redaction-canary'), null, 2)}\n`,
      'utf8',
    );

    const selectors: GeneratedSelector[] = [{ type: 'css', value: '#opaque-field' }];
    const markings = [{ selector: '#opaque-field', kind: 'secret' as const }];
    expect(explicitCredentialKind(selectors, markings)).toBe('secret');

    const startEpochMs = 2_000_000_000_000;
    const session = new CaptureSession({
      sessionId: 'credential-canary',
      tabId: 9,
      startEpochMs,
      initialUrl: 'https://example.test/login',
      userAgent: 'vitest',
      recordedViewport: { w: 640, h: 480, dpr: 2 },
    });
    const redaction = boundedRedactionGeometry(
      { x: 160, y: 120, width: 160, height: 120 },
      session.info.recordedViewport,
    );
    session.record({
      type: 'input',
      epochMs: startEpochMs + 1_000,
      inputType: 'insertText',
      selectors,
      value: maskInputValue(canary),
      credential: true,
      redaction,
    });

    const videoPath = path.join(sessionDir, 'video.mp4');
    writeVisibleCredentialVideo(videoPath);
    const output = finalizeSession({
      session,
      generatedAt: '2026-08-21T00:00:00.000Z',
      video: {
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        anchorEpochMs: startEpochMs,
        durationMs: 2_000,
        chunkCount: 1,
      },
    });
    writeFileSync(path.join(sessionDir, 'events.jsonl'), output.eventsJsonl, 'utf8');
    writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify(output.meta), 'utf8');
    expect(output.eventsJsonl).not.toContain(canary);

    const providerBodies: string[] = [];
    const predraftFetch: FetchLike = async (_input, init) => {
      providerBodies.push(String(init?.body ?? ''));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ description: 'Entered a value.', confidence: 'high' }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    };

    const result = await runIngest({
      projectDir,
      sessionDir,
      ffmpegRunner: createRealFfmpegRunner(),
      extractionOptions: { windowMs: 0, sampleIntervalMs: 1_000 },
      predraftEnv: {
        WAGGLE_PREDRAFT_PROVIDER: 'openai',
        WAGGLE_PREDRAFT_MODEL: 'test-model',
        OPENAI_API_KEY: 'test-only-provider-key',
      },
      predraftFetch,
    });

    const stepDir = path.join(projectDir, 'steps', 'v1', 'step-000');
    const pngPaths = readdirSync(stepDir)
      .filter((name) => name.endsWith('.png'))
      .map((name) => path.join(stepDir, name));
    expect(pngPaths.length).toBeGreaterThan(0);
    for (const pngPath of pngPaths) {
      const pixels = fieldPixels(pngPath);
      expect(Math.max(...pixels)).toBe(0);
    }

    expect(providerBodies).toHaveLength(1);
    const providerBody = providerBodies[0] ?? '';
    expect(providerBody).not.toContain(canary);
    const parsedBody = JSON.parse(providerBody) as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; image_url?: { url: string } }>;
      }>;
    };
    const imageUrls = parsedBody.messages
      .flatMap((message) => message.content)
      .flatMap((part) => (part.image_url ? [part.image_url.url] : []));
    expect(imageUrls.length).toBeGreaterThan(0);
    const persistedBase64 = new Set(
      pngPaths.map((pngPath) => readFileSync(pngPath).toString('base64')),
    );
    for (const imageUrl of imageUrls) {
      expect(imageUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(persistedBase64.has(imageUrl.slice('data:image/png;base64,'.length))).toBe(true);
    }
    expect(readFileSync(result.predraftFilePath, 'utf8')).not.toContain(canary);
  }, 60_000);
});
