// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

export interface StubCommandSpec {
  /** The subcommand name, e.g. "record". */
  name: string;
  /** One-line help text describing what the finished command will do. */
  summary: string;
  /** The PRD id that owns the real implementation, e.g. "prd-004". */
  owningPrd: string;
}

/**
 * Registers a stub subcommand: it resolves the project directory, loads and
 * validates the manifest (so a bad project surfaces PROJECT_NOT_FOUND /
 * MANIFEST_INVALID exactly like a real command would), and then exits with
 * ExitCode.NOT_IMPLEMENTED naming the PRD that owns the real behavior. This
 * is prd-001 AC4's contract; the command body itself is filled in by the
 * PRD named in `owningPrd`.
 */
export function registerStubCommand(program: Command, spec: StubCommandSpec): void {
  program
    .command(spec.name)
    .exitOverride()
    .description(`${spec.summary} (stub in this PRD wave; implemented by ${spec.owningPrd})`)
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .action((opts: { project: string }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      loadManifest(projectDir);
      throw new CliExitError(
        ExitCode.NOT_IMPLEMENTED,
        `waggle ${spec.name}: not implemented (${spec.owningPrd})`,
      );
    });
}
