import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Command } from 'commander';
import { loadManifest } from '../manifest/load-manifest.js';
import { assertPortAvailable, resolveStudioServerEntry } from '../studio/launch.js';

const DEFAULT_HOST = '127.0.0.1';
/** Matches `apps/extension/src/lib/upload-client.ts`'s `DEFAULT_STUDIO_ORIGIN` (`http://127.0.0.1:4310`). */
const DEFAULT_PORT = 4310;

/**
 * `waggle studio` (prd-005 AC1): boots the built `@waggle/studio`
 * adapter-node server as a child process, on `localhost` by default, with
 * the project directory handed across the only way a plain Node process
 * can hand data to an already-built server bundle: the `WAGGLE_PROJECT_DIR`
 * environment variable (see `apps/studio/src/lib/server/project-context.ts`).
 *
 * `BODY_SIZE_LIMIT=Infinity` disables adapter-node's default 512kB request
 * body cap (its own error message names `Infinity`, not `0`, as the way to
 * disable it - `0` means "reject every body"): the extension's video-chunk
 * uploads (`apps/extension/src/lib/upload-client.ts`) are raw binary POSTs
 * that would otherwise be rejected well before Studio's own upload
 * handlers ever saw them.
 */
export function registerStudioCommand(program: Command): void {
  program
    .command('studio')
    .exitOverride()
    .description('Start the local Studio editor server for this project')
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .option('--port <port>', 'Port to listen on', String(DEFAULT_PORT))
    .option('--host <host>', 'Host to bind', DEFAULT_HOST)
    .action(async (opts: { project: string; port: string; host: string }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      const manifest = loadManifest(projectDir);

      const port = Number.parseInt(opts.port, 10);
      const host = opts.host;

      const entryPath = resolveStudioServerEntry();
      await assertPortAvailable(port, host);

      process.stdout.write(
        `Waggle Studio: "${manifest.name}" at http://${host}:${String(port)} (project: ${projectDir})\n`,
      );

      await runStudioServer(entryPath, { projectDir, host, port });
    });
}

interface RunStudioServerOptions {
  readonly projectDir: string;
  readonly host: string;
  readonly port: number;
}

/**
 * Spawns the built server and blocks until it exits (Ctrl+C, or the
 * process dying on its own), forwarding SIGINT/SIGTERM so `waggle studio`
 * behaves like any other long-running dev server rather than orphaning a
 * child process when the terminal is interrupted.
 */
function runStudioServer(entryPath: string, options: RunStudioServerOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        WAGGLE_PROJECT_DIR: options.projectDir,
        HOST: options.host,
        PORT: String(options.port),
        // See module doc comment: unblocks the extension's video-chunk uploads.
        BODY_SIZE_LIMIT: 'Infinity',
      },
    });

    const forward = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };
    process.once('SIGINT', forward);
    process.once('SIGTERM', forward);

    child.once('error', (error) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      reject(error);
    });

    child.once('exit', () => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve();
    });
  });
}
