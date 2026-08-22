// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { subdirPath, type WalkthroughFlow } from '@waggle/ir';
import { stepDirName } from '$lib/frames.js';
import type { FrameSample } from '$lib/types.js';

/**
 * AC3's frame scrubber timeline: the `frame_t<+->N.png` samples
 * `@waggle/ingest`'s extraction plan writes across the +/-5s window
 * (`packages/ingest/src/frames/extraction-plan.ts`). These are not part of
 * the Walkthrough IR (`WaggleStepExtension.assets` only carries
 * `before`/`click`/`settled`, the three named roles - see
 * `packages/ir/src/schema/waggle-extensions.ts`), so this module reads the
 * step's own frame directory directly rather than inventing a new IR
 * field for something already fully derivable from what ingest already
 * wrote to disk.
 */
const SAMPLE_PATTERN = /^frame_t([+-]\d+)\.png$/;

function listSamplesForStep(
  projectDir: string,
  irVersion: number,
  stepIndex: number,
): FrameSample[] {
  const dir = path.join(
    subdirPath(projectDir, 'steps'),
    `v${String(irVersion)}`,
    stepDirName(stepIndex),
  );
  if (!existsSync(dir)) return [];

  const samples: FrameSample[] = [];
  for (const fileName of readdirSync(dir)) {
    const match = SAMPLE_PATTERN.exec(fileName);
    if (match?.[1] === undefined) continue;
    samples.push({ fileName, offsetMs: Number.parseInt(match[1], 10) });
  }
  samples.sort((a, b) => a.offsetMs - b.offsetMs);
  return samples;
}

/** Builds the sample list for every step in `flow`, keyed by step index. */
export function buildFrameSampleMap(
  projectDir: string,
  irVersion: number,
  flow: WalkthroughFlow,
): Record<number, FrameSample[]> {
  const map: Record<number, FrameSample[]> = {};
  flow.steps.forEach((_step, index) => {
    map[index] = listSamplesForStep(projectDir, irVersion, index);
  });
  return map;
}
