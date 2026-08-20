import { readFileSync } from 'node:fs';
import { CliExitError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { manifestPath } from '../project-layout.js';
import { type WaggleManifest, WaggleManifestSchema } from './schema.js';

/**
 * V8 has reported `(line X column Y)` directly in JSON.parse SyntaxError
 * messages since Node 20. Older engines only report a raw character offset
 * ("at position N"); offsetToLineCol is the fallback for that case so the
 * error still names a location instead of silently dropping it.
 */
function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function describeJsonSyntaxError(source: string, error: SyntaxError): string {
  const directMatch = /line (\d+) column (\d+)/.exec(error.message);
  if (directMatch) {
    return `line ${directMatch[1]}, column ${directMatch[2]}`;
  }
  const positionMatch = /position (\d+)/.exec(error.message);
  if (positionMatch) {
    const { line, column } = offsetToLineCol(source, Number(positionMatch[1]));
    return `line ${line}, column ${column}`;
  }
  return 'an unknown location';
}

/**
 * Reads and validates waggle.json inside `projectDir`.
 *
 * Every failure throws a CliExitError whose message names the manifest's
 * absolute file path plus either the JSON path of the offending field (a
 * zod validation failure) or the line/column of a JSON syntax error, so the
 * caller never sees a bare "invalid input".
 */
export function loadManifest(projectDir: string): WaggleManifest {
  const filePath = manifestPath(projectDir);

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new CliExitError(
      ExitCode.PROJECT_NOT_FOUND,
      `No Waggle project found: "${filePath}" does not exist. Run "waggle init <name>" first, or pass --project/--dir pointing at an existing project.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const location = describeJsonSyntaxError(raw, error as SyntaxError);
    throw new CliExitError(
      ExitCode.MANIFEST_INVALID,
      `${filePath} is not valid JSON (${location}): ${(error as Error).message}`,
    );
  }

  const result = WaggleManifestSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const jsonPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  - ${jsonPath}: ${issue.message}`;
      })
      .join('\n');
    throw new CliExitError(
      ExitCode.MANIFEST_INVALID,
      `${filePath} failed manifest validation:\n${details}`,
    );
  }

  return result.data;
}
