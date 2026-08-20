import type { ExitCode } from './exit-codes.js';

/**
 * A CLI error carrying the exact process exit code it should produce.
 *
 * Command actions throw this instead of calling `process.exit()` directly
 * so the top-level runner in cli.ts stays the single place that decides the
 * final exit code, and so tests can call `runCli()` in-process and assert on
 * a return value instead of spawning a real OS process.
 */
export class CliExitError extends Error {
  readonly code: ExitCode;

  constructor(code: ExitCode, message: string) {
    super(message);
    this.name = 'CliExitError';
    this.code = code;
  }
}
