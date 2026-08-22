// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import { IngestSessionError, runIngest } from '@waggle/ingest';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * The real `waggle record` implementation (prd-004 AC5), replacing the
 * generic stub registered for every other not-yet-built command.
 *
 * PRD-004's scope is INGEST: turning a finished capture session into a
 * Walkthrough IR project state. Per ADR-019, the recommended human path
 * for that is the extension flow: launch Studio (`waggle studio` or the
 * desktop app when prd-018 ships), record from the extension, and let
 * Studio drive ingest. This command is the scripted/automation path and
 * requires `--session <dir>` pointing at an already-finished session
 * directory - the exact shape `apps/extension/src/lib/finalizer.ts`'s
 * `finalizeSession` produces (events.jsonl, meta.json, and the video
 * file it names), which is also what Studio's upload endpoints write.
 */
export function registerRecordCommand(program: Command): void {
  program
    .command('record')
    .exitOverride()
    .description(
      'Ingest a finished capture session into a Walkthrough IR version (the extension-plus-Studio flow is the recommended human path per ADR-019; this command is the scripted path and needs --session)',
    )
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .option(
      '-s, --session <dir>',
      'A finished capture session directory (events.jsonl, meta.json, and the video file)',
    )
    .action(async (opts: { project: string; session?: string }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      loadManifest(projectDir);

      if (!opts.session) {
        throw new CliExitError(
          ExitCode.INGEST_SESSION_REQUIRED,
          'waggle record: no --session <dir> given. For interactive capture, use the extension ' +
            'flow (run `waggle studio`, record from the extension); that is the recommended human ' +
            'path per ADR-019. This command is the scripted path: pass --session pointing at a ' +
            'finished capture session directory (events.jsonl, meta.json, and its video file) to ' +
            'ingest it now.',
        );
      }
      const sessionDir = path.resolve(process.cwd(), opts.session);

      try {
        const result = await runIngest({ projectDir, sessionDir });
        const lines = [
          `Walkthrough IR v${String(result.irVersion)} written: ${result.irFilePath}`,
          `Steps: ${String(result.stepCount)}`,
          `Frames extracted: ${String(result.framesExtracted)}`,
          `Heatmap written: ${result.heatmapFilePath}`,
          `Pre-draft descriptions written: ${result.predraftFilePath}`,
        ];
        for (const warning of result.warnings) {
          lines.push(`Warning: ${warning}`);
        }
        process.stdout.write(`${lines.join('\n')}\n`);
      } catch (error) {
        if (error instanceof IngestSessionError) {
          throw new CliExitError(ExitCode.INGEST_INVALID_SESSION, error.message);
        }
        throw error;
      }
    });
}
