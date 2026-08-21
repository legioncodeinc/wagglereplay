import path from 'node:path';
import {
  BrandKitError,
  CompositorInputError,
  CompositorRenderError,
  FfmpegNotFoundError,
  PresetError,
  RenderInputError,
  renderProject,
} from '@waggle/compose';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * The real `waggle render` implementation (prd-007), replacing the generic
 * stub. Resolves the project the same way every command does, then hands
 * off to `@waggle/compose`'s `renderProject`, translating that package's
 * typed errors into the documented exit codes in ../exit-codes.ts rather
 * than letting them surface as a generic failure.
 *
 * Backend selection lives in `@waggle/compose`, not here: ADR-003 makes
 * ffmpeg the default and prd-014's Remotion plugin an opt-in second
 * implementation of the same interface, so this command must not grow
 * knowledge of which one is running.
 */
export function registerRenderCommand(program: Command): void {
  program
    .command('render')
    .exitOverride()
    .description('Composite a branded, narrated MP4 from the current Walkthrough IR')
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .option('--preset <id>', 'Render preset id (16x9, 9x16, 1x1, 4x5, or one from waggle.json)')
    .option('--brand-kit <id>', 'Brand kit id, resolved against the project brand/ directory')
    .option('-o, --out <file>', 'Output file path (defaults to renders/<ir>.<kit>.<preset>.mp4)')
    .option('--dry-run', 'Generate every intermediate and print the command without encoding')
    .action(
      async (opts: {
        project: string;
        preset?: string;
        brandKit?: string;
        out?: string;
        dryRun?: boolean;
      }) => {
        const projectDir = path.resolve(process.cwd(), opts.project);
        loadManifest(projectDir);

        try {
          const result = await renderProject({
            projectDir,
            presetId: opts.preset,
            brandKitId: opts.brandKit,
            outputPath: opts.out === undefined ? undefined : path.resolve(process.cwd(), opts.out),
            dryRun: opts.dryRun ?? false,
          });

          if (!result.encoded) {
            process.stdout.write(
              `Dry run: nothing was encoded.\nWould write: ${result.outputPath}\nCommand: ${result.command.join(' ')}\n`,
            );
            return;
          }

          const lines = [
            `Render written: ${result.outputPath}`,
            `Preset: ${result.presetId} (${result.width}x${result.height} at ${result.fps}fps, ${result.reframe})`,
            `Brand kit: ${result.brandKitId}`,
            `Duration: ${(result.durationMs / 1000).toFixed(2)}s`,
            `Metadata: ${result.metadataPath}`,
            'Layers:',
            ...result.layers.map(
              (layer) => `  ${layer.present ? '+' : '-'} ${layer.name}: ${layer.detail}`,
            ),
          ];
          process.stdout.write(`${lines.join('\n')}\n`);
        } catch (error) {
          if (error instanceof PresetError) {
            throw new CliExitError(ExitCode.PRESET_UNKNOWN, error.message);
          }
          if (error instanceof BrandKitError) {
            throw new CliExitError(ExitCode.BRAND_KIT_INVALID, error.message);
          }
          if (error instanceof RenderInputError || error instanceof CompositorInputError) {
            throw new CliExitError(ExitCode.RENDER_INPUT_MISSING, error.message);
          }
          if (error instanceof FfmpegNotFoundError) {
            throw new CliExitError(ExitCode.FFMPEG_FAILED, error.message);
          }
          if (error instanceof CompositorRenderError) {
            throw new CliExitError(ExitCode.FFMPEG_FAILED, `${error.message}\n${error.stderrTail}`);
          }
          throw error;
        }
      },
    );
}
