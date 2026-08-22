// SPDX-License-Identifier: AGPL-3.0-or-later
import { copyFileSync, constants as fsConstants, mkdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Subdirectory holding source recordings, mirroring ADR-015's other
 * category subdirectories (steps, narration, brand, baselines, renders).
 */
export const RECORDINGS_SUBDIR = 'recordings';

export interface CopyRecordingResult {
  /** Project-relative, forward-slash path: what flow.waggle.sourceRecording.videoRef is set to. */
  readonly videoRef: string;
  readonly destPath: string;
}

/**
 * AC5 fix: places the session's source video inside the project
 * directory, versioned by IR version, so
 * flow.waggle.sourceRecording.videoRef (which @waggle/compose's
 * resolveSourceVideo resolves as path.resolve(projectDir, videoRef) -
 * see packages/compose/src/render/render-project.ts) actually resolves
 * to a real file on disk. Before this, the video stayed in the session
 * directory and was never copied anywhere; the IR pointed at a bare
 * filename that only ever happened to exist next to walkthrough.vN.json
 * if a caller manually placed it there.
 *
 * Stored under recordings/v{irVersion}/ rather than a flat
 * recordings/<filename>, mirroring steps/v{irVersion}/: two different
 * recording sessions ingested into the same project (two separate
 * "waggle record" runs) get two different IR versions, and each version
 * must keep its own video - a flat, unversioned path would let a second
 * "waggle record" silently overwrite the video an older, already-shipped
 * IR version still points at, which breaks the same immutability
 * guarantee ADR-015 already requires of the IR JSON itself.
 *
 * The destination write uses COPYFILE_EXCL (mirrors
 * @waggle/ir's writeNextIrVersion using the 'wx' flag for the same
 * reason): the target IR version is always freshly incremented before
 * this runs, so a collision here means something is genuinely wrong
 * rather than a legitimate re-run to tolerate silently.
 */
export function copySourceRecording(
  sessionVideoPath: string,
  projectDir: string,
  irVersion: number,
  filename: string,
): CopyRecordingResult {
  const safeName = path.basename(filename);
  const destDir = path.join(projectDir, RECORDINGS_SUBDIR, `v${String(irVersion)}`);
  mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, safeName);

  copyFileSync(sessionVideoPath, destPath, fsConstants.COPYFILE_EXCL);

  const videoRef = path.relative(projectDir, destPath).split(path.sep).join('/');
  return { videoRef, destPath };
}
