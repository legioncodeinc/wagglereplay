// SPDX-License-Identifier: AGPL-3.0-or-later
import path from 'node:path';
import {
  NarrationDraftPendingApprovalError,
  NarrationNotApprovedError,
  NoRecordingError,
  runNarration,
  ShareableAudioGuardError,
  TtsConfigError,
} from '@waggle/narrate';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * The real `waggle narrate` implementation (prd-006), replacing the
 * generic stub registered for every other not-yet-built command. Resolves
 * the project the same way every command does (`--project`, manifest
 * load), then hands off to `@waggle/narrate`'s `runNarration`, translating
 * that package's typed errors into the documented exit codes in
 * ../exit-codes.ts rather than letting them surface as a generic failure.
 */
export function registerNarrateCommand(program: Command): void {
  program
    .command('narrate')
    .exitOverride()
    .description('Draft a narration script and synthesize voice audio with word timestamps')
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .action(async (opts: { project: string }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      loadManifest(projectDir);

      try {
        const result = await runNarration({ projectDir });
        const lines = [
          `Narration audio written: ${result.audioPath}`,
          `Transcript written: ${result.transcriptPath}`,
        ];
        if (result.wordsPath !== null) {
          lines.push(`Word timings written: ${result.wordsPath}`);
        }
        if (result.srtPath !== null && result.vttPath !== null) {
          lines.push(`Captions written: ${result.srtPath}, ${result.vttPath}`);
        }
        process.stdout.write(`${lines.join('\n')}\n`);
      } catch (error) {
        if (
          error instanceof NarrationDraftPendingApprovalError ||
          error instanceof NarrationNotApprovedError
        ) {
          throw new CliExitError(ExitCode.NARRATION_NOT_APPROVED, error.message);
        }
        if (error instanceof TtsConfigError) {
          throw new CliExitError(ExitCode.TTS_CONFIG_INVALID, error.message);
        }
        if (error instanceof ShareableAudioGuardError) {
          throw new CliExitError(ExitCode.SHAREABLE_AUDIO_REFUSED, error.message);
        }
        if (error instanceof NoRecordingError) {
          throw new CliExitError(ExitCode.GENERIC_ERROR, error.message);
        }
        throw error;
      }
    });
}
