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
 * Walkthrough IR project state. Launching an interactive recording
 * session (opening Studio, driving the extension end to end) is prd-005's
 * job and is not built yet, so this command requires `--session <dir>`
 * pointing at an already-finished session directory - the exact shape
 * `apps/extension/src/lib/finalizer.ts`'s `finalizeSession` produces
 * (events.jsonl, meta.json, and the video file it names). Once prd-005
 * lands, its interactive flow will produce that same session directory
 * and can call straight into `@waggle/ingest`'s `runIngest`, same as this
 * command does.
 */
export function registerRecordCommand(program: Command): void {
  program
    .command('record')
    .exitOverride()
    .description(
      'Turn a finished capture session into a Walkthrough IR version plus storyboard assets (interactive capture is prd-005; pass --session for a session already on disk)',
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
          'waggle record: no --session <dir> given. Interactive capture (launching Studio, driving ' +
            'the extension) is not implemented yet (prd-005). Pass --session pointing at a finished ' +
            'capture session directory (events.jsonl, meta.json, and its video file) to ingest it now.',
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
