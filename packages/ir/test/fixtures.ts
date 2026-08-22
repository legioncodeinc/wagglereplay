// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The documented fixture set for prd-002 AC2 and AC3.
 *
 * Fixtures are plain JSON on disk rather than object literals in a test
 * file on purpose: they are the same bytes a real project directory holds
 * (ADR-015), so a fixture that only validates because TypeScript widened a
 * literal would be caught here rather than in production.
 */

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}

/** Every valid Walkthrough IR fixture, one per step classification plus a mixed flow. */
export const VALID_FLOW_FIXTURES = [
  'flow-navigate',
  'flow-state-change',
  'flow-input',
  'flow-scroll',
  'flow-mixed',
] as const;

/** Bare Chrome DevTools Recorder exports: no `waggle` keys anywhere. */
export const RECORDER_FIXTURES = ['chrome-recorder-export', 'chrome-recorder-no-viewport'] as const;

export type ValidFlowFixtureName = (typeof VALID_FLOW_FIXTURES)[number];
export type RecorderFixtureName = (typeof RECORDER_FIXTURES)[number];
