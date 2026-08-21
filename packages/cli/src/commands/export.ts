import path from 'node:path';
import { readCurrentIr } from '@waggle/ir';
import {
  BundleError,
  BundleLinkIntegrityError,
  buildShareBundle,
  describeR2EnvRequirements,
  FfmpegLaunchError,
  PosterGenerationError,
  R2UploadError,
  RenderManifestError,
  readR2ConfigFromEnv,
  uploadBundle,
} from '@waggle/share';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * The real `waggle export` implementation (prd-008 AC2/AC3), replacing the
 * generic stub. Builds the ADR-009 static share bundle for the project's
 * current Walkthrough IR version, then optionally pushes it to the
 * caller's own R2 bucket when `--upload` is passed and the environment is
 * fully configured.
 *
 * Error translation follows `render.ts`'s pattern: a typed error from
 * `@waggle/share` maps to the specific documented exit code that explains
 * it, rather than a generic failure. Two sub-errors this command can see
 * from a broken or dry-run render (`RenderManifestError`,
 * `PosterGenerationError`/`FfmpegLaunchError`) reuse `render`'s own
 * `RENDER_INPUT_MISSING`/`FFMPEG_FAILED` codes: the underlying problem is
 * the same class this project already documents those codes for ("waggle
 * render" needs to be re-run for real, or ffmpeg needs fixing), so a new
 * code would only duplicate an existing meaning.
 */
export function registerExportCommand(program: Command): void {
  program
    .command('export')
    .exitOverride()
    .description(
      'Export a share bundle (rendered video, poster, captions, transcript, and a self-contained HTML page) for the current walkthrough',
    )
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .option(
      '--preset <id>',
      'Which rendered preset drives the embedded player (defaults to 16x9 if it was rendered, else whichever preset was rendered first)',
    )
    .option(
      '--upload',
      'Also upload the bundle to R2 (requires WAGGLE_R2_ACCOUNT_ID, WAGGLE_R2_ACCESS_KEY_ID, WAGGLE_R2_SECRET_ACCESS_KEY, WAGGLE_R2_BUCKET, WAGGLE_R2_PUBLIC_BASE_URL)',
      false,
    )
    .action(async (opts: { project: string; preset?: string; upload: boolean }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      const manifest = loadManifest(projectDir);

      const current = readCurrentIr(projectDir);
      if (current === null) {
        throw new CliExitError(
          ExitCode.RENDER_INPUT_MISSING,
          `"${projectDir}" has no recorded Walkthrough IR yet. Run "waggle record" and "waggle render" first, then export.`,
        );
      }

      let result: Awaited<ReturnType<typeof buildShareBundle>>;
      try {
        result = await buildShareBundle({
          projectDir,
          irVersion: current.version,
          walkthroughTitle: current.flow.title,
          projectName: manifest.name,
          preferredPresetId: opts.preset,
        });
      } catch (error) {
        if (error instanceof BundleError) {
          throw new CliExitError(ExitCode.EXPORT_NO_RENDERS, error.message);
        }
        if (error instanceof BundleLinkIntegrityError) {
          throw new CliExitError(ExitCode.BUNDLE_LINK_INTEGRITY_FAILED, error.message);
        }
        if (error instanceof RenderManifestError) {
          throw new CliExitError(ExitCode.RENDER_INPUT_MISSING, error.message);
        }
        if (error instanceof PosterGenerationError || error instanceof FfmpegLaunchError) {
          throw new CliExitError(ExitCode.FFMPEG_FAILED, error.message);
        }
        throw error;
      }

      const lines = [
        `Share bundle written: ${result.indexPath}`,
        `Bundle directory: ${result.bundleDir}`,
        `Primary render: ${result.primary.filename} (${result.primary.preset.width}x${result.primary.preset.height}, ${result.primary.reframe})`,
        `Alternates: ${result.alternates.length === 0 ? 'none' : result.alternates.map((m) => m.filename).join(', ')}`,
        `Captions: ${result.hasCaptions ? 'included' : 'skipped (no narration/words.json)'}`,
        `Transcript: ${result.hasTranscript ? 'included' : 'skipped (no narration/words.json)'}`,
        'Link integrity: OK (every href/src in the page resolves inside the bundle)',
      ];

      if (!opts.upload) {
        lines.push('Not uploaded (pass --upload to push this bundle to your own R2 bucket).');
        process.stdout.write(`${lines.join('\n')}\n`);
        return;
      }

      const r2Config = readR2ConfigFromEnv(process.env);
      if (!r2Config.ok) {
        process.stdout.write(`${lines.join('\n')}\n`);
        throw new CliExitError(
          ExitCode.R2_CONFIG_INVALID,
          describeR2EnvRequirements(r2Config.missing),
        );
      }

      const prefix = `${manifest.name}/v${current.version}`;
      try {
        const uploadResult = await uploadBundle(result.bundleDir, prefix, r2Config.config);
        lines.push(
          `Uploaded ${uploadResult.uploaded.length} file(s) to R2 bucket "${r2Config.config.bucket}".`,
          'Public URL layout:',
          ...uploadResult.uploaded.map((entry) => `  ${entry.publicUrl}`),
          `Share page: ${uploadResult.indexUrl}`,
        );
      } catch (error) {
        process.stdout.write(`${lines.join('\n')}\n`);
        if (error instanceof R2UploadError) {
          throw new CliExitError(ExitCode.R2_UPLOAD_FAILED, error.message);
        }
        throw error;
      }

      process.stdout.write(`${lines.join('\n')}\n`);
    });
}
