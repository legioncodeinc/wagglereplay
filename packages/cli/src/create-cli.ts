import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerStubCommand, type StubCommandSpec } from './commands/stub.js';

const CLI_VERSION = '0.1.0';

/**
 * Full command surface (AC4). `init` is real (this PRD); every other
 * command is a stub that still resolves the project and validates the
 * manifest, then names the PRD that owns its real implementation.
 */
const STUB_COMMANDS: StubCommandSpec[] = [
  {
    name: 'record',
    summary: 'Launch Studio and capture a new walkthrough recording',
    owningPrd: 'prd-004',
  },
  {
    name: 'narrate',
    summary: 'Draft a narration script and synthesize voice audio with word timestamps',
    owningPrd: 'prd-006',
  },
  {
    name: 'render',
    summary: 'Composite a branded, narrated MP4 from the current Walkthrough IR',
    owningPrd: 'prd-007',
  },
  {
    name: 'regen',
    summary: 'Replay the IR against the live app and regenerate the video',
    owningPrd: 'prd-009',
  },
  {
    name: 'export',
    summary: 'Export a share bundle (rendered video plus a static share page)',
    owningPrd: 'prd-008',
  },
  {
    name: 'studio',
    summary: 'Start the local Studio editor server for this project',
    owningPrd: 'prd-005',
  },
  {
    name: 'creds',
    summary: 'Manage credential environment-variable references for this project',
    owningPrd: 'prd-010',
  },
  {
    name: 'clean',
    summary: 'Remove generated renders and caches for this project',
    owningPrd: 'prd-008',
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
  for (const spec of STUB_COMMANDS) {
    registerStubCommand(program, spec);
  }

  return program;
}
