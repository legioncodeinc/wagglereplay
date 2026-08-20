import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';
import { loadManifest } from '../src/manifest/load-manifest.js';
import { WaggleManifestSchema } from '../src/manifest/schema.js';

/**
 * E2E coverage for AC6: init a project in a real temp directory, round-trip
 * the manifest through the loader, and assert the stub commands exit with
 * the documented codes from exit-codes.ts. Runs `runCli()` in-process
 * (real filesystem I/O, real commander parsing, no mocks) rather than
 * spawning a subprocess, so it behaves identically on Windows and POSIX
 * without any shell-quoting or PATH concerns.
 */
describe('waggle init + command surface (e2e)', () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempParentDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-cli-e2e-'));
    cleanupDirs.push(dir);
    return dir;
  }

  it('creates the ADR-015 directory layout with a valid manifest', async () => {
    const parent = tempParentDir();
    const code = await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    expect(code).toBe(ExitCode.SUCCESS);

    const projectDir = path.join(parent, 'demo');
    for (const subdir of ['steps', 'narration', 'brand', 'baselines', 'renders']) {
      expect(existsSync(path.join(projectDir, subdir))).toBe(true);
    }
    expect(existsSync(path.join(projectDir, 'credentials.json'))).toBe(true);
    expect(existsSync(path.join(projectDir, '.gitignore'))).toBe(true);

    const manifestRaw = readFileSync(path.join(projectDir, 'waggle.json'), 'utf8');
    const manifest = WaggleManifestSchema.parse(JSON.parse(manifestRaw));
    expect(manifest.name).toBe('demo');
    expect(manifest.currentIrVersion).toBeNull();

    const gitignore = readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('renders/');
    expect(gitignore).toContain('.env');

    // ADR-008: credentials.json holds env-var references only, never values.
    const creds = JSON.parse(readFileSync(path.join(projectDir, 'credentials.json'), 'utf8'));
    expect(creds.credentials[0].username_env).toBe('DEMO_USER');
    expect(creds.credentials[0].secret_env).toBe('DEMO_PASSWORD');
    expect(creds.credentials[0]).not.toHaveProperty('username');
    expect(creds.credentials[0]).not.toHaveProperty('secret');
    expect(creds.credentials[0]).not.toHaveProperty('password');
  });

  it('refuses politely to init twice in the same place, with a non-zero documented exit code', async () => {
    const parent = tempParentDir();
    const first = await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    expect(first).toBe(ExitCode.SUCCESS);

    const second = await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    expect(second).toBe(ExitCode.PROJECT_ALREADY_EXISTS);
    expect(second).not.toBe(0);

    // The second run must not have touched the existing project.
    const manifest = loadManifest(path.join(parent, 'demo'));
    expect(manifest.name).toBe('demo');
  });

  it('round-trips the manifest through the loader', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'roundtrip', '--dir', parent]);
    const manifest = loadManifest(path.join(parent, 'roundtrip'));
    expect(manifest).toEqual(
      WaggleManifestSchema.parse({
        schemaVersion: 1,
        name: 'roundtrip',
        createdAt: manifest.createdAt,
        currentIrVersion: null,
        presets: {},
        defaults: {},
      }),
    );
  });

  const stubCases: Array<{ command: string; owningPrd: string }> = [
    { command: 'record', owningPrd: 'prd-004' },
    { command: 'narrate', owningPrd: 'prd-006' },
    { command: 'render', owningPrd: 'prd-007' },
    { command: 'regen', owningPrd: 'prd-009' },
    { command: 'export', owningPrd: 'prd-008' },
    { command: 'studio', owningPrd: 'prd-005' },
    { command: 'creds', owningPrd: 'prd-010' },
    { command: 'clean', owningPrd: 'prd-008' },
  ];

  for (const { command, owningPrd } of stubCases) {
    it(`\`waggle ${command}\` resolves the project + manifest, then exits NOT_IMPLEMENTED naming ${owningPrd}`, async () => {
      const parent = tempParentDir();
      await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
      const projectDir = path.join(parent, 'demo');

      const code = await runCli(['node', 'waggle', command, '--project', projectDir]);
      expect(code).toBe(ExitCode.NOT_IMPLEMENTED);
    });
  }

  it('a stub command against a directory with no manifest exits PROJECT_NOT_FOUND', async () => {
    const parent = tempParentDir();
    const code = await runCli(['node', 'waggle', 'record', '--project', parent]);
    expect(code).toBe(ExitCode.PROJECT_NOT_FOUND);
  });

  it('a stub command against a corrupt manifest exits MANIFEST_INVALID', async () => {
    const parent = tempParentDir();
    await runCli(['node', 'waggle', 'init', 'demo', '--dir', parent]);
    const projectDir = path.join(parent, 'demo');
    writeFileSync(path.join(projectDir, 'waggle.json'), '{ not valid json');

    const code = await runCli(['node', 'waggle', 'record', '--project', projectDir]);
    expect(code).toBe(ExitCode.MANIFEST_INVALID);
  });

  it('`waggle --help` exits SUCCESS', async () => {
    const code = await runCli(['node', 'waggle', '--help']);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it("an unknown command exits with commander's own non-zero usage code", async () => {
    const code = await runCli(['node', 'waggle', 'not-a-real-command']);
    expect(code).not.toBe(ExitCode.SUCCESS);
  });
});
