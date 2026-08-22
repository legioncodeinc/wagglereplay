// SPDX-License-Identifier: AGPL-3.0-or-later
import { Command } from 'commander';
import { registerCleanCommand } from './commands/clean.js';
import { registerCredsCommand } from './commands/creds.js';
import { registerExportCommand } from './commands/export.js';
import { registerInitCommand } from './commands/init.js';
import { registerNarrateCommand } from './commands/narrate.js';
import { registerRecordCommand } from './commands/record.js';
import { registerRegenCommand } from './commands/regen.js';
import { registerRenderCommand } from './commands/render.js';
import { registerStubCommand, type StubCommandSpec } from './commands/stub.js';
import { registerStudioCommand } from './commands/studio.js';

const CLI_VERSION = '0.1.0';

/**
 * Full command surface (AC4). `init` (prd-001), `narrate` (prd-006),
 * `render` (prd-007), `export`/`clean` (prd-008), `studio` (prd-005),
 * `regen` (prd-009), and `creds` (prd-010) are real. ADR-019 froze this
 * surface: regen and creds check are the two carve-outs the PRDs already
 * scoped, and no further command is added.
 */
const STUB_COMMANDS: StubCommandSpec[] = [];

/**
 * Builds the `waggle` command tree. `exitOverride()` makes commander throw
 * instead of calling `process.exit()` directly, which is required both so
 * `runCli()` can be called safely from inside the test process and so the
 * top-level runner in cli.ts is the single place that decides the final
 * exit code (see exit-codes.ts).
 */
export function createCli(): Command {
  const program = new Command();
  program
    .name('waggle')
    .description(
      'Waggle: record a web app walkthrough once, regenerate narrated demo videos from it forever.',
    )
    .version(CLI_VERSION)
    .exitOverride()
    .configureHelp({ sortSubcommands: true });

  registerInitCommand(program);
  registerNarrateCommand(program);
  registerRenderCommand(program);
  registerRecordCommand(program);
  registerExportCommand(program);
  registerCleanCommand(program);
  registerStudioCommand(program);
  registerRegenCommand(program);
  registerCredsCommand(program);
  for (const spec of STUB_COMMANDS) {
    registerStubCommand(program, spec);
  }

  return program;
}
