// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { subdirPath } from '@waggle/ir';
import { listRenderOutputs, RENDER_WORK_SUBDIR, type RenderOutputInfo } from '../list-renders.js';
import { composeMetadataPath, shareManifestPath } from '../naming.js';

/**
 * `waggle clean` (prd-008 AC4): "prunes stale renders by age/version with
 * a dry-run default." This module only ever computes a PLAN; nothing here
 * touches disk. `deleteRenderCandidates` (below) is the one function that
 * does, and only when the caller explicitly opts in, matching "destroying
 * files must require an explicit flag."
 *
 * Two independent staleness rules, either of which marks a render a
 * candidate:
 *  - **version**: for each (brand kit, preset) pair, only the
 *    `keepVersions` most recent IR versions are kept; every older version
 *    is a candidate. A fresh recording superseding an old one is the
 *    common case this targets.
 *  - **age**: a render whose file modification time is older than
 *    `olderThanDays` is a candidate regardless of version, for a project
 *    that stopped re-recording but still accumulated renders over time.
 *    Off by default (`olderThanDays === undefined`): age-based pruning
 *    that silently deletes something a user has not touched in a while is
 *    exactly the kind of surprise a dry-run default exists to prevent
 *    ever reaching disk unreviewed.
 *
 * The `renders/.work/` scratch directory (compose's own intermediates,
 * `RENDER_WORK_SUBDIR`) is always a cleanup candidate on its own, as pure
 * cache with no naming-scheme identity to reason about. `renders/share/`
 * bundles are deliberately NEVER touched here: a bundle may already be
 * distributed (uploaded to R2, copied to a static host, or just linked to
 * someone), and pruning renders must not silently break a link someone
 * else is holding. Re-running `waggle export` is what refreshes a bundle;
 * `waggle clean` only ever removes regenerable render outputs and caches.
 */

export type CleanReason = 'stale-version' | 'age';

export interface CleanCandidate {
  readonly output: RenderOutputInfo;
  readonly reasons: readonly CleanReason[];
  /** Every file this candidate's removal deletes: the MP4 plus its sidecars. */
  readonly files: readonly string[];
  readonly totalBytes: number;
}

export interface CleanPlanOptions {
  /** How many of the most recent IR versions to keep per (brand kit, preset) pair. */
  readonly keepVersions?: number;
  /** Prune renders whose file mtime is older than this many days. Off (`undefined`) by default. */
  readonly olderThanDays?: number;
  readonly now?: () => Date;
}

export const DEFAULT_KEEP_VERSIONS = 1;

export interface CleanPlan {
  readonly candidates: readonly CleanCandidate[];
  readonly workDirPath: string | null;
  readonly workDirBytes: number;
}

function candidateFiles(output: RenderOutputInfo): string[] {
  return [output.path, composeMetadataPath(output.path), shareManifestPath(output.path)].filter(
    (candidate) => existsSync(candidate),
  );
}

function dirSizeBytes(dir: string): number {
  if (!existsSync(dir)) {
    return 0;
  }
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const parentPath = 'parentPath' in entry ? (entry.parentPath as string) : dir;
      total += statSync(path.join(parentPath, entry.name)).size;
    }
  }
  return total;
}

export function planClean(projectDir: string, options: CleanPlanOptions = {}): CleanPlan {
  const keepVersions = options.keepVersions ?? DEFAULT_KEEP_VERSIONS;
  const now = (options.now ?? (() => new Date()))().getTime();
  const ageThresholdMs =
    options.olderThanDays === undefined ? null : options.olderThanDays * 24 * 60 * 60 * 1000;

  const outputs = listRenderOutputs(projectDir);

  const groups = new Map<string, RenderOutputInfo[]>();
  for (const output of outputs) {
    const groupKey = `${output.brandKitId}::${output.presetId}`;
    const group = groups.get(groupKey) ?? [];
    group.push(output);
    groups.set(groupKey, group);
  }

  const reasonsByPath = new Map<string, Set<CleanReason>>();

  for (const group of groups.values()) {
    const byVersionDesc = [...group].sort((a, b) => b.irVersion - a.irVersion);
    const staleVersionOutputs = byVersionDesc.slice(Math.max(0, keepVersions));
    for (const output of staleVersionOutputs) {
      const reasons = reasonsByPath.get(output.path) ?? new Set<CleanReason>();
      reasons.add('stale-version');
      reasonsByPath.set(output.path, reasons);
    }
  }

  if (ageThresholdMs !== null) {
    for (const output of outputs) {
      if (now - output.mtimeMs >= ageThresholdMs) {
        const reasons = reasonsByPath.get(output.path) ?? new Set<CleanReason>();
        reasons.add('age');
        reasonsByPath.set(output.path, reasons);
      }
    }
  }

  const candidates: CleanCandidate[] = outputs
    .filter((output) => reasonsByPath.has(output.path))
    .map((output) => {
      const files = candidateFiles(output);
      return {
        output,
        reasons: [...(reasonsByPath.get(output.path) ?? [])],
        files,
        totalBytes: files.reduce((sum, filePath) => sum + statSync(filePath).size, 0),
      };
    });

  const workDir = path.join(subdirPath(projectDir, 'renders'), RENDER_WORK_SUBDIR);
  const workDirExists = existsSync(workDir);

  return {
    candidates,
    workDirPath: workDirExists ? workDir : null,
    workDirBytes: workDirExists ? dirSizeBytes(workDir) : 0,
  };
}

export interface DeleteCleanResult {
  readonly filesDeleted: number;
  readonly bytesFreed: number;
  readonly workDirDeleted: boolean;
}

/**
 * Actually deletes everything `plan` identified. The only function in this
 * module that touches disk; `waggle clean` calls it only when `--force`
 * (or equivalent) was explicitly passed, never as a side effect of
 * planning.
 */
export function deleteCleanCandidates(plan: CleanPlan): DeleteCleanResult {
  let filesDeleted = 0;
  let bytesFreed = 0;

  for (const candidate of plan.candidates) {
    for (const filePath of candidate.files) {
      if (existsSync(filePath)) {
        bytesFreed += statSync(filePath).size;
        rmSync(filePath, { force: true });
        filesDeleted += 1;
      }
    }
  }

  let workDirDeleted = false;
  if (plan.workDirPath !== null && existsSync(plan.workDirPath)) {
    rmSync(plan.workDirPath, { recursive: true, force: true });
    workDirDeleted = true;
  }

  return { filesDeleted, bytesFreed, workDirDeleted };
}
