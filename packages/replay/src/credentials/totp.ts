import { createHmac } from 'node:crypto';

export const DEFAULT_TOTP_DIGITS = 6;
export const DEFAULT_TOTP_PERIOD_SECONDS = 30;
export const DEFAULT_TOTP_ALGORITHM = 'sha1' as const;

export type TotpAlgorithm = 'sha1' | 'sha256' | 'sha512';

export interface GenerateTotpOptions {
  /** Unix epoch time in milliseconds. Defaults to Date.now(). */
  readonly timeMs?: number;
  readonly periodSeconds?: number;
  readonly digits?: number;
  readonly algorithm?: TotpAlgorithm;
}

export class TotpInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TotpInputError';
  }
}

const BASE32_VALUE = new Map(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('').map((character, index) => [character, index]),
);
const VALID_UNPADDED_REMAINDERS = new Set([0, 2, 4, 5, 7]);
const EXPECTED_PADDING_BY_REMAINDER = new Map([
  [0, 0],
  [2, 6],
  [4, 4],
  [5, 3],
  [7, 1],
]);

/**
 * Strict RFC 4648 Base32 decoder for TOTP seeds. It rejects lowercase,
 * whitespace, misplaced padding, impossible encoded lengths, and non-zero
 * trailing bits instead of silently normalizing a malformed seed.
 */
export function decodeBase32Strict(encoded: string): Uint8Array {
  if (encoded.length === 0) {
    throw new TotpInputError('TOTP seed must be non-empty Base32 text.');
  }

  const firstPadding = encoded.indexOf('=');
  const data = firstPadding === -1 ? encoded : encoded.slice(0, firstPadding);
  const padding = firstPadding === -1 ? '' : encoded.slice(firstPadding);

  if (!/^[A-Z2-7]+$/.test(data) || (padding !== '' && !/^=+$/.test(padding))) {
    throw new TotpInputError('TOTP seed must use uppercase RFC 4648 Base32 characters.');
  }

  const remainder = data.length % 8;
  if (!VALID_UNPADDED_REMAINDERS.has(remainder)) {
    throw new TotpInputError('TOTP seed has an impossible Base32 length.');
  }
  if (padding !== '') {
    const expectedPadding = EXPECTED_PADDING_BY_REMAINDER.get(remainder);
    if (encoded.length % 8 !== 0 || padding.length !== expectedPadding) {
      throw new TotpInputError('TOTP seed has invalid Base32 padding.');
    }
  }

  const decoded: number[] = [];
  let accumulator = 0;
  let bitCount = 0;
  for (const character of data) {
    const value = BASE32_VALUE.get(character);
    if (value === undefined) {
      throw new TotpInputError('TOTP seed contains an invalid Base32 character.');
    }
    accumulator = (accumulator << 5) | value;
    bitCount += 5;
    while (bitCount >= 8) {
      bitCount -= 8;
      decoded.push((accumulator >> bitCount) & 0xff);
      accumulator &= bitCount === 0 ? 0 : (1 << bitCount) - 1;
    }
  }

  if (bitCount > 0 && accumulator !== 0) {
    throw new TotpInputError('TOTP seed has non-zero trailing Base32 bits.');
  }
  if (decoded.length === 0) {
    throw new TotpInputError('TOTP seed must decode to at least one byte.');
  }
  return Uint8Array.from(decoded);
}

/** RFC 6238 TOTP with RFC defaults: HMAC-SHA1, 30 second period, 6 digits. */
export function generateTotp(secretBase32: string, options: GenerateTotpOptions = {}): string {
  const timeMs = options.timeMs ?? Date.now();
  const periodSeconds = options.periodSeconds ?? DEFAULT_TOTP_PERIOD_SECONDS;
  const digits = options.digits ?? DEFAULT_TOTP_DIGITS;
  const algorithm = options.algorithm ?? DEFAULT_TOTP_ALGORITHM;

  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new TotpInputError('TOTP timeMs must be a non-negative finite number.');
  }
  if (!Number.isSafeInteger(periodSeconds) || periodSeconds <= 0) {
    throw new TotpInputError('TOTP periodSeconds must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(digits) || digits < 6 || digits > 10) {
    throw new TotpInputError('TOTP digits must be a safe integer from 6 through 10.');
  }

  const secret = decodeBase32Strict(secretBase32);
  const counter = BigInt(Math.floor(timeMs / 1000 / periodSeconds));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);

  const digest = createHmac(algorithm, secret).update(counterBytes).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  const modulus = 10 ** digits;
  return String(binary % modulus).padStart(digits, '0');
}
