// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  NarrationScriptInvalidError,
  narrationScriptExists,
  readNarrationScript,
  writeNarrationScript,
} from '../../src/script/script-io.js';
import {
  NARRATION_SCRIPT_SCHEMA_VERSION,
  type NarrationScript,
} from '../../src/script/script-schema.js';

describe('script-io', () => {
  const cleanupDirs: string[] = [];
  afterEach(() => {
    for (const dir of cleanupDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempFile(name: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-narrate-script-'));
    cleanupDirs.push(dir);
    return path.join(dir, name);
  }

  const sample: NarrationScript = {
    schemaVersion: NARRATION_SCRIPT_SCHEMA_VERSION,
    segments: [
      {
        narrationSegmentId: 'step-0',
        stepIndex: 0,
        draftText: 'Draft.',
        approvedText: 'Approved.',
        approved: true,
        targetDurationMs: 800,
      },
    ],
  };

  it('narrationScriptExists is false before writing, true after', () => {
    const filePath = tempFile('script.json');
    expect(narrationScriptExists(filePath)).toBe(false);
    writeNarrationScript(filePath, sample);
    expect(narrationScriptExists(filePath)).toBe(true);
  });

  it('round-trips a script through write then read', () => {
    const filePath = tempFile('script.json');
    writeNarrationScript(filePath, sample);
    expect(readNarrationScript(filePath)).toEqual(sample);
  });

  it('throws NarrationScriptInvalidError on malformed JSON', () => {
    const filePath = tempFile('script.json');
    writeFileSync(filePath, '{ not valid json');
    expect(() => readNarrationScript(filePath)).toThrow(NarrationScriptInvalidError);
  });

  it('throws NarrationScriptInvalidError when the JSON fails schema validation', () => {
    const filePath = tempFile('script.json');
    writeFileSync(
      filePath,
      JSON.stringify({ schemaVersion: 1, segments: [{ narrationSegmentId: '' }] }),
    );
    expect(() => readNarrationScript(filePath)).toThrow(NarrationScriptInvalidError);
  });
});
