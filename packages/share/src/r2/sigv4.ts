import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 request signing, hand-rolled rather than pulled
 * in via an AWS SDK.
 *
 * R2's S3-compatible API accepts SigV4 with region `auto` and service
 * `s3` (Cloudflare's own documented values); this package has exactly one
 * caller of this algorithm (`client.ts`'s `putObject`), and pulling in
 * `@aws-sdk/client-s3` and its credential-provider chain for one signed
 * PUT would be a large, mostly-unused dependency for a workspace that
 * otherwise hand-builds its HTTP clients (see `@waggle/narrate`'s
 * ElevenLabs/Deepgram adapters for the same choice, made for the same
 * reason). Every step below follows AWS's published SigV4 algorithm
 * (docs.aws.amazon.com/general/latest/gr/sigv4-signing.html); the HMAC and
 * SHA-256 primitives are exercised in `test/sigv4.test.ts` against the
 * published RFC 4231 test vectors, independent of this module's own
 * higher-level assertions.
 */

export const AWS4_REQUEST = 'aws4_request';
export const SIGNING_ALGORITHM = 'AWS4-HMAC-SHA256';

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function hmacHex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

/** `YYYYMMDD'T'HHMMSS'Z'` and its date-only prefix, both derived from one instant so they can never disagree. */
export interface AmzDate {
  readonly amzDate: string;
  readonly dateStamp: string;
}

export function toAmzDate(date: Date): AmzDate {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

export interface CanonicalRequestInput {
  readonly method: string;
  /** Already percent-encoded per-segment; this module does not encode it. */
  readonly canonicalUri: string;
  /** Pre-sorted `key=value` pairs joined with `&`, or `''` for none. */
  readonly canonicalQueryString: string;
  /** Lowercased header name to trimmed value, for exactly the headers being signed. */
  readonly headers: ReadonlyMap<string, string>;
  /** Lowercased, sorted, semicolon-joined header names; must match `headers`'s keys. */
  readonly signedHeaders: string;
  /** Hex SHA-256 of the request body, or `UNSIGNED-PAYLOAD`. */
  readonly hashedPayload: string;
}

/**
 * SigV4 orders signed header names by BYTE value, not by locale.
 *
 * `localeCompare` is the wrong comparator here on two counts: ICU treats
 * `-` as variable-weight punctuation, so hyphenated header names can order
 * differently than their bytes do (`x-amz-meta-z` sorts before
 * `x-amz-metaa` by byte, after it by locale), and the result depends on
 * which ICU data the running Node was built with, so the same request
 * could sign differently on two machines. Both matter because
 * `signedHeaders` is built separately by the caller; if the two orders
 * disagree, the canonical header block no longer describes
 * `SignedHeaders` and the request is rejected as `SignatureDoesNotMatch`.
 * Exported so callers derive `signedHeaders` from the same comparator.
 */
export function compareHeaderNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildCanonicalRequest(input: CanonicalRequestInput): string {
  const canonicalHeaders = [...input.headers.entries()]
    .sort(([a], [b]) => compareHeaderNames(a, b))
    .map(([name, value]) => `${name}:${value}\n`)
    .join('');

  return [
    input.method,
    input.canonicalUri,
    input.canonicalQueryString,
    canonicalHeaders,
    input.signedHeaders,
    input.hashedPayload,
  ].join('\n');
}

export function credentialScope(dateStamp: string, region: string, service: string): string {
  return `${dateStamp}/${region}/${service}/${AWS4_REQUEST}`;
}

export function buildStringToSign(
  amzDate: string,
  dateStamp: string,
  region: string,
  service: string,
  canonicalRequest: string,
): string {
  return [
    SIGNING_ALGORITHM,
    amzDate,
    credentialScope(dateStamp, region, service),
    sha256Hex(canonicalRequest),
  ].join('\n');
}

/** The `kDate -> kRegion -> kService -> kSigning` HMAC chain from the SigV4 spec. */
export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${secretAccessKey}`, 'utf8'), dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, AWS4_REQUEST);
}

export interface SignRequestInput extends CanonicalRequestInput {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly service: string;
  readonly amzDate: string;
  readonly dateStamp: string;
}

/** Returns the `Authorization` header value for a fully-described request. */
export function signRequest(input: SignRequestInput): string {
  const canonicalRequest = buildCanonicalRequest(input);
  const stringToSign = buildStringToSign(
    input.amzDate,
    input.dateStamp,
    input.region,
    input.service,
    canonicalRequest,
  );
  const signingKey = deriveSigningKey(
    input.secretAccessKey,
    input.dateStamp,
    input.region,
    input.service,
  );
  const signature = hmacHex(signingKey, stringToSign);
  const scope = credentialScope(input.dateStamp, input.region, input.service);

  return `${SIGNING_ALGORITHM} Credential=${input.accessKeyId}/${scope}, SignedHeaders=${input.signedHeaders}, Signature=${signature}`;
}

/** Percent-encodes one path segment per SigV4's canonical-URI rules (RFC 3986 unreserved set kept literal). */
export function encodeUriSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Builds a SigV4 canonical URI from an object key, encoding each `/`-separated segment independently. */
export function canonicalUriForKey(key: string): string {
  const segments = key.split('/').map(encodeUriSegment);
  return `/${segments.join('/')}`;
}
