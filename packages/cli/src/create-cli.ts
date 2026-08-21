import { Command } from 'commander';
import { registerCleanCommand } from './commands/clean.js';
import { registerExportCommand } from './commands/export.js';
import { registerInitCommand } from './commands/init.js';
import { registerNarrateCommand } from './commands/narrate.js';
import { registerRecordCommand } from './commands/record.js';
import { registerRenderCommand } from './commands/render.js';
import { registerStubCommand, type StubCommandSpec } from './commands/stub.js';
import { registerStudioCommand } from './commands/studio.js';

const CLI_VERSION = '0.1.0';

/**
 * Full command surface (AC4). `init` (prd-001), `narrate` (prd-006),
 * `render` (prd-007), `export`/`clean` (prd-008), and `studio` (prd-005)
 * are real; every other command is a stub that still resolves the project
 * and validates the manifest, then names the PRD that owns its real
 * implementation.
 */
const STUB_COMMANDS: StubCommandSpec[] = [
  {
    name: 'regen',
    summary: 'Replay the IR against the live app and regenerate the video',
    owningPrd: 'prd-009',
  },
  {
    name: 'creds',
    summary: 'Manage credential environment-variable references for this project',
    owningPrd: 'prd-010',
  },
];

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
  for (const spec of STUB_COMMANDS) {
    registerStubCommand(program, spec);
  }

  return program;
}
