import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { createDefaultManifest } from '../manifest/schema.js';
import {
  credentialsPath,
  gitignorePath,
  manifestPath,
  subdirPath,
  TRACKED_EMPTY_SUBDIRS,
} from '../project-layout.js';

/**
 * Project-level .gitignore (ADR-015 / ADR-008): rendered output is a cheap,
 * regenerable derivative and stays out of git; resolved secrets never do.
 * credentials.json itself IS tracked, because it only ever holds env-var
 * *references*, never values (see credentialsTemplate below).
 */
const PROJECT_GITIGNORE = `# Waggle project .gitignore (ADR-015, ADR-008)

# Rendered videos and share bundles are regenerable derivatives of the
# Walkthrough IR. Do not commit them.
renders/

# Never commit resolved secrets. credentials.json (tracked) holds only
# environment-variable references; the values themselves live in .env,
# which is never committed.
.env
.env.*
!.env.example
`;

function credentialsTemplate(): string {
  // ADR-008: environment variable REFERENCES only, never values. This is a
  // template shape example, not a real credential: "example" is an id, and
  // DEMO_USER / DEMO_PASSWORD are the *names* of env vars to read at replay
  // time (prd-010), not secrets themselves.
  const template = {
    schemaVersion: 1,
    credentials: [
      {
        id: 'example',
        username_env: 'DEMO_USER',
        secret_env: 'DEMO_PASSWORD',
      },
    ],
  };
  return `${JSON.stringify(template, null, 2)}\n`;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .exitOverride()
    .argument('<name>', 'name of the new Waggle project (also its directory name)')
    .option('-d, --dir <parent>', 'parent directory to create the project inside', '.')
    .description(
      'Scaffold a new Waggle project directory (ADR-015 layout) with a valid waggle.json manifest.',
    )
    .action((name: string, opts: { dir: string }) => {
      const projectDir = path.resolve(process.cwd(), opts.dir, name);

      if (existsSync(manifestPath(projectDir))) {
        throw new CliExitError(
          ExitCode.PROJECT_ALREADY_EXISTS,
          `A Waggle project already exists at "${projectDir}" (found ${manifestPath(projectDir)}). Refusing to overwrite it: remove the existing project first, or choose a different name.`,
        );
      }

      mkdirSync(projectDir, { recursive: true });
      for (const subdir of TRACKED_EMPTY_SUBDIRS) {
        const dirPath = subdirPath(projectDir, subdir);
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(path.join(dirPath, '.gitkeep'), '');
      }
      mkdirSync(subdirPath(projectDir, 'renders'), { recursive: true });

      const manifest = createDefaultManifest(name);
      writeFileSync(manifestPath(projectDir), `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(credentialsPath(projectDir), credentialsTemplate());
      writeFileSync(gitignorePath(projectDir), PROJECT_GITIGNORE);

      process.stdout.write(`Created Waggle project "${name}" at ${projectDir}\n`);
    });
}
