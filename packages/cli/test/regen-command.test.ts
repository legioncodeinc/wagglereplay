import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDefaultManifest, manifestPath } from '@waggle/ir';
import {
  ConcurrencyError,
  CredentialBindingError,
  type CredentialBindingErrorCode,
  RegenInputError,
  ReplayPresetError,
  runRegen,
} from '@waggle/replay';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
import { ExitCode } from '../src/exit-codes.js';

vi.mock('@waggle/replay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/replay')>();
  return { ...actual, runRegen: vi.fn() };
});

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'waggle-regen-cli-'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(manifestPath(dir), JSON.stringify(createDefaultManifest('regen-test')), 'utf8');
  return dir;
}

const credentialErrorCases: ReadonlyArray<{
  code: CredentialBindingErrorCode;
  exitCode: number;
}> = [
  { code: 'credentials-invalid', exitCode: ExitCode.CREDS_INVALID },
  { code: 'studio-invalid', exitCode: ExitCode.CREDS_INVALID },
  { code: 'bound-set-missing', exitCode: ExitCode.CREDS_INVALID },
  { code: 'ambiguous-step', exitCode: ExitCode.CREDS_INVALID },
  { code: 'missing-env', exitCode: ExitCode.CREDS_UNRESOLVED },
  { code: 'invalid-totp-seed', exitCode: ExitCode.CREDS_UNRESOLVED },
  { code: 'credential-act-failed', exitCode: ExitCode.GENERIC_ERROR },
];

describe('waggle regen command', () => {
  let projectDir: string;
  let stderr: string[];

  beforeEach(() => {
    projectDir = makeProject();
    stderr = [];
    vi.mocked(runRegen).mockReset();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('accepts repeatable --preset flags and forwards them in order', async () => {
    const reportPath = path.join(projectDir, 'renders', 'regen', 'latest-run.json');
    vi.mocked(runRegen).mockResolvedValue({
      report: {
        schemaVersion: 1,
        generatedAt: '2026-08-21T00:00:00.000Z',
        irVersion: 1,
        concurrency: { limit: 2, source: 'test' },
        presets: [],
        success: true,
      },
      reportPath,
    });

    const code = await runCli([
      'node',
      'waggle',
      'regen',
      '--project',
      projectDir,
      '--preset',
      '16x9',
      '--preset',
      'mobile',
    ]);

    expect(code).toBe(ExitCode.SUCCESS);
    expect(runRegen).toHaveBeenCalledWith({
      projectDir,
      presetIds: ['16x9', 'mobile'],
    });
  });

  it('maps missing replay input to RENDER_INPUT_MISSING', async () => {
    vi.mocked(runRegen).mockRejectedValue(new RegenInputError('no recorded Walkthrough IR'));

    const code = await runCli(['node', 'waggle', 'regen', '--project', projectDir]);

    expect(code).toBe(ExitCode.RENDER_INPUT_MISSING);
    expect(stderr.join('')).toContain('no recorded Walkthrough IR');
  });

  it('maps an unknown replay preset to PRESET_UNKNOWN', async () => {
    vi.mocked(runRegen).mockRejectedValue(
      new ReplayPresetError(
        'Unknown replay preset "nope". Known replay presets: 16x9, 1x1, 9x16, desktop, mobile.',
      ),
    );

    const code = await runCli([
      'node',
      'waggle',
      'regen',
      '--project',
      projectDir,
      '--preset',
      'nope',
    ]);

    expect(code).toBe(ExitCode.PRESET_UNKNOWN);
    expect(stderr.join('')).toContain('Known replay presets: 16x9, 1x1, 9x16, desktop, mobile');
  });

  it('reports invalid concurrency as a generic configuration failure', async () => {
    vi.mocked(runRegen).mockRejectedValue(
      new ConcurrencyError('WAGGLE_RENDER_CONCURRENCY must be an integer between 1 and 8.'),
    );

    const code = await runCli(['node', 'waggle', 'regen', '--project', projectDir]);

    expect(code).toBe(ExitCode.GENERIC_ERROR);
    expect(stderr.join('')).toContain('must be an integer between 1 and 8');
  });

  it.each(credentialErrorCases)(
    'maps credential binding error $code to exit $exitCode without printing metadata',
    async ({ code: errorCode, exitCode }) => {
      const safeMessage = `Credential configuration failed safely (${errorCode}).`;
      vi.mocked(runRegen).mockRejectedValue(
        new CredentialBindingError(errorCode, safeMessage, {
          envRef: 'WAGGLE_TEST_METADATA_REF',
        }),
      );

      const code = await runCli(['node', 'waggle', 'regen', '--project', projectDir]);

      expect(code).toBe(exitCode);
      expect(stderr.join('')).toContain(safeMessage);
      expect(stderr.join('')).not.toContain('WAGGLE_TEST_METADATA_REF');
    },
  );

  it('returns GENERIC_ERROR after a completed regen report records failures', async () => {
    vi.mocked(runRegen).mockResolvedValue({
      report: {
        schemaVersion: 1,
        generatedAt: '2026-08-21T00:00:00.000Z',
        irVersion: 1,
        concurrency: { limit: 1, source: 'test' },
        presets: [],
        success: false,
      },
      reportPath: path.join(projectDir, 'renders', 'regen', 'latest-run.json'),
    });

    const code = await runCli(['node', 'waggle', 'regen', '--project', projectDir]);

    expect(code).toBe(ExitCode.GENERIC_ERROR);
  });
});
