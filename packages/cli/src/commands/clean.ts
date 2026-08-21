import path from 'node:path';
import {
  type CleanCandidate,
  DEFAULT_KEEP_VERSIONS,
  deleteCleanCandidates,
  planClean,
} from '@waggle/share';
import type { Command } from 'commander';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * The real `waggle clean` implementation (prd-008 AC4), replacing the
 * generic stub. Prunes stale render outputs: per (brand kit, preset),
 * everything older than the `--keep-versions` most recent IR versions,
 * plus (only when `--older-than-days` is given) anything past that age
 * regardless of version. `renders/.work/` (the compositor's own scratch
 * space) is always a candidate as pure cache; `renders/share/` (already-
 * built, possibly already-distributed bundles) is never touched here, on
 * purpose (see `plan.ts`'s module doc).
 *
 * DRY RUN IS THE DEFAULT (AC4: "destroying files must require an explicit
 * flag"). `--force` is the only thing that makes this command write to
 * disk; every other invocation only ever prints what would be removed.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function describeCandidate(candidate: CleanCandidate): string {
  const reasonText = candidate.reasons
    .map((reason) => (reason === 'stale-version' ? 'stale version' : 'age'))
    .join(', ');
  return `  ${candidate.output.filename} (${reasonText}, ${formatBytes(candidate.totalBytes)})`;
}

export function registerCleanCommand(program: Command): void {
  program
    .command('clean')
    .exitOverride()
    .description(
      'Prune stale render outputs by version and (optionally) age. Dry run by default; pass --force to actually delete.',
    )
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .option(
      '--keep-versions <n>',
      'How many of the most recent IR versions to keep per (brand kit, preset)',
      String(DEFAULT_KEEP_VERSIONS),
    )
    .option(
      '--older-than-days <n>',
      'Also prune renders whose file is older than this many days, regardless of version (off by default)',
    )
    .option('--force', 'Actually delete the planned files instead of only printing them', false)
    .action(
      async (opts: {
        project: string;
        keepVersions: string;
        olderThanDays?: string;
        force: boolean;
      }) => {
        const projectDir = path.resolve(process.cwd(), opts.project);
        loadManifest(projectDir);

        const keepVersions = Number.parseInt(opts.keepVersions, 10);
        const olderThanDays =
          opts.olderThanDays === undefined ? undefined : Number.parseInt(opts.olderThanDays, 10);

        const plan = planClean(projectDir, { keepVersions, olderThanDays });

        if (plan.candidates.length === 0 && plan.workDirPath === null) {
          process.stdout.write('Nothing to clean.\n');
          return;
        }

        const totalBytes =
          plan.candidates.reduce((sum, candidate) => sum + candidate.totalBytes, 0) +
          plan.workDirBytes;

        const lines: string[] = [];
        if (plan.candidates.length > 0) {
          lines.push(`${plan.candidates.length} render(s) would be removed:`);
          lines.push(...plan.candidates.map(describeCandidate));
        }
        if (plan.workDirPath !== null) {
          lines.push(
            `Scratch cache would be removed: ${plan.workDirPath} (${formatBytes(plan.workDirBytes)})`,
          );
        }
        lines.push(`Total: ${formatBytes(totalBytes)}`);

        if (!opts.force) {
          lines.push('Dry run: nothing was deleted. Re-run with --force to delete.');
          process.stdout.write(`${lines.join('\n')}\n`);
          return;
        }

        const result = deleteCleanCandidates(plan);
        lines.push(
          `Deleted ${result.filesDeleted} file(s), freed ${formatBytes(result.bytesFreed)}.`,
        );
        if (result.workDirDeleted) {
          lines.push('Scratch cache removed.');
        }
        process.stdout.write(`${lines.join('\n')}\n`);
      },
    );
}
