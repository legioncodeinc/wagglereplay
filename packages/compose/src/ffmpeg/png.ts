// SPDX-License-Identifier: AGPL-3.0-or-later
import { deflateSync } from 'node:zlib';

/**
 * A minimal, deterministic 8-bit RGBA PNG encoder.
 *
 * Why hand-rolled rather than a dependency or an ffmpeg round trip:
 *
 *  - The cursor and ripple sprites are brand-kit-coloured, so they cannot
 *    be committed as fixtures; they have to be generated per render.
 *  - Generating them THROUGH ffmpeg would mean a second process launch per
 *    render and drawing an arrow with `geq` expressions, which is far
 *    harder to read and to test than a rasterizer.
 *  - AC7's idempotency claim needs the sprite bytes to be identical across
 *    runs. `deflateSync` at a pinned level is deterministic, and nothing
 *    here reads a clock, so the encoded bytes are a pure function of the
 *    bitmap. PNG's optional `tIME` chunk, the one part of the format that
 *    would break that, is simply never written.
 */

/** Pinned so the compressed bytes never move under us. */
const DEFLATE_LEVEL = 9;

export interface Bitmap {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, 4 bytes per pixel, length `width * height * 4`. */
  readonly data: Uint8Array;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    const index = (crc ^ byte) & 0xff;
    crc = ((CRC_TABLE[index] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, payload: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, 'latin1');
  const body = Buffer.concat([typeBytes, Buffer.from(payload)]);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([header, body, crc]);
}

/** Encodes an RGBA bitmap as a PNG. */
export function encodePng(bitmap: Bitmap): Buffer {
  const { width, height, data } = bitmap;
  const expected = width * height * 4;
  if (data.length !== expected) {
    throw new RangeError(
      `Bitmap data length ${data.length} does not match ${width}x${height} RGBA (${expected} bytes).`,
    );
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // colour type 6: truecolour with alpha
  ihdr.writeUInt8(0, 10); // deflate
  ihdr.writeUInt8(0, 11); // adaptive filtering
  ihdr.writeUInt8(0, 12); // no interlace

  // Filter type 0 (None) on every scanline. Costs a few bytes over an
  // adaptive filter and keeps the encoder trivially auditable.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: DEFLATE_LEVEL })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** An all-transparent bitmap ready to be painted into. */
export function createBitmap(width: number, height: number): Bitmap {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`Bitmap dimensions must be positive, received ${width}x${height}.`);
  }
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Writes one pixel, with `alpha` in 0..1. Out-of-range coordinates are ignored. */
export function setPixel(
  bitmap: Bitmap,
  x: number,
  y: number,
  rgb: { r: number; g: number; b: number },
  alpha: number,
): void {
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) {
    return;
  }
  const offset = (y * bitmap.width + x) * 4;
  bitmap.data[offset] = rgb.r;
  bitmap.data[offset + 1] = rgb.g;
  bitmap.data[offset + 2] = rgb.b;
  bitmap.data[offset + 3] = Math.max(0, Math.min(255, Math.round(alpha * 255)));
}
