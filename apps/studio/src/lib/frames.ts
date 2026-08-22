// SPDX-License-Identifier: AGPL-3.0-or-later
import type { StepAssets } from '@waggle/ir';

/** Zero-padded step directory name, matching `@waggle/ingest`'s `stepDirName` (`step-000`, `step-001`, ...). */
export function stepDirName(stepIndex: number): string {
  return `step-${String(stepIndex).padStart(3, '0')}`;
}

/** URL for one extracted keyframe PNG, served by `/api/frames/[version]/[stepDir]/[fileName]`. */
export function frameUrl(irVersion: number, stepIndex: number, fileName: string): string {
  return `/api/frames/${String(irVersion)}/${stepDirName(stepIndex)}/${encodeURIComponent(fileName)}`;
}

/** Extracts the bare file name from a project-relative asset ref (`steps/v1/step-002/settled.png` -> `settled.png`), the shape `frameUrl` needs. */
export function assetFileName(assetRef: string): string {
  const parts = assetRef.split(/[/\\]/);
  return parts[parts.length - 1] ?? assetRef;
}

/** The settled frame if the step has one, else the click frame, else the before frame - the film strip's thumbnail choice, as a bare file name ready for `frameUrl`. */
export function bestThumbnail(assets: StepAssets | undefined): string | null {
  if (assets === undefined) return null;
  const ref = assets.settled ?? assets.click ?? assets.before ?? null;
  return ref === null ? null : assetFileName(ref);
}
