// SPDX-License-Identifier: AGPL-3.0-or-later
import { InputRedactionGeometrySchema } from '@waggle/extension';
import { z } from 'zod';
import { FrameExtractionError } from '../errors.js';

export const FrameRedactionSchema = z.strictObject({
  /** Milliseconds from the recording anchor at which this field may first contain a credential. */
  startRelMs: z.number().nonnegative(),
  geometry: InputRedactionGeometrySchema,
});

export type FrameRedaction = z.infer<typeof FrameRedactionSchema>;

function finiteRatio(value: number, denominator: number): string {
  const ratio = value / denominator;
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new FrameExtractionError('Credential redaction geometry could not be projected safely.');
  }
  return ratio.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

/**
 * Validates the complete redaction set before extraction creates any PNG.
 * A malformed or missing credential rectangle therefore fails closed before
 * a potentially sensitive frame can be persisted.
 */
export function validateFrameRedactions(redactions: readonly FrameRedaction[]): FrameRedaction[] {
  const result = z.array(FrameRedactionSchema).safeParse(redactions);
  if (!result.success) {
    throw new FrameExtractionError('Credential frame redaction metadata is missing or malformed.');
  }
  return result.data;
}

/** Selects boxes active at the exact source-frame timestamp. */
export function activeFrameRedactions(
  redactions: readonly FrameRedaction[],
  frameRelMs: number,
): FrameRedaction[] {
  return redactions.filter((redaction) => redaction.startRelMs <= frameRelMs);
}

/**
 * Builds an opaque ffmpeg drawbox chain. Ratios project recorded CSS pixels
 * to the decoded frame's actual width and height (`iw`/`ih`), so DPR and
 * encoder resolution changes cannot move a box off its field.
 */
export function buildRedactionFilter(redactions: readonly FrameRedaction[]): string | null {
  if (redactions.length === 0) return null;
  return redactions
    .map(({ geometry }) => {
      const { rect, viewport } = geometry;
      const x = finiteRatio(rect.x, viewport.w);
      const y = finiteRatio(rect.y, viewport.h);
      const w = finiteRatio(rect.w, viewport.w);
      const h = finiteRatio(rect.h, viewport.h);
      return `drawbox=x=floor(iw*${x}):y=floor(ih*${y}):w=ceil(iw*${w}):h=ceil(ih*${h}):color=black@1:t=fill`;
    })
    .join(',');
}
