// SPDX-License-Identifier: AGPL-3.0-or-later
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
 *
 * recordings/ (the source video "waggle record" copies in, see
 * @waggle/ingest's copySourceRecording) is heavy media, and ADR-015's own
 * consequences section is explicit that "heavy media stays gitignored by
 * default with documented opt-ins (or git LFS)": the source recording is
 * the one input a re-render can never regenerate (unlike renders/, which
 * is a cheap derivative of the IR), so an author who wants the exact
 * source pixels preserved in git can still remove this line or switch to
 * git LFS - the default just does not force every clone of the repo to
 * carry every project's raw screen-capture video.
 */
const PROJECT_GITIGNORE = `# Waggle project .gitignore (ADR-015, ADR-008)

# Rendered videos and share bundles are regenerable derivatives of the
# Walkthrough IR. Do not commit them.
renders/

# The source recording "waggle record" keeps (ADR-015: heavy media stays
# gitignored by default). Unlike renders/, this cannot be regenerated from
# the IR alone - remove this line (or switch to git LFS) if you want the
# original screen capture committed.
recordings/

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
  // time (prd-010), not secrets themselves. The shape is the canonical
  // @waggle/ir CredentialsFileSchema (prd-010 AC1).
  const template = {
    schemaVersion: 1,
    credentials: [
      {
        id: 'example',
        label: 'Example demo login',
        username_env: 'DEMO_USER',
        secret_env: 'DEMO_PASSWORD',
        applies_to: { username: [], secret: [], totp: [] },
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
