// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type CredentialsFile, CredentialsFileSchema, credentialsPath } from '@waggle/ir';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { loadManifest } from '../manifest/load-manifest.js';

/**
 * `waggle creds check` (prd-010 AC1), the one creds subcommand the PRD
 * scopes (ADR-019's carve-out finishes exactly what the PRDs name, so
 * this command grows no further subcommands).
 *
 * Reports which environment-variable REFERENCES in credentials.json
 * resolve on this machine, WITHOUT EVER PRINTING VALUES (ADR-008): the
 * output names each ref's env-var name and a boolean, and that is the
 * whole vocabulary. A resolved value would be a secret on a terminal.
 *
 * Exit codes: 0 when every ref resolves (or there is no credentials.json,
 * which is a valid anonymous project), CREDS_INVALID when the file exists
 * but fails the canonical schema, CREDS_UNRESOLVED when any ref is unset
 * on this machine.
 */

/** Loads and validates credentials.json; `null` when the file is absent. */
export function loadCredentialsFile(projectDir: string): CredentialsFile | null {
  const filePath = credentialsPath(projectDir);
  if (!existsSync(filePath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new CliExitError(
      ExitCode.CREDS_INVALID,
      `"${filePath}" is not valid JSON: ${(error as Error).message}`,
    );
  }

  const result = CredentialsFileSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new CliExitError(
      ExitCode.CREDS_INVALID,
      `"${filePath}" does not satisfy the credentials schema (ADR-008):\n${details}`,
    );
  }
  return result.data;
}

interface RefCheck {
  readonly setId: string;
  readonly label: string;
  readonly kind: 'username_env' | 'secret_env' | 'totp_seed_env';
  readonly envName: string;
  readonly resolves: boolean;
}

/**
 * Pure check: which refs resolve in `env`. Exported for tests; never
 * returns or accepts a value, only names.
 */
export function checkCredentialRefs(file: CredentialsFile, env: NodeJS.ProcessEnv): RefCheck[] {
  const checks: RefCheck[] = [];
  for (const set of file.credentials) {
    const entries: RefCheck['kind'][] = ['username_env', 'secret_env', 'totp_seed_env'];
    for (const kind of entries) {
      const envName = set[kind];
      if (envName === undefined) {
        continue;
      }
      checks.push({
        setId: set.id,
        label: set.label,
        kind,
        envName,
        resolves: env[envName] !== undefined && env[envName] !== '',
      });
    }
  }
  return checks;
}

function formatChecks(checks: readonly RefCheck[]): string {
  const lines: string[] = [];
  for (const check of checks) {
    // The only two strings printed per ref: the NAME and a status word.
    lines.push(
      `  ${check.resolves ? 'ok      ' : 'MISSING '} ${check.envName} (${check.kind}, set "${check.setId}")`,
    );
  }
  return lines.join('\n');
}

export function registerCredsCommand(program: Command): void {
  const creds = program
    .command('creds')
    .exitOverride()
    .description('Check credential environment-variable references for this project (prd-010)');
  creds.description('Manage credential environment-variable references for this project');

  creds
    .command('check')
    .exitOverride()
    .description('Report which credential env refs resolve on this machine; never prints values')
    .option('-p, --project <dir>', 'Waggle project directory', '.')
    .action((opts: { project: string }) => {
      const projectDir = path.resolve(process.cwd(), opts.project);
      loadManifest(projectDir);

      const file = loadCredentialsFile(projectDir);
      if (file === null) {
        process.stdout.write(
          `No ${'credentials.json'} in "${projectDir}"; nothing to check (anonymous walkthroughs need no credentials).\n`,
        );
        return;
      }
      if (file.credentials.length === 0) {
        process.stdout.write('credentials.json declares no credential sets; nothing to check.\n');
        return;
      }

      const checks = checkCredentialRefs(file, process.env);
      const unresolved = checks.filter((check) => !check.resolves);
      const summary =
        `${file.credentials.length} credential set(s), ${checks.length} env ref(s):\n` +
        `${formatChecks(checks)}\n`;
      process.stdout.write(summary);

      if (unresolved.length > 0) {
        throw new CliExitError(
          ExitCode.CREDS_UNRESOLVED,
          `${unresolved.length} env ref(s) unresolved on this machine: ${unresolved
            .map((check) => check.envName)
            .join(
              ', ',
            )}. Set them (for example in .env, which is gitignored) and re-run. Values are never printed.`,
        );
      }
    });
}
