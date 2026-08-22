// SPDX-License-Identifier: AGPL-3.0-or-later
import type { R2Config } from './env.js';
import {
  buildStringToSign,
  canonicalUriForKey,
  compareHeaderNames,
  credentialScope,
  deriveSigningKey,
  sha256Hex,
  signRequest,
  toAmzDate,
} from './sigv4.js';

/**
 * A minimal S3-compatible client for Cloudflare R2's PutObject call, built
 * against an injectable transport exactly like `@waggle/narrate`'s TTS
 * adapters (`options.fetchImpl`, defaulting to the real global `fetch`):
 * this environment holds no live R2 credentials, so every assertion this
 * package's test suite makes about request construction, signing, and
 * error handling runs against a hand-built `Response`, and only the
 * network call itself is ever mocked. See `README.md` for exactly which
 * assertion still needs a live bucket to fully verify.
 *
 * R2's S3-compatible API: https://developers.cloudflare.com/r2/api/s3/api/
 * Region is always `auto`, service is always `s3` (Cloudflare's own
 * documented values for SigV4 against R2).
 */

export const R2_REGION = 'auto';
export const R2_SERVICE = 's3';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class R2UploadError extends Error {
  readonly status: number;
  readonly key: string;
  constructor(key: string, status: number, bodySnippet: string) {
    super(`R2 PUT of "${key}" failed with HTTP ${status}: ${redactR2ErrorBody(bodySnippet)}`);
    this.name = 'R2UploadError';
    this.status = status;
    this.key = key;
  }
}

/**
 * ADR-008's no-credentials-in-logs rule, applied to R2 error bodies (2026-08-21
 * ruling, recorded in the ledger's blocked register): an S3
 * SignatureDoesNotMatch body echoes AWSAccessKeyId, StringToSign, and
 * CanonicalRequest, and a key id is credential material even though the
 * secret itself never appears. Those fields are redacted before the snippet
 * reaches any error message that might be printed or logged.
 */
export function redactR2ErrorBody(snippet: string): string {
  return snippet
    .replace(/(<(AWSAccessKeyId)>)([^<]*)(<\/\2>)/g, '$1[REDACTED]$4')
    .replace(/("AWSAccessKeyId"\s*:\s*")([^"]*)(")/g, '$1[REDACTED]$3')
    .replace(/(<(StringToSign|CanonicalRequest)>)([\s\S]*?)(<\/\2>)/g, '$1[REDACTED]$4')
    .replace(/("(StringToSign|CanonicalRequest)"\s*:\s*")([^"]*)(")/g, '$1[REDACTED]$4');
}

export interface R2ClientOptions {
  readonly fetchImpl?: FetchLike;
  /** Injected for deterministic tests; defaults to the current time. */
  readonly now?: () => Date;
}

export interface PutObjectOptions {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
}

export interface PutObjectResult {
  readonly key: string;
  /** The bucket-relative R2 object URL (path-style, private unless the bucket is public). */
  readonly objectUrl: string;
  /** The public URL, built from `WAGGLE_R2_PUBLIC_BASE_URL`, if the caller configured one. */
  readonly publicUrl: string;
}

export class R2Client {
  private readonly config: R2Config;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;

  constructor(config: R2Config, options: R2ClientOptions = {}) {
    this.config = config;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
  }

  private get host(): string {
    return `${this.config.accountId}.r2.cloudflarestorage.com`;
  }

  private get endpoint(): string {
    return `https://${this.host}`;
  }

  async putObject(options: PutObjectOptions): Promise<PutObjectResult> {
    const { amzDate, dateStamp } = toAmzDate(this.now());
    const canonicalUri = canonicalUriForKey(`${this.config.bucket}/${options.key}`);
    const payloadHash = sha256Hex(options.body);

    const headers = new Map<string, string>([
      ['content-type', options.contentType],
      ['host', this.host],
      ['x-amz-content-sha256', payloadHash],
      ['x-amz-date', amzDate],
    ]);
    // Same comparator `buildCanonicalRequest` sorts the header block with,
    // so `SignedHeaders` can never describe a different order than the
    // canonical request it is signed alongside.
    const signedHeaders = [...headers.keys()].sort(compareHeaderNames).join(';');

    const authorization = signRequest({
      method: 'PUT',
      canonicalUri,
      canonicalQueryString: '',
      headers,
      signedHeaders,
      hashedPayload: payloadHash,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: R2_REGION,
      service: R2_SERVICE,
      amzDate,
      dateStamp,
    });

    const response = await this.fetchImpl(`${this.endpoint}${canonicalUri}`, {
      method: 'PUT',
      headers: {
        'content-type': options.contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        authorization,
      },
      // A plain `Uint8Array` view rather than the `Buffer` itself: Node's
      // own fetch types and the DOM lib's `BodyInit` (pulled in wherever a
      // consuming package's tsconfig also targets DOM, e.g. `@waggle/cli`
      // for its `chrome` types) do not agree on whether a `Buffer` is
      // assignable to a request body, but both agree on `Uint8Array`.
      body: new Uint8Array(options.body),
    });

    if (!response.ok) {
      const bodySnippet = (await response.text().catch(() => '')).slice(0, 500);
      throw new R2UploadError(options.key, response.status, bodySnippet);
    }

    return {
      key: options.key,
      objectUrl: `${this.endpoint}${canonicalUri}`,
      publicUrl: `${this.config.publicBaseUrl}/${options.key}`,
    };
  }
}

/**
 * Re-exported so a caller (or a test that wants to build a stand-alone
 * signature without a full `R2Client`) does not have to reach into
 * `./sigv4.js` directly for the pieces `putObject` composes above.
 */
export { buildStringToSign, credentialScope, deriveSigningKey, sha256Hex };
