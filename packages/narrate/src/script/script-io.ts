import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { type NarrationScript, NarrationScriptSchema } from './script-schema.js';

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function narrationScriptExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function writeNarrationScript(filePath: string, script: NarrationScript): void {
  const validated = NarrationScriptSchema.parse(script);
  writeFileSync(filePath, serializeJson(validated), 'utf8');
}

/** Thrown when `narration/script.json` exists but fails schema validation. */
export class NarrationScriptInvalidError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(
      `"${filePath}" failed narration script validation: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'NarrationScriptInvalidError';
  }
}

export function readNarrationScript(filePath: string): NarrationScript {
  const raw = readFileSync(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new NarrationScriptInvalidError(filePath, error);
  }
  const result = NarrationScriptSchema.safeParse(parsed);
  if (!result.success) {
    throw new NarrationScriptInvalidError(filePath, result.error);
  }
  return result.data;
}
