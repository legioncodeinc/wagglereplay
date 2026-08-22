// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { subdirPath } from '@waggle/ir';
import type { StepExecutionResult } from '../steps/replay-step.js';

/**
 * The regen run report (prd-009 AC7): steps, settle sources, durations,
 * failures, and drift notes, per preset, written into the project.
 *
 * Lives under `renders/regen/` because a report documents one run's
 * output: it changes on every regen (durations vary with the machine),
 * so it belongs with the other regenerated artifacts ADR-015 keeps out
 * of git, not among the committable sources. `latest-run.json` is
 * overwritten per run; the drift e2e copies it into the PRD's qa/ folder
 * as its evidence.
 */

export const RUN_REPORT_SCHEMA_VERSION = 1;
export const RUN_REPORT_DIR = path.join('renders', 'regen');
export const RUN_REPORT_FILENAME = 'latest-run.json';

export interface DriftNote {
  readonly stepIndex: number;
  readonly stepType: string;
  /** The alternative index that resolved (0 = the recorded first choice). */
  readonly usedAlternativeIndex: number;
  /** The selector that actually matched. */
  readonly usedSelector: string;
  /** The recorded first-choice selector that failed. */
  readonly firstChoice: string;
}

export interface RunReportStep {
  readonly stepIndex: number;
  readonly stepType: string;
  readonly ok: boolean;
  readonly startOffsetMs: number;
  readonly durationMs: number;
  readonly settleSource: string | null;
  readonly drift: boolean;
  readonly failure: { phase: string; message: string } | null;
}

export interface RunReportPreset {
  readonly presetId: string;
  readonly composePresetId: string;
  readonly reflow: 'native' | 'reframed';
  readonly reflowReason: string;
  readonly capture: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly durationMs: number;
  };
  readonly videoRef: string | null;
  readonly manifestRef: string | null;
  readonly steps: readonly RunReportStep[];
  readonly driftNotes: readonly DriftNote[];
  readonly render:
    | {
        readonly outputPath: string;
        readonly reframe: string;
        readonly durationMs: number;
        readonly sourceKind: 'original-recording' | 'replay';
        readonly sourceReplayPresetId: string | null;
        readonly sourceVideoRef: string | null;
        readonly sourceManifestRef: string | null;
      }
    | { readonly error: string }
    | null;
}

export interface RunReport {
  readonly schemaVersion: typeof RUN_REPORT_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly irVersion: number;
  readonly concurrency: { readonly limit: number; readonly source: string };
  readonly presets: readonly RunReportPreset[];
  /** True when every preset captured and rendered without a failed step. */
  readonly success: boolean;
}

/** Extracts drift notes from a session's step results (AC6 drift recording). */
export function collectDriftNotes(steps: readonly StepExecutionResult[]): DriftNote[] {
  const notes: DriftNote[] = [];
  for (const step of steps) {
    if (step.selector === null || !step.selector.drift) {
      continue;
    }
    notes.push({
      stepIndex: step.stepIndex,
      stepType: step.stepType,
      usedAlternativeIndex: step.selector.alternativeIndex,
      usedSelector: step.selector.playwright,
      firstChoice: step.attemptedSelectors[0] ?? step.selector.recorded,
    });
  }
  return notes;
}

export function writeRunReport(projectDir: string, report: RunReport): string {
  const dir = subdirPath(projectDir, 'renders');
  const reportDir = path.join(dir, 'regen');
  mkdirSync(reportDir, { recursive: true });
  const filePath = path.join(reportDir, RUN_REPORT_FILENAME);
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return filePath;
}
