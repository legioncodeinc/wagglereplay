// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** The one hash algorithm this package computes and records; kept as a named constant so a sidecar's `checksum.algorithm` field is never a magic string. */
export const CHECKSUM_ALGORITHM = 'sha256';

/**
 * Streams `filePath` through SHA-256 rather than reading it whole into
 * memory: renders are finished MP4s, routinely tens to hundreds of
 * megabytes, and this function runs once per render per `export`/`clean`
 * invocation.
 */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(CHECKSUM_ALGORITHM);
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    hash.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
