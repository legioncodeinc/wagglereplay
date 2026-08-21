import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { R2Config } from '../src/r2/env.js';
import { uploadBundle } from '../src/r2/upload-bundle.js';
import { makeTempDir } from './fixtures.js';

const CONFIG: R2Config = {
  accountId: 'acct123',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'my-bucket',
  publicBaseUrl: 'https://cdn.example.com',
};

function stageBundle(): string {
  const dir = makeTempDir('upload-bundle');
  writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  writeFileSync(path.join(dir, 'poster.jpg'), 'fake-jpeg');
  writeFileSync(path.join(dir, 'captions.vtt'), 'WEBVTT\n');
  writeFileSync(path.join(dir, 'walkthrough.v1.default.16x9.mp4'), 'fake-mp4');
  return dir;
}

describe('AC3: uploadBundle', () => {
  it('uploads every file in the bundle under the given prefix and prints a coherent URL layout', async () => {
    const bundleDir = stageBundle();
    const seenContentTypes: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      seenContentTypes.push(headers['content-type'] ?? '');
      return new Response('', { status: 200 });
    });

    const result = await uploadBundle(bundleDir, 'demo/v1', CONFIG, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.baseUrl).toBe('https://cdn.example.com/demo/v1');
    expect(result.indexUrl).toBe('https://cdn.example.com/demo/v1/index.html');

    const keys = result.uploaded.map((entry) => entry.key).sort();
    expect(keys).toEqual([
      'demo/v1/captions.vtt',
      'demo/v1/index.html',
      'demo/v1/poster.jpg',
      'demo/v1/walkthrough.v1.default.16x9.mp4',
    ]);

    expect(seenContentTypes).toContain('text/html; charset=utf-8');
    expect(seenContentTypes).toContain('video/mp4');
    expect(seenContentTypes).toContain('text/vtt; charset=utf-8');
    expect(seenContentTypes).toContain('image/jpeg');
  });

  it('stops and surfaces the error on the first failed upload rather than partially succeeding silently', async () => {
    const bundleDir = stageBundle();
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 2) {
        return new Response('nope', { status: 500 });
      }
      return new Response('', { status: 200 });
    });

    await expect(uploadBundle(bundleDir, 'demo/v1', CONFIG, { fetchImpl })).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it('does not descend into subdirectories (a bundle is flat)', async () => {
    const bundleDir = stageBundle();
    mkdirSync(path.join(bundleDir, 'nested'), { recursive: true });
    writeFileSync(path.join(bundleDir, 'nested', 'ignored.txt'), 'x');

    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const result = await uploadBundle(bundleDir, 'demo/v1', CONFIG, { fetchImpl });

    expect(result.uploaded.some((entry) => entry.key.includes('ignored.txt'))).toBe(false);
  });
});
