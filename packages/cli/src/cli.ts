#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { pathToFileURL } from 'node:url';
import { createCli } from './create-cli.js';
import { CliExitError } from './errors.js';
import { ExitCode } from './exit-codes.js';

interface CommanderErrorLike {
  code: string;
  exitCode?: number;
  message: string;
}

function isCommanderErrorLike(error: unknown): error is CommanderErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * Parses and runs `argv` against the full waggle command tree and returns
 * the process exit code it should produce. Never calls `process.exit()`
 * itself, so it is safe to call in-process from tests (see
 * packages/cli/test/e2e-init-and-stubs.test.ts): commander's own
 * `exitOverride()` makes it throw instead of exiting, and this function
 * translates every outcome (success, a CliExitError from a command action,
 * or a commander parsing error such as --help/--version/unknown command)
 * into a single numeric result.
 */
export async function runCli(argv: string[]): Promise<number> {
  const program = createCli();
  try {
    await program.parseAsync(argv, { from: 'node' });
    return ExitCode.SUCCESS;
  } catch (error) {
    if (error instanceof CliExitError) {
      process.stderr.write(`${error.message}\n`);
      return error.code;
    }
    if (isCommanderErrorLike(error)) {
      // commander throws this for --help, --version, unknown commands,
      // missing required arguments, and unknown options. commander has
      // already written its own message to stderr/stdout by this point
      // (that is what exitOverride intercepts), so we only translate the
      // outcome into an exit code here rather than re-printing it.
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        return ExitCode.SUCCESS;
      }
      return typeof error.exitCode === 'number' ? error.exitCode : ExitCode.GENERIC_ERROR;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Unexpected error: ${message}\n`);
    return ExitCode.GENERIC_ERROR;
  }
}

// Only auto-run when this file is the process entry point (real CLI
// invocation), never when it is imported by a test.
const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv).then((code) => {
    process.exitCode = code;
  });
}
