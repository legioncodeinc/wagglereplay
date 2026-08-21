import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readCurrentIr, subdirPath, type WalkthroughFlow } from '@waggle/ir';
import { NarrationWordsDocumentSchema } from '@waggle/narrate';
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
 * prd-009 replays the IR against the live app and produces a fresh capture
 * instead. When it lands, this function is the ONLY thing that changes:
 * it takes the replay's output path and returns
 * `probeSourceVideo(replayPath, 'replay')`. Nothing downstream (the graph
 * builder, the caption generator, the cursor synthesizer, the encoder)
 * reads `kind` for anything except the render metadata, because everything
 * they need is the probed width, height, duration, and audio presence.
 *
 * The `SourceVideo` interface in ../compositor.ts documents the same seam
 * from the type side.
 * =========================================================================
 */
export async function resolveSourceVideo(
  projectDir: string,
  flow: WalkthroughFlow,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SourceVideo> {
  const recording = flow.waggle.sourceRecording;
  if (recording === undefined) {
    throw new RenderInputError(
      `The current Walkthrough IR has no "waggle.sourceRecording", so there is no video to composite over. Record with the source recording kept (prd-004), or wait for replay-sourced video (prd-009).`,
    );
  }
  const videoPath = path.resolve(projectDir, recording.videoRef);
  if (!existsSync(videoPath)) {
    throw new RenderInputError(
      `The IR points at a source recording "${recording.videoRef}" that does not exist (looked in "${videoPath}").`,
    );
  }
  return probeSourceVideo(videoPath, 'original-recording', env);
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

  const source = await resolveSourceVideo(projectDir, current.flow, env);
  const narration = loadNarration(projectDir);

  const rendersDir = subdirPath(projectDir, 'renders');
  const outputPath =
    options.outputPath ??
    path.join(rendersDir, renderFilename(current.version, brandKit, resolved.preset.id));
  const workDir = path.join(rendersDir, WORK_SUBDIR, `${brandKit.id}.${resolved.preset.id}`);

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
    dryRun: options.dryRun ?? false,
  });

  const metadataPath = `${outputPath}.render.json`;
  if (result.encoded) {
    writeRenderMetadata(metadataPath, result, current.version, compositor.name);
  }

  return { ...result, irVersion: current.version, metadataPath };
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
