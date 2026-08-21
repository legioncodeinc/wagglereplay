import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CompositorRenderError,
  REPLAY_CAPTURES_SUBDIR,
  REPLAY_INDEX_FILENAME,
  type ReplayIndex,
  readReplayIndex,
  renderProject,
} from '@waggle/compose';
import {
  readCurrentIr,
  type SensitiveTextScrubber,
  type WalkthroughFlow,
  type WalkthroughStep,
} from '@waggle/ir';
import { createCredentialBindings } from '../credentials/binding.js';
import { REPLAY_PRESETS, ReplayPresetError, resolveReplayPreset } from '../presets/registry.js';
import {
  collectDriftNotes,
  type RunReport,
  type RunReportPreset,
  writeRunReport,
} from '../report/run-report.js';
import { REPLAY_MANIFEST_FILENAME, runReplaySession } from '../session/replay-session.js';
import type { ActWithValue } from '../steps/act.js';
import {
  CONCURRENCY_ENV_VAR,
  DEFAULT_CONCURRENCY,
  parseConcurrency,
  runWithConcurrency,
} from './concurrency.js';

/**
 * `waggle regen` in library form (prd-009 AC6): replay the current IR,
 * re-capture every configured preset, and re-composite them, honoring
 * WAGGLE_RENDER_CONCURRENCY (AC8) and writing the run report (AC7).
 *
 * "Configured presets" resolution order:
 *  1. an explicit `presetIds` (the CLI's `--preset`, repeatable),
 *  2. studio.json's `presetIds` (what the author checked in settings),
 *  3. waggle.json's `presets` keys that name a known REPLAY preset,
 *  4. otherwise the default replay preset.
 * Only ids in this package's replay registry run: a manifest preset is
 * output geometry, and capturing needs a real viewport context.
 */

export class RegenInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegenInputError';
  }
}

const STUDIO_SETTINGS_FILENAME = 'studio.json';

export interface RegenOptions {
  readonly projectDir: string;
  /** Explicit preset ids (CLI `--preset`); overrides configured discovery. */
  readonly presetIds?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  /** Injected browser so concurrent jobs share one launch. */
  readonly browser?: import('playwright-core').Browser;
  /** Test seam. Production regen builds project credential bindings internally. */
  readonly actWithValue?: ActWithValue;
  readonly scrubMessage?: SensitiveTextScrubber;
  readonly isCredentialStep?: (step: WalkthroughStep, stepIndex: number) => boolean;
  /** Tests: shrink pacing and capture for speed. */
  readonly fps?: number;
  readonly minDwellMs?: number;
}

export interface RegenResult {
  readonly report: RunReport;
  readonly reportPath: string;
}

/** Discovers the preset ids this regen runs, per the documented order. */
export function resolveConfiguredPresets(
  projectDir: string,
  explicit?: readonly string[],
): { presetIds: string[]; source: string; skipped: string[] } {
  if (explicit !== undefined && explicit.length > 0) {
    validateReplayPresetIds(explicit, 'explicit --preset');
    return { presetIds: [...explicit], source: 'explicit --preset', skipped: [] };
  }

  const studioPath = path.join(projectDir, STUDIO_SETTINGS_FILENAME);
  if (existsSync(studioPath)) {
    let studio: { presetIds?: string[] };
    try {
      studio = JSON.parse(readFileSync(studioPath, 'utf8')) as { presetIds?: string[] };
    } catch (error: unknown) {
      throw new RegenInputError(`"${studioPath}" could not be read: ${errorMessage(error)}`);
    }
    const ids = studio.presetIds ?? [];
    if (ids.length > 0) {
      validateReplayPresetIds(ids, 'studio.json presetIds');
      return { presetIds: ids, source: 'studio.json presetIds', skipped: [] };
    }
  }

  try {
    const manifest = JSON.parse(readFileSync(path.join(projectDir, 'waggle.json'), 'utf8')) as {
      presets?: Record<string, unknown>;
      defaults?: { preset?: string };
    };
    const ids = Object.keys(manifest.presets ?? {});
    if (ids.length > 0) {
      validateReplayPresetIds(ids, 'waggle.json presets');
      return { presetIds: ids, source: 'waggle.json presets', skipped: [] };
    }
    const defaultId = manifest.defaults?.preset;
    if (defaultId !== undefined) {
      validateReplayPresetIds([defaultId], 'waggle.json defaults.preset');
      return { presetIds: [defaultId], source: 'waggle.json defaults.preset', skipped: [] };
    }
  } catch (error: unknown) {
    if (error instanceof RegenInputError || error instanceof ReplayPresetError) {
      throw error;
    }
    throw new RegenInputError(
      `"${path.join(projectDir, 'waggle.json')}" could not be read: ${errorMessage(error)}`,
    );
  }

  return { presetIds: ['16x9'], source: 'built-in default', skipped: [] };
}

function validateReplayPresetIds(ids: readonly string[], source: string): void {
  for (const id of [...new Set(ids)]) {
    try {
      resolveReplayPreset(id);
    } catch (error: unknown) {
      if (error instanceof ReplayPresetError) {
        throw new ReplayPresetError(`${source}: ${error.message}`);
      }
      throw error;
    }
  }
}

export async function runRegen(options: RegenOptions): Promise<RegenResult> {
  const env = options.env ?? process.env;
  const projectDir = options.projectDir;
  const hasInjectedCredentialCallbacks =
    options.actWithValue !== undefined ||
    options.scrubMessage !== undefined ||
    options.isCredentialStep !== undefined;
  const credentialBindings = hasInjectedCredentialCallbacks
    ? null
    : createCredentialBindings({ projectDir, env });
  const actWithValue = options.actWithValue ?? credentialBindings?.actWithValue;
  const scrubMessage = options.scrubMessage ?? credentialBindings?.scrubMessage;
  const isCredentialStep = options.isCredentialStep ?? credentialBindings?.isCredentialStep;

  const current = readCurrentIr(projectDir);
  if (current === null) {
    throw new RegenInputError(
      `"${projectDir}" has no recorded Walkthrough IR yet. Run "waggle record" first (prd-004).`,
    );
  }

  const configured = resolveConfiguredPresets(projectDir, options.presetIds);
  const presetIds = [...new Set(configured.presetIds)];
  for (const id of presetIds) {
    // Fail fast on a typo before any browser launches.
    resolveReplayPreset(id);
  }

  const concurrencyLimit = parseConcurrency(env[CONCURRENCY_ENV_VAR]);
  const capturesRoot = path.join(projectDir, REPLAY_CAPTURES_SUBDIR, `v${String(current.version)}`);
  mkdirSync(capturesRoot, { recursive: true });

  const browser = options.browser;

  const jobs = presetIds.map((presetId) => {
    return async (): Promise<RunReportPreset> => {
      const preset = resolveReplayPreset(presetId);
      const outputDir = path.join(capturesRoot, preset.id);
      const session = await runReplaySession({
        flow: current.flow as WalkthroughFlow,
        irVersion: current.version,
        presetId: preset.id,
        outputDir,
        fps: options.fps,
        minDwellMs: options.minDwellMs,
        env,
        ...(browser !== undefined ? { browser } : {}),
        ...(actWithValue !== undefined ? { actWithValue } : {}),
        ...(scrubMessage !== undefined ? { scrubMessage } : {}),
        ...(isCredentialStep !== undefined ? { isCredentialStep } : {}),
      });

      const videoRef = path.relative(projectDir, session.videoPath).split(path.sep).join('/');
      const manifestRef = path.relative(projectDir, session.manifestPath).split(path.sep).join('/');

      // The composite half of the job: render through the prd-009 seam,
      // which finds this capture via the index written below.
      const index = readReplayIndex(projectDir, current.version) ?? {};
      index[preset.id] = {
        replayPresetId: preset.id,
        composePresetId: preset.composePresetId,
        videoRef,
        manifestRef,
      };
      writeIndex(capturesRoot, index);

      let render: RunReportPreset['render'] = null;
      try {
        const result = await renderProject({
          projectDir,
          presetId: preset.composePresetId,
          replayPresetId: preset.id,
          outputPath: path.join(
            projectDir,
            'renders',
            `walkthrough.v${String(current.version)}.replay-${preset.id}.${preset.composePresetId}.mp4`,
          ),
          env,
        });
        if (result.sourceKind !== 'replay' || result.sourceIdentity?.replayPresetId !== preset.id) {
          throw new Error(
            `Compositor did not use replay source "${preset.id}" (received ${result.sourceKind}).`,
          );
        }
        render = {
          outputPath: path.relative(projectDir, result.outputPath).split(path.sep).join('/'),
          reframe: result.reframe,
          durationMs: result.durationMs,
          sourceKind: result.sourceKind,
          sourceReplayPresetId: result.sourceIdentity?.replayPresetId ?? null,
          sourceVideoRef: result.sourceIdentity?.videoRef ?? null,
          sourceManifestRef: result.sourceIdentity?.manifestRef ?? null,
        };
      } catch (error: unknown) {
        const message =
          error instanceof CompositorRenderError && error.stderrTail !== ''
            ? `${error.message}: ${error.stderrTail}`
            : errorMessage(error);
        render = { error: scrubMessage?.(message) ?? message };
      }

      return {
        presetId: preset.id,
        composePresetId: preset.composePresetId,
        reflow: session.probe.decision,
        reflowReason: session.probe.reason,
        capture: {
          width: session.manifest.capture.width,
          height: session.manifest.capture.height,
          fps: session.manifest.capture.fps,
          durationMs: session.manifest.capture.durationMs,
        },
        videoRef,
        manifestRef,
        steps: session.steps.map((step) => ({
          stepIndex: step.stepIndex,
          stepType: step.stepType,
          ok: step.ok,
          startOffsetMs: step.startOffsetMs,
          durationMs: step.durationMs,
          settleSource: step.settle?.source ?? null,
          drift: step.selector?.drift ?? false,
          failure:
            step.failure === null
              ? null
              : { phase: step.failure.phase, message: step.failure.message },
        })),
        driftNotes: collectDriftNotes(session.steps),
        render,
      };
    };
  });

  const settled = await runWithConcurrency(jobs, concurrencyLimit);

  const presets: RunReportPreset[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    const presetId = presetIds[index] ?? 'unknown';
    const rawReason = errorMessage(result.reason);
    const reason = scrubMessage?.(rawReason) ?? rawReason;
    return {
      presetId,
      composePresetId: REPLAY_PRESETS[presetId]?.composePresetId ?? presetId,
      reflow: 'reframed',
      reflowReason: 'session failed before probing',
      capture: { width: 0, height: 0, fps: 0, durationMs: 0 },
      videoRef: null,
      manifestRef: null,
      steps: [],
      driftNotes: [],
      render: { error: `replay session failed: ${reason}` },
    };
  });

  const success = presets.every(
    (preset) =>
      preset.render !== null && !('error' in preset.render) && preset.steps.every((s) => s.ok),
  );

  const report: RunReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    irVersion: current.version,
    concurrency: {
      limit: concurrencyLimit,
      source:
        env[CONCURRENCY_ENV_VAR] !== undefined
          ? CONCURRENCY_ENV_VAR
          : `default ${DEFAULT_CONCURRENCY}`,
    },
    presets,
    success,
  };

  const reportPath = writeRunReport(projectDir, report);
  return { report, reportPath };
}

function writeIndex(capturesRoot: string, index: ReplayIndex): void {
  // Merge-safe: read-modify-write per job keeps concurrent preset jobs
  // from clobbering each other's entries (runWithConcurrency bounds them,
  // and Node's single thread serializes the sync write itself).
  const indexPath = path.join(capturesRoot, REPLAY_INDEX_FILENAME);
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
