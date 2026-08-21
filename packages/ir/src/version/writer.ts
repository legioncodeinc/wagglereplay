import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  FIRST_IR_VERSION,
  manifestPath,
  parseWalkthroughVersion,
  walkthroughPath,
} from '../project/layout.js';
import { type WaggleManifest, WaggleManifestSchema } from '../project/manifest.js';
import type { WalkthroughFlow } from '../schema/flow.js';
import { assertWalkthroughFlow, formatIssuePath } from '../validate.js';

/**
 * The immutable IR version writer (ADR-015: "IR versions are immutable
 * files; the project manifest points at the current version").
 *
 * Saving never mutates an existing `walkthrough.v{n}.json`. It writes
 * `walkthrough.v(n+1).json` with the `wx` open flag, so the filesystem
 * itself refuses the write if that version somehow already exists, and
 * only then repoints `waggle.json`. If the manifest update fails, the new
 * version file is still on disk and no prior version was touched: the
 * project is recoverable by hand, which is the whole point of keeping the
 * datastore in plain files.
 */

/** Raised for filesystem and precondition failures around IR versions. */
export class IrWriteError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IrWriteError';
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/** Every IR version present in the project directory, ascending. */
export function listIrVersions(projectDir: string): number[] {
  let entries: string[];
  try {
    entries = readdirSync(projectDir);
  } catch (error) {
    throw new IrWriteError(
      `Cannot read Waggle project directory "${projectDir}": it does not exist or is not readable.`,
      { cause: error },
    );
  }

  const versions: number[] = [];
  for (const entry of entries) {
    const version = parseWalkthroughVersion(entry);
    if (version !== null) {
      versions.push(version);
    }
  }
  return versions.sort((a, b) => a - b);
}

/** The highest IR version present on disk, or `null` for a project with none. */
export function latestIrVersion(projectDir: string): number | null {
  const versions = listIrVersions(projectDir);
  return versions.at(-1) ?? null;
}

/** Reads and validates one IR version file. */
export function readIrVersion(projectDir: string, version: number): WalkthroughFlow {
  const filePath = walkthroughPath(projectDir, version);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new IrWriteError(`No Walkthrough IR version ${version} at "${filePath}".`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new IrWriteError(`"${filePath}" is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }

  return assertWalkthroughFlow(parsed, filePath);
}

function readManifest(projectDir: string): WaggleManifest {
  const filePath = manifestPath(projectDir);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new IrWriteError(
      `No Waggle project manifest at "${filePath}". Run "waggle init <name>" first.`,
      { cause: error },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new IrWriteError(`"${filePath}" is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }

  const result = WaggleManifestSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${formatIssuePath(issue.path)}: ${issue.message}`)
      .join('\n');
    throw new IrWriteError(`"${filePath}" failed manifest validation:\n${detail}`);
  }
  return result.data;
}

/** Serializes a JSON document the way every Waggle project file is written. */
function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Reads the IR version the manifest currently points at, or `null` if there is none. */
export function readCurrentIr(
  projectDir: string,
): { readonly version: number; readonly flow: WalkthroughFlow } | null {
  const manifest = readManifest(projectDir);
  if (manifest.currentIrVersion === null) {
    return null;
  }
  return {
    version: manifest.currentIrVersion,
    flow: readIrVersion(projectDir, manifest.currentIrVersion),
  };
}

export interface IrWriteResult {
  /** The version number just written. */
  readonly version: number;
  /** Absolute or caller-relative path of the file just written. */
  readonly filePath: string;
  /** The manifest as it now stands on disk. */
  readonly manifest: WaggleManifest;
}

/**
 * Writes `flow` as the next immutable IR version and repoints the
 * manifest at it.
 *
 * Throws `IrValidationError` before touching the filesystem if the flow is
 * not a valid Walkthrough IR, and `IrWriteError` if the project directory
 * or manifest is missing or the target version file already exists. Prior
 * versions are never opened for writing.
 */
export function writeNextIrVersion(projectDir: string, flow: unknown): IrWriteResult {
  const validated = assertWalkthroughFlow(flow, 'Walkthrough IR to be written');

  // Read the manifest before writing anything: a project with no manifest
  // is not a Waggle project, and failing here leaves the directory
  // untouched rather than orphaning a version file.
  const manifest = readManifest(projectDir);

  const latest = latestIrVersion(projectDir);
  const version = latest === null ? FIRST_IR_VERSION : latest + 1;
  const filePath = walkthroughPath(projectDir, version);

  try {
    // 'wx' makes the immutability guarantee the filesystem's job, not a
    // TOCTOU-prone existsSync() check of our own.
    writeFileSync(filePath, serialize(validated), { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (isErrnoException(error) && error.code === 'EEXIST') {
      throw new IrWriteError(
        `Refusing to overwrite "${filePath}": Walkthrough IR versions are immutable (ADR-015). This usually means the directory listing and the filesystem disagree; inspect the project directory by hand.`,
        { cause: error },
      );
    }
    throw new IrWriteError(`Failed to write "${filePath}": ${(error as Error).message}`, {
      cause: error,
    });
  }

  const updated: WaggleManifest = { ...manifest, currentIrVersion: version };
  try {
    writeFileSync(manifestPath(projectDir), serialize(updated), 'utf8');
  } catch (error) {
    throw new IrWriteError(
      `Wrote "${filePath}" but failed to update the manifest pointer at "${manifestPath(projectDir)}": ${(error as Error).message}. The new version is on disk and no prior version was modified; set "currentIrVersion" to ${version} by hand to recover.`,
      { cause: error },
    );
  }

  return { version, filePath, manifest: updated };
}
