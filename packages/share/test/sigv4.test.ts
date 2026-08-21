import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalRequest,
  buildStringToSign,
  canonicalUriForKey,
  credentialScope,
  deriveSigningKey,
  encodeUriSegment,
  sha256Hex,
  signRequest,
  toAmzDate,
} from '../src/r2/sigv4.js';

/**
 * The HMAC-SHA-256 and SHA-256 primitives against RFC 4231's published
 * test vectors, independent of anything this package invented: this is
 * the one piece of ground truth in this suite that comes from a spec
 * rather than from re-running our own code and checking it agrees with
 * itself.
 * https://www.rfc-editor.org/rfc/rfc4231 (Test Case 2).
 */
describe('sigv4 primitives against RFC 4231 test vectors', () => {
  it('HMAC-SHA-256("Jefe", "what do ya want for nothing?") matches the published digest', () => {
    const digest = createHmac('sha256', Buffer.from('Jefe', 'utf8'))
      .update('what do ya want for nothing?', 'utf8')
      .digest('hex');
    expect(digest).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });

  it('SHA-256 of the empty string matches the well-known digest', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('canonical request and signing key construction', () => {
  it('builds a canonical request in the documented field order', () => {
    const headers = new Map([
      ['host', 'example.r2.cloudflarestorage.com'],
      ['x-amz-date', '20260101T000000Z'],
    ]);
    const canonicalRequest = buildCanonicalRequest({
      method: 'PUT',
      canonicalUri: '/bucket/key.txt',
      canonicalQueryString: '',
      headers,
      signedHeaders: 'host;x-amz-date',
      hashedPayload: sha256Hex('hello'),
    });

    const lines = canonicalRequest.split('\n');
    expect(lines[0]).toBe('PUT');
    expect(lines[1]).toBe('/bucket/key.txt');
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('host:example.r2.cloudflarestorage.com');
    expect(lines[4]).toBe('x-amz-date:20260101T000000Z');
    expect(lines[5]).toBe('');
    expect(lines[6]).toBe('host;x-amz-date');
    expect(lines[7]).toBe(sha256Hex('hello'));
  });

  it('sorts headers alphabetically regardless of insertion order', () => {
    const headers = new Map([
      ['x-amz-date', '20260101T000000Z'],
      ['content-type', 'text/plain'],
      ['host', 'example.r2.cloudflarestorage.com'],
    ]);
    const canonicalRequest = buildCanonicalRequest({
      method: 'PUT',
      canonicalUri: '/bucket/key.txt',
      canonicalQueryString: '',
      headers,
      signedHeaders: 'content-type;host;x-amz-date',
      hashedPayload: sha256Hex(''),
    });
    const headerLines = canonicalRequest.split('\n').slice(3, 6);
    expect(headerLines).toEqual([
      'content-type:text/plain',
      'host:example.r2.cloudflarestorage.com',
      'x-amz-date:20260101T000000Z',
    ]);
  });

  it('credentialScope joins date, region, service, and the fixed terminator', () => {
    expect(credentialScope('20260101', 'auto', 's3')).toBe('20260101/auto/s3/aws4_request');
  });

  it('toAmzDate derives amzDate and dateStamp from one instant so they can never disagree', () => {
    const { amzDate, dateStamp } = toAmzDate(new Date('2026-03-14T09:26:53.123Z'));
    expect(amzDate).toBe('20260314T092653Z');
    expect(dateStamp).toBe('20260314');
  });

  it('deriveSigningKey is deterministic for the same inputs and changes when the secret changes', () => {
    const keyA = deriveSigningKey('secret-one', '20260101', 'auto', 's3');
    const keyAAgain = deriveSigningKey('secret-one', '20260101', 'auto', 's3');
    const keyB = deriveSigningKey('secret-two', '20260101', 'auto', 's3');
    expect(keyA.equals(keyAAgain)).toBe(true);
    expect(keyA.equals(keyB)).toBe(false);
  });

  it('buildStringToSign hashes the canonical request rather than embedding it raw', () => {
    const canonicalRequest = 'PUT\n/bucket/key\n\nhost:h\n\nhost\n' + sha256Hex('');
    const stringToSign = buildStringToSign(
      '20260101T000000Z',
      '20260101',
      'auto',
      's3',
      canonicalRequest,
    );
    const lines = stringToSign.split('\n');
    expect(lines[0]).toBe('AWS4-HMAC-SHA256');
    expect(lines[1]).toBe('20260101T000000Z');
    expect(lines[2]).toBe('20260101/auto/s3/aws4_request');
    expect(lines[3]).toBe(sha256Hex(canonicalRequest));
  });

  it('encodeUriSegment percent-encodes reserved characters including the AWS-specific set', () => {
    expect(encodeUriSegment('a b')).toBe('a%20b');
    expect(encodeUriSegment("o'clock")).toBe('o%27clock');
    expect(encodeUriSegment('walkthrough.v1.default.16x9.mp4')).toBe(
      'walkthrough.v1.default.16x9.mp4',
    );
  });

  it('canonicalUriForKey encodes each path segment independently, preserving the slashes', () => {
    expect(canonicalUriForKey('bucket/share/v1/index.html')).toBe('/bucket/share/v1/index.html');
    expect(canonicalUriForKey('bucket/a walkthrough/file.mp4')).toBe(
      '/bucket/a%20walkthrough/file.mp4',
    );
  });
});

describe('signRequest', () => {
  const baseInput = {
    method: 'PUT',
    canonicalUri: '/bucket/share/v1/index.html',
    canonicalQueryString: '',
    headers: new Map([
      ['content-type', 'text/html; charset=utf-8'],
      ['host', 'account.r2.cloudflarestorage.com'],
      ['x-amz-content-sha256', sha256Hex('<html></html>')],
      ['x-amz-date', '20260314T092653Z'],
    ]),
    signedHeaders: 'content-type;host;x-amz-content-sha256;x-amz-date',
    hashedPayload: sha256Hex('<html></html>'),
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'auto',
    service: 's3',
    amzDate: '20260314T092653Z',
    dateStamp: '20260314',
  };

  it('produces a well-formed Authorization header', () => {
    const authorization = signRequest(baseInput);
    expect(authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260314\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it('is deterministic for identical inputs', () => {
    expect(signRequest(baseInput)).toBe(signRequest(baseInput));
  });

  it('changes when the secret access key changes', () => {
    const other = signRequest({ ...baseInput, secretAccessKey: 'a-completely-different-secret' });
    expect(other).not.toBe(signRequest(baseInput));
  });

  it('changes when the payload hash changes (the signature covers the body)', () => {
    const otherHash = sha256Hex('<html>different</html>');
    const other = signRequest({ ...baseInput, hashedPayload: otherHash });
    expect(other).not.toBe(signRequest(baseInput));
  });

  it('changes when the request date changes', () => {
    const other = signRequest({ ...baseInput, amzDate: '20260315T000000Z', dateStamp: '20260315' });
    expect(other).not.toBe(signRequest(baseInput));
  });
});
