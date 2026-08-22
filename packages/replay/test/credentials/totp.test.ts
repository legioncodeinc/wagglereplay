// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { decodeBase32Strict, generateTotp } from '../../src/credentials/totp.js';

const RFC_6238_VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1_111_111_109, '07081804', '68084774', '25091201'],
  [1_111_111_111, '14050471', '67062674', '99943326'],
  [1_234_567_890, '89005924', '91819424', '93441116'],
  [2_000_000_000, '69279037', '90698825', '38618901'],
  [20_000_000_000, '65353130', '77737706', '47863826'],
] as const;

const RFC_SECRET_SHA1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const RFC_SECRET_SHA256 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA====';
const RFC_SECRET_SHA512 =
  'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNA=';

describe('RFC 6238 TOTP', () => {
  it.each(RFC_6238_VECTORS)(
    'matches the published vectors at Unix time %i',
    (unixSeconds, sha1, sha256, sha512) => {
      const base = { timeMs: unixSeconds * 1000, digits: 8 } as const;
      expect(generateTotp(RFC_SECRET_SHA1, { ...base, algorithm: 'sha1' })).toBe(sha1);
      expect(generateTotp(RFC_SECRET_SHA256, { ...base, algorithm: 'sha256' })).toBe(sha256);
      expect(generateTotp(RFC_SECRET_SHA512, { ...base, algorithm: 'sha512' })).toBe(sha512);
    },
  );

  it('uses the standard 30 second, 6 digit, SHA1 defaults', () => {
    expect(generateTotp(RFC_SECRET_SHA1, { timeMs: 59_000 })).toBe('287082');
  });

  it.each(['', 'mzxw6===', 'MZXW6 YQ=', 'MZXW6Y', 'AB', 'MZXW6YQ===='])(
    'strictly rejects malformed Base32: %s',
    (seed) => {
      expect(() => decodeBase32Strict(seed)).toThrow();
    },
  );

  it('accepts canonical padded and unpadded Base32', () => {
    expect(Buffer.from(decodeBase32Strict('MZXW6YQ='))).toEqual(Buffer.from('foob'));
    expect(Buffer.from(decodeBase32Strict('MZXW6YQ'))).toEqual(Buffer.from('foob'));
  });
});
