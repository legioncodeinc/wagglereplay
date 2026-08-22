// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest';
import { R2Client, R2UploadError } from '../src/r2/client.js';
import { exampleR2Config } from './r2-fixtures.js';

/**
 * prd-008 AC3: "Build the uploader against an INJECTABLE client ... Fully
 * implement request construction, error handling, and the URL layout, and
 * unit-test it against a mock client exercising the real uploader code."
 * Every test here calls the real `R2Client.putObject`, including its real
 * SigV4 signing; only the transport (`fetchImpl`) is a mock. See
 * README.md for exactly which assertion still needs a live R2 bucket.
 */
const CONFIG = exampleR2Config();

const FIXED_NOW = () => new Date('2026-03-14T09:26:53.123Z');

/** `fetchImpl.mock.calls[n]`, typed, since vitest infers `[]` for a zero-arg mock implementation. */
function lastCall(fetchImpl: { mock: { calls: unknown[][] } }): [string, RequestInit] {
  const call = fetchImpl.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('fetchImpl was never called');
  }
  return call as unknown as [string, RequestInit];
}

function headerValue(init: RequestInit, name: string): string {
  const headers = init.headers as Record<string, string>;
  const value = headers[name];
  if (value === undefined) {
    throw new Error(`missing header "${name}"`);
  }
  return value;
}

describe('AC3: R2Client.putObject', () => {
  it('PUTs to the correct R2 endpoint and path-style object URL', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    await client.putObject({
      key: 'v1/index.html',
      body: Buffer.from('<html></html>'),
      contentType: 'text/html; charset=utf-8',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = lastCall(fetchImpl);
    expect(url).toBe('https://acct123.r2.cloudflarestorage.com/my-bucket/v1/index.html');
    expect(init.method).toBe('PUT');
    expect(Buffer.from(init.body as Uint8Array)).toEqual(Buffer.from('<html></html>'));
  });

  it('signs the request with a well-formed SigV4 Authorization header', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    await client.putObject({
      key: 'v1/walkthrough.v1.default.16x9.mp4',
      body: Buffer.from('fake-mp4-bytes'),
      contentType: 'video/mp4',
    });

    const [, init] = lastCall(fetchImpl);
    expect(headerValue(init, 'authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260314\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
    expect(headerValue(init, 'x-amz-date')).toBe('20260314T092653Z');
    expect(headerValue(init, 'content-type')).toBe('video/mp4');
    expect(headerValue(init, 'x-amz-content-sha256')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a signature that changes when the object body changes', async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(headerValue(init, 'authorization'));
      return new Response('', { status: 200 });
    });
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    await client.putObject({ key: 'a.txt', body: Buffer.from('one'), contentType: 'text/plain' });
    await client.putObject({ key: 'a.txt', body: Buffer.from('two'), contentType: 'text/plain' });

    expect(seen[0]).not.toBe(seen[1]);
  });

  it('returns both the raw object URL and the configured public URL', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    const result = await client.putObject({
      key: 'v1/index.html',
      body: Buffer.from('x'),
      contentType: 'text/html',
    });

    expect(result.objectUrl).toBe(
      'https://acct123.r2.cloudflarestorage.com/my-bucket/v1/index.html',
    );
    expect(result.publicUrl).toBe('https://cdn.example.com/v1/index.html');
  });

  it('throws R2UploadError with the status and a body snippet on a non-2xx response', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<Error><Code>AccessDenied</Code></Error>', {
          status: 403,
          statusText: 'Forbidden',
        }),
    );
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    let caught: unknown;
    try {
      await client.putObject({
        key: 'v1/index.html',
        body: Buffer.from('x'),
        contentType: 'text/html',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(R2UploadError);
    const uploadError = caught as R2UploadError;
    expect(uploadError.status).toBe(403);
    expect(uploadError.key).toBe('v1/index.html');
    expect(uploadError.message).toContain('403');
    expect(uploadError.message).toContain('AccessDenied');
  });

  it('redacts AWSAccessKeyId and StringToSign from a SignatureDoesNotMatch body before the message exists', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          '<Error><Code>SignatureDoesNotMatch</Code>' +
            '<AWSAccessKeyId>EXAMPLEKEYIDNOTREAL00</AWSAccessKeyId>' +
            '<StringToSign>AWS4-HMAC-SHA256\nPUT\n/v1/index.html</StringToSign>' +
            '<CanonicalRequest>PUT\n/v1/index.html\nhost:acct.r2</CanonicalRequest>' +
            '</Error>',
          { status: 403, statusText: 'Forbidden' },
        ),
    );
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    let caught: unknown;
    try {
      await client.putObject({
        key: 'v1/index.html',
        body: Buffer.from('x'),
        contentType: 'text/html',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(R2UploadError);
    const message = (caught as R2UploadError).message;
    expect(message).toContain('SignatureDoesNotMatch');
    expect(message).not.toContain('EXAMPLEKEYIDNOTREAL00');
    expect(message).not.toContain('AWS4-HMAC-SHA256');
    expect(message).toContain('[REDACTED]');
  });

  it('never throws for a network-layer failure without surfacing it as an unlabeled rejection', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    await expect(
      client.putObject({ key: 'v1/index.html', body: Buffer.from('x'), contentType: 'text/html' }),
    ).rejects.toThrow('fetch failed');
  });

  it('percent-encodes a key containing spaces in the request URL', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const client = new R2Client(CONFIG, { fetchImpl, now: FIXED_NOW });

    await client.putObject({
      key: 'a walkthrough/file.mp4',
      body: Buffer.from('x'),
      contentType: 'video/mp4',
    });

    const [url] = lastCall(fetchImpl);
    expect(url).toBe('https://acct123.r2.cloudflarestorage.com/my-bucket/a%20walkthrough/file.mp4');
  });
});
