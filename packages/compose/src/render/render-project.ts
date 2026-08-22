// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readCurrentIr, subdirPath, type WalkthroughFlow } from '@waggle/ir';
import { NarrationWordsDocumentSchema } from '@waggle/narrate';
import { z } from 'zod';
import { loadBrandKit } from '../brand/io.js';
import type { BrandKit } from '../brand/schema.js';
import type {
  CompositeResult,
  Compositor,
  NarrationInput,
  PictureInPictureInput,
  SourceVideo,
} from '../compositor.js';
import { CompositorInputError } from '../compositor.js';
import { FfmpegCompositor } from '../ffmpeg/backend.js';
import { probeSourceVideo } from '../ffmpeg/probe.js';
import { DEFAULT_PRESET_ID, resolvePreset } from '../presets.js';

/**
 * `waggle render` in library form: everything between "a project directory
 * on disk" and "a finished MP4" (prd-007 AC7, AC8).
 *
 * This module is deliberately the ONLY place that knows about the ADR-015
 * project layout. The compositor itself takes paths and objects, which is
 * what lets prd-014's Remotion backend be dropped in below this layer, and
 * what lets a test drive the compositor without staging a whole project.
 */

/** Subdirectory of `renders/` holding generated intermediates. */
export const WORK_SUBDIR = '.work';

/** Audio filenames `@waggle/narrate` can produce, in the order they are tried. */
const NARRATION_AUDIO_FILENAMES = ['audio.mp3', 'audio.wav', 'audio.ogg'] as const;

export class RenderInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderInputError';
  }
}

/**
 * ============================ THE prd-009 SEAM ============================
 *
 * Phase 1 composites over the ORIGINAL screen recording the extension
 * captured, which the IR points at via
 * `flow.waggle.sourceRecording.videoRef`.
 *
 * prd-009 replays the IR against the live app and produces a fresh
 * capture under `recordings/replay/v{irVersion}/`, indexed by
 * `recordings/replay/v{irVersion}/index.json` (written per regen). When
 * an index entry exists for the requested replay identity AND its video
 * is on disk, THAT capture wins and this function returns
 * `probeSourceVideo(replayPath, 'replay')`. Nothing downstream (the
 * graph builder, the caption generator, the cursor synthesizer, the
 * encoder) reads `kind` for anything except the render metadata, because
 * everything they need is the probed width, height, duration, and audio
 * presence.
 *
 * The `SourceVideo` interface in ../compositor.ts documents the same seam
 * from the type side. `loadReplayFocusTrack` is the same seam for the
 * ADR-011 focus track (prd-009 AC5).
 * =========================================================================
 */

/** Directory replay captures live in, versioned like the recordings they replace. */
export const REPLAY_CAPTURES_SUBDIR = path.join('recordings', 'replay');
/** The index file a regen writes per IR version, mapping replay presets to captures. */
export const REPLAY_INDEX_FILENAME = 'index.json';

export interface ReplayIndexEntry {
  /** The replay preset that captured this entry. */
  readonly replayPresetId: string;
  /** The compose geometry this replay capture targets. */
  readonly composePresetId: string;
  /** Project-relative video path. */
  readonly videoRef: string;
  /** Project-relative timing-manifest path. */
  readonly manifestRef: string;
}

export type ReplayIndex = Record<string, ReplayIndexEntry>;

const ReplayIndexEntrySchema = z.strictObject({
  replayPresetId: z.string().min(1),
  composePresetId: z.string().min(1),
  videoRef: z.string().min(1),
  manifestRef: z.string().min(1),
});

const ReplayIndexSchema = z.record(z.string(), ReplayIndexEntrySchema);

export class ReplayIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayIndexError';
  }
}

function isWithinDirectory(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

/** Resolve an IR/index reference without allowing it to escape the project directory. */
function resolveProjectReference(projectDir: string, reference: string): string | null {
  if (path.isAbsolute(reference)) return null;

  const projectRoot = path.resolve(projectDir);
  const candidate = path.resolve(projectRoot, reference);
  if (!isWithinDirectory(projectRoot, candidate)) return null;

  // Lexical confinement blocks traversal. Real-path confinement also blocks an
  // existing in-project symlink that points at a file outside the project.
  if (existsSync(candidate)) {
    const realRoot = realpathSync(projectRoot);
    const realCandidate = realpathSync(candidate);
    if (!isWithinDirectory(realRoot, realCandidate)) return null;
    return realCandidate;
  }
  return candidate;
}

/** Reads the replay index for an IR version, or null when no replay has run. */
export function readReplayIndex(projectDir: string, irVersion: number): ReplayIndex | null {
  const indexPath = path.join(
    projectDir,
    REPLAY_CAPTURES_SUBDIR,
    `v${String(irVersion)}`,
    REPLAY_INDEX_FILENAME,
  );
  if (!existsSync(indexPath)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch (error) {
    throw new ReplayIndexError(`"${indexPath}" is not valid JSON: ${(error as Error).message}`);
  }
  const validated = ReplayIndexSchema.safeParse(parsed);
  if (!validated.success) {
    const details = validated.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ReplayIndexError(
      `"${indexPath}" must map replay preset ids to valid capture entries: ${details}`,
    );
  }
  return validated.data;
}

export interface ResolveSourceOptions {
  /** The compose preset being rendered; replay entries declare the geometry they target. */
  readonly presetId?: string;
  /** The IR version being rendered; replays are versioned by it. */
  readonly irVersion?: number;
  /** Exact replay capture identity, required when aliases share compose geometry. */
  readonly replayPresetId?: string;
}

function selectReplayEntry(
  index: ReplayIndex | null,
  composePresetId: string,
  replayPresetId?: string,
): ReplayIndexEntry | undefined {
  if (index === null) {
    return undefined;
  }
  if (replayPresetId !== undefined) {
    const exact = index[replayPresetId];
    if (exact === undefined) {
      throw new ReplayIndexError(
        `Replay preset "${replayPresetId}" is not present in the replay index.`,
      );
    }
    if (exact.composePresetId !== composePresetId) {
      throw new ReplayIndexError(
        `Replay preset "${replayPresetId}" targets compose preset "${exact.composePresetId}", not "${composePresetId}".`,
      );
    }
    return exact;
  }
  const matches = Object.values(index).filter((entry) => entry.composePresetId === composePresetId);
  if (matches.length > 1) {
    throw new ReplayIndexError(
      `Compose preset "${composePresetId}" has multiple replay captures (${matches
        .map((entry) => entry.replayPresetId)
        .sort()
        .join(', ')}). Supply replayPresetId to choose one explicitly.`,
    );
  }
  return matches[0];
}

export async function resolveSourceVideo(
  projectDir: string,
  flow: WalkthroughFlow,
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveSourceOptions = {},
): Promise<SourceVideo> {
  if (options.presetId !== undefined && options.irVersion !== undefined) {
    const index = readReplayIndex(projectDir, options.irVersion);
    const entry = selectReplayEntry(index, options.presetId, options.replayPresetId);
    if (entry !== undefined) {
      const replayPath = resolveProjectReference(projectDir, entry.videoRef);
      if (replayPath === null) {
        throw new ReplayIndexError(
          `Replay preset "${entry.replayPresetId}" has an invalid project-relative video reference.`,
        );
      }
      if (existsSync(replayPath)) {
        return probeSourceVideo(replayPath, 'replay', env);
      }
      if (options.replayPresetId !== undefined) {
        throw new ReplayIndexError(
          `Replay preset "${options.replayPresetId}" points at missing video "${entry.videoRef}".`,
        );
      }
    }
  }

  const recording = flow.waggle.sourceRecording;
  if (recording === undefined) {
    throw new RenderInputError(
      `The current Walkthrough IR has no "waggle.sourceRecording", so there is no video to composite over. Record with the source recording kept (prd-004), replay first ("waggle regen", prd-009), or wait for replay-sourced video.`,
    );
  }
  const videoPath = resolveProjectReference(projectDir, recording.videoRef);
  if (videoPath === null) {
    throw new RenderInputError(
      'The IR source recording has an invalid project-relative video reference.',
    );
  }
  if (!existsSync(videoPath)) {
    throw new RenderInputError(
      `The IR points at a source recording "${recording.videoRef}" that does not exist (looked in "${videoPath}").`,
    );
  }
  return probeSourceVideo(videoPath, 'original-recording', env);
}

/**
 * The AC5 half of the seam: the replay capture's timing manifest carries
 * a focus track measured live during replay; when present it replaces
 * the recorded-IR focus events for the ADR-011 crop window.
 */
export function loadReplayFocusTrack(
  projectDir: string,
  irVersion: number,
  presetId: string,
  replayPresetId?: string,
): readonly { atMs: number; nx: number; ny: number }[] | undefined {
  const index = readReplayIndex(projectDir, irVersion);
  const entry = selectReplayEntry(index, presetId, replayPresetId);
  if (entry === undefined) {
    return undefined;
  }
  const manifestPath = resolveProjectReference(projectDir, entry.manifestRef);
  if (manifestPath === null) {
    throw new ReplayIndexError(
      `Replay preset "${entry.replayPresetId}" has an invalid project-relative manifest reference.`,
    );
  }
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      focusTrack?: { atMs: number; nx: number; ny: number }[];
    };
    return Array.isArray(parsed.focusTrack) ? parsed.focusTrack : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Loads `narration/words.json` and its paired audio, or `null` when the
 * project has not been narrated.
 *
 * Both must be present: `words.json` times words against an audio file, so
 * one without the other is a broken project, not a silent-video project,
 * and it is reported rather than skipped.
 */
export function loadNarration(projectDir: string): NarrationInput | null {
  const narrationDir = subdirPath(projectDir, 'narration');
  const wordsPath = path.join(narrationDir, 'words.json');
  const audioPath = NARRATION_AUDIO_FILENAMES.map((name) => path.join(narrationDir, name)).find(
    (candidate) => existsSync(candidate),
  );

  if (!existsSync(wordsPath)) {
    if (audioPath !== undefined) {
      throw new RenderInputError(
        `"${audioPath}" exists but "${wordsPath}" does not. Captions cannot be timed without word timings; re-run "waggle narrate".`,
      );
    }
    return null;
  }
  if (audioPath === undefined) {
    throw new RenderInputError(
      `"${wordsPath}" exists but no narration audio was found in "${narrationDir}" (looked for ${NARRATION_AUDIO_FILENAMES.join(', ')}).`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(wordsPath, 'utf8'));
  } catch (error) {
    throw new RenderInputError(`"${wordsPath}" is not valid JSON: ${(error as Error).message}`);
  }

  const result = NarrationWordsDocumentSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new RenderInputError(
      `"${wordsPath}" does not satisfy the words.json contract:\n${details}`,
    );
  }

  return { audioPath, words: result.data };
}

export interface RenderProjectOptions {
  readonly projectDir: string;
  /** Preset id, resolved against the manifest first (see ../presets.ts). */
  readonly presetId?: string;
  /** Exact replay capture to composite when several replay presets share one output geometry. */
  readonly replayPresetId?: string;
  /** Brand kit id; defaults to the preset's own kit, then to `default`. */
  readonly brandKitId?: string;
  /** Overrides the computed output path. */
  readonly outputPath?: string;
  /** Injected for tests and for prd-014's Remotion backend. */
  readonly compositor?: Compositor;
  /** ADR-007's reserved slot; prd-017 supplies this. */
  readonly pictureInPicture?: PictureInPictureInput | null;
  readonly dryRun?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RenderProjectResult extends CompositeResult {
  readonly irVersion: number;
  readonly metadataPath: string;
  readonly sourceIdentity: ReplayIndexEntry | null;
}

/** Default output filename: identifies the exact (IR, kit, preset) triple. */
export function renderFilename(irVersion: number, kit: BrandKit, presetId: string): string {
  return `walkthrough.v${irVersion}.${kit.id}.${presetId}.mp4`;
}

export async function renderProject(options: RenderProjectOptions): Promise<RenderProjectResult> {
  const { projectDir } = options;
  const env = options.env ?? process.env;

  const current = readCurrentIr(projectDir);
  if (current === null) {
    throw new RenderInputError(
      `"${projectDir}" has no recorded Walkthrough IR yet. Run "waggle record" first (prd-004).`,
    );
  }

  const manifestRaw = JSON.parse(readFileSync(path.join(projectDir, 'waggle.json'), 'utf8')) as {
    presets?: Record<string, unknown>;
    defaults?: { preset?: string };
  };
  const presetId = options.presetId ?? manifestRaw.defaults?.preset ?? DEFAULT_PRESET_ID;
  const resolved = resolvePreset(presetId, manifestRaw.presets ?? {});

  const kitId = options.brandKitId ?? resolved.brandKitId ?? undefined;
  const brandKit = loadBrandKit(projectDir, kitId);

  const source = await resolveSourceVideo(projectDir, current.flow, env, {
    presetId: resolved.preset.id,
    irVersion: current.version,
    replayPresetId: options.replayPresetId,
  });
  const replayIndex = readReplayIndex(projectDir, current.version);
  const sourceIdentity =
    source.kind === 'replay'
      ? (selectReplayEntry(replayIndex, resolved.preset.id, options.replayPresetId) ?? null)
      : null;
  const focusTrack = loadReplayFocusTrack(
    projectDir,
    current.version,
    resolved.preset.id,
    options.replayPresetId,
  );
  const narration = loadNarration(projectDir);

  const rendersDir = subdirPath(projectDir, 'renders');
  const outputPath =
    options.outputPath ??
    path.join(rendersDir, renderFilename(current.version, brandKit, resolved.preset.id));
  const replayWorkSuffix =
    options.replayPresetId === undefined
      ? ''
      : `.replay-${safePathSegment(options.replayPresetId)}`;
  const workDir = path.join(
    rendersDir,
    WORK_SUBDIR,
    `${brandKit.id}.${resolved.preset.id}${replayWorkSuffix}`,
  );

  const compositor = options.compositor ?? new FfmpegCompositor({ env });
  const result = await compositor.composite({
    source,
    flow: current.flow,
    narration,
    brandKit,
    assetBaseDir: projectDir,
    preset: resolved.preset,
    output: { path: outputPath, workDir },
    pictureInPicture: options.pictureInPicture ?? null,
    ...(focusTrack !== undefined ? { focusTrack } : {}),
    dryRun: options.dryRun ?? false,
  });

  const metadataPath = `${outputPath}.render.json`;
  if (result.encoded) {
    writeRenderMetadata(metadataPath, result, current.version, compositor.name, sourceIdentity);
  }

  return { ...result, irVersion: current.version, metadataPath, sourceIdentity };
}

function safePathSegment(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Writes the render sidecar.
 *
 * ADR-011 requires reframed output to be "marked in output metadata as
 * native or reframed", and AC8's "a second brand kit changes only branded
 * elements" is far easier to audit when each render says which kit made
 * it. Deliberately carries no timestamp: a sidecar with a clock in it
 * would be the one part of a render that is not reproducible.
 */
function writeRenderMetadata(
  metadataPath: string,
  result: CompositeResult,
  irVersion: number,
  backend: string,
  sourceIdentity: ReplayIndexEntry | null,
): void {
  const metadata = {
    schemaVersion: 1,
    backend,
    irVersion,
    brandKitId: result.brandKitId,
    preset: {
      id: result.presetId,
      width: result.width,
      height: result.height,
      fps: result.fps,
    },
    reframe: result.reframe,
    sourceKind: result.sourceKind,
    sourceIdentity,
    durationMs: result.durationMs,
    layers: result.layers,
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

/**
 * Files a render must never touch (AC8). Exported so the test suite hashes
 * exactly the set this module promises to leave alone rather than a set it
 * invented for itself.
 */
export function immutableRenderInputs(projectDir: string, irVersion: number): string[] {
  const narrationDir = subdirPath(projectDir, 'narration');
  return [
    path.join(projectDir, `walkthrough.v${irVersion}.json`),
    path.join(projectDir, 'waggle.json'),
    path.join(narrationDir, 'words.json'),
    path.join(narrationDir, 'script.json'),
    path.join(narrationDir, 'transcript.txt'),
    ...NARRATION_AUDIO_FILENAMES.map((name) => path.join(narrationDir, name)),
  ].filter((candidate) => existsSync(candidate));
}

/** Re-exported so a caller can construct the default backend explicitly. */
export { CompositorInputError, FfmpegCompositor };
