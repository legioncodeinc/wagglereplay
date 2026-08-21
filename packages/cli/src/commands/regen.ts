import path from 'node:path';
import {
  ConcurrencyError,
  CredentialBindingError,
  RegenInputError,
  ReplayPresetError,
  runRegen,
} from '@waggle/replay';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * `waggle regen` (prd-009 AC6): replay the current IR against the live
 * app, re-capture every configured preset, re-composite, and write the
 * run report. ADR-019's carve-out: regen is one of the two commands the
 * frozen surface lets this PRD finish; prd-012 will add `--check` on top
 * for CI, which is the other half of that same carve-out.
 */
export function registerRegenCommand(program: Command): void {
  program
    .command('regen')
    .exitOverride()
    .description('Replay the IR against the live app and regenerate every configured preset')
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .option('--preset <id>', 'Regenerate only this replay preset (repeatable)', collect, [])
    .action(async (opts: { project: string; preset: string[] }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      loadManifest(projectDir);

      try {
        const { report, reportPath } = await runRegen({
          projectDir,
          presetIds: opts.preset.length > 0 ? opts.preset : undefined,
        });

        for (const preset of report.presets) {
          const render =
            preset.render === null
              ? 'not rendered'
              : 'error' in preset.render
                ? `render failed: ${preset.render.error}`
                : preset.render.outputPath;
          process.stdout.write(
            `${preset.presetId} -> ${preset.composePresetId}: ${preset.reflow} (${preset.reflowReason}); ` +
              `${preset.steps.filter((step) => step.ok).length}/${preset.steps.length} steps ok; ` +
              `${preset.driftNotes.length} drift note(s); render: ${render}\n`,
          );
          for (const note of preset.driftNotes) {
            process.stdout.write(
              `  drift: step ${note.stepIndex} (${note.stepType}) resolved via fallback #${note.usedAlternativeIndex} "${note.usedSelector}" (first choice "${note.firstChoice}" failed)\n`,
            );
          }
        }
        process.stdout.write(`Run report: ${reportPath}\n`);

        if (!report.success) {
          throw new CliExitError(
            ExitCode.GENERIC_ERROR,
            'regen completed with failures; see the run report.',
          );
        }
      } catch (error) {
        if (error instanceof CredentialBindingError) {
          switch (error.code) {
            case 'credentials-invalid':
            case 'studio-invalid':
            case 'bound-set-missing':
            case 'ambiguous-step':
              throw new CliExitError(ExitCode.CREDS_INVALID, error.message);
            case 'missing-env':
            case 'invalid-totp-seed':
              throw new CliExitError(ExitCode.CREDS_UNRESOLVED, error.message);
            case 'credential-act-failed':
              throw new CliExitError(ExitCode.GENERIC_ERROR, error.message);
          }
        }
        if (error instanceof RegenInputError) {
          throw new CliExitError(ExitCode.RENDER_INPUT_MISSING, error.message);
        }
        if (error instanceof ReplayPresetError) {
          throw new CliExitError(ExitCode.PRESET_UNKNOWN, error.message);
        }
        if (error instanceof ConcurrencyError) {
          throw new CliExitError(ExitCode.GENERIC_ERROR, error.message);
        }
        throw error;
      }
    });
}

/** commander's collect behavior for repeatable options. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
