// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { subdirPath } from '@waggle/ir';
import { readNarrationScript } from '@waggle/narrate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyHumanEdit,
  DescriptionNotFoundError,
  ensureNarrationScript,
  narrationScriptPath,
} from '../../../src/lib/server/narration-store.js';
import { buildTwoStepFlow } from '../../helpers/flow-fixture.js';

/**
 * AC4: the description editor's storage is `narration/script.json`, the
 * exact file `@waggle/narrate` already owns (see that package's
 * `run-narration.ts`, which refuses to synthesize past an unapproved
 * segment and explicitly names Studio as where an author edits
 * `approvedText`). These tests prove Studio writes exactly what that
 * package expects to read back.
 */
describe('narration-store (AC4)', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function seedDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'waggle-studio-narration-'));
    mkdirSync(subdirPath(dir, 'narration'), { recursive: true });
    cleanup.push(dir);
    return dir;
  }

  it('drafts a fresh script from the IR when narration/script.json does not exist', () => {
    const dir = seedDir();
    const flow = buildTwoStepFlow();
    const script = ensureNarrationScript(dir, flow, null);

    expect(script.segments).toHaveLength(2);
    expect(script.segments.every((segment) => !segment.approved)).toBe(true);
    expect(script.segments.every((segment) => segment.approvedText === null)).toBe(true);
    // Persisted, and readable back through @waggle/narrate's own reader.
    const onDisk = readNarrationScript(narrationScriptPath(dir));
    expect(onDisk).toEqual(script);
  });

  it('upgrades draft text with the predraft.json description when one exists for the step', () => {
    const dir = seedDir();
    const flow = buildTwoStepFlow();
    const predraft = {
      schemaVersion: 1 as const,
      irVersion: 1,
      steps: [
        {
          stepIndex: 1,
          description: 'A vision-model description of step two',
          machineDrafted: true as const,
          confidence: 'high' as const,
          provider: 'test-provider',
        },
      ],
    };
    const script = ensureNarrationScript(dir, flow, predraft);
    expect(script.segments[1]?.draftText).toBe('A vision-model description of step two');
    // Step 0 had no predraft entry, so it keeps the deterministic segmenter text.
    expect(script.segments[0]?.draftText).not.toBe('');
  });

  it('preserves an existing approval when the script is re-ensured against the same IR shape', () => {
    const dir = seedDir();
    const flow = buildTwoStepFlow();
    ensureNarrationScript(dir, flow, null);
    applyHumanEdit(dir, 0, 'A human-authored description');

    const again = ensureNarrationScript(dir, flow, null);
    expect(again.segments[0]?.approved).toBe(true);
    expect(again.segments[0]?.approvedText).toBe('A human-authored description');
  });

  it('applyHumanEdit sets approvedText and flips approved to true - "the machine-drafted flag clears"', () => {
    const dir = seedDir();
    const flow = buildTwoStepFlow();
    ensureNarrationScript(dir, flow, null);

    const before = readNarrationScript(narrationScriptPath(dir));
    expect(before.segments[0]?.approved).toBe(false);

    const updated = applyHumanEdit(dir, 0, '  Click the start button  ');
    expect(updated.approved).toBe(true);
    expect(updated.approvedText).toBe('Click the start button');

    const after = readNarrationScript(narrationScriptPath(dir));
    expect(after.segments[0]?.approved).toBe(true);
    expect(after.segments[0]?.approvedText).toBe('Click the start button');
  });

  it('falls back to the draft text when the human edit is empty/whitespace', () => {
    const dir = seedDir();
    const flow = buildTwoStepFlow();
    const script = ensureNarrationScript(dir, flow, null);
    const draftText = script.segments[0]?.draftText;

    const updated = applyHumanEdit(dir, 0, '   ');
    expect(updated.approved).toBe(true);
    expect(updated.approvedText).toBe(draftText);
  });

  it('throws DescriptionNotFoundError for an unknown step index', () => {
    const dir = seedDir();
    const flow = buildTwoStepFlow();
    ensureNarrationScript(dir, flow, null);
    expect(() => applyHumanEdit(dir, 99, 'text')).toThrow(DescriptionNotFoundError);
  });
});
