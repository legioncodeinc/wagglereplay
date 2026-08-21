import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_PRESET_ID } from '@waggle/compose';
import { subdirPath } from '@waggle/ir';
import { NarrationWordsDocumentSchema, renderTranscript, renderVtt } from '@waggle/narrate';
import { type FfmpegRunner } from '../ffmpeg-run.js';
import {
  RENDER_SHARE_SUBDIR,
  type RenderOutputInfo,
  renderOutputsForVersion,
} from '../list-renders.js';
import { ensureRenderManifest, type RenderManifest } from '../manifest.js';
import { choosePosterTimeMs, generatePoster } from '../poster.js';
import { buildShareHtml, type ShareRenderVariant } from './html-template.js';
import { checkLinkIntegrity } from './link-integrity.js';

/**
 * Assembles the prd-008 AC2 share bundle: one self-contained HTML page
 * plus every sibling file it links to, in one directory suitable for any
 * static host or a GitHub Pages branch (ADR-009). Lives under
 * `renders/share/` so the project's existing `.gitignore` entry for
 * `renders/` already keeps it out of git without any change to `waggle
 * init`'s scaffolding.
 */

const POSTER_FILENAME = 'poster.jpg';
const CAPTIONS_FILENAME = 'captions.vtt';
const TRANSCRIPT_FILENAME = 'transcript.txt';
const BUNDLE_INDEX_FILENAME = 'index.html';

export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleError';
  }
}

export class BundleLinkIntegrityError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `The generated share page references ${missing.length} file(s) that do not exist in the bundle: ${missing.join(', ')}`,
    );
    this.name = 'BundleLinkIntegrityError';
    this.missing = missing;
  }
}

export interface BuildShareBundleOptions {
  readonly projectDir: string;
  /** Which IR version to export; defaults to the project's current version. */
  readonly irVersion: number;
  readonly walkthroughTitle: string;
  readonly projectName: string;
  /** Preset id to feature as the embedded player; defaults to the compose default preset if present, else the first available. */
  readonly preferredPresetId?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly ffmpegRunner?: FfmpegRunner;
}

export interface BuildShareBundleResult {
  readonly bundleDir: string;
  readonly indexPath: string;
  readonly primary: RenderManifest;
  readonly alternates: readonly RenderManifest[];
  readonly hasCaptions: boolean;
  readonly hasTranscript: boolean;
}

/** `renders/share/v<n>`, the bundle directory for one IR version. */
export function shareBundleDir(projectDir: string, irVersion: number): string {
  return path.join(subdirPath(projectDir, 'renders'), RENDER_SHARE_SUBDIR, `v${irVersion}`);
}

function toVariant(manifest: RenderManifest): ShareRenderVariant {
  return {
    filename: manifest.filename,
    presetId: manifest.preset.id,
    width: manifest.preset.width,
    height: manifest.preset.height,
    reframe: manifest.reframe,
    durationMs: manifest.durationMs,
    checksumSha256: manifest.checksum.value,
  };
}

/**
 * Chooses which rendered preset drives the embedded `<video>`: the
 * caller's explicit choice, else the compositor's own default preset
 * (`DEFAULT_PRESET_ID`, "16x9") when it was rendered, else whichever
 * output sorts first, so the choice is deterministic even when neither
 * preference is available.
 */
function pickPrimary(
  outputs: readonly RenderOutputInfo[],
  preferredPresetId: string | undefined,
): RenderOutputInfo {
  const preferred = preferredPresetId ?? DEFAULT_PRESET_ID;
  const byPreferred = outputs.find((output) => output.presetId === preferred);
  if (byPreferred !== undefined) {
    return byPreferred;
  }
  const first = outputs[0];
  if (first === undefined) {
    throw new BundleError('pickPrimary called with no outputs.');
  }
  return first;
}

function readNarrationCaptionsAndTranscript(projectDir: string): {
  captionsVtt: string | null;
  transcriptText: string | null;
} {
  const narrationDir = subdirPath(projectDir, 'narration');
  const wordsPath = path.join(narrationDir, 'words.json');
  const transcriptPath = path.join(narrationDir, 'transcript.txt');

  if (!existsSync(wordsPath)) {
    return { captionsVtt: null, transcriptText: null };
  }

  const words = NarrationWordsDocumentSchema.parse(JSON.parse(readFileSync(wordsPath, 'utf8')));
  const captionsVtt = renderVtt(words.words);
  const transcriptText = existsSync(transcriptPath)
    ? readFileSync(transcriptPath, 'utf8')
    : renderTranscript([words.sourceText]);

  return { captionsVtt, transcriptText };
}

/**
 * Builds (or rebuilds) the share bundle for one IR version. Idempotent:
 * re-running it after a re-render replaces every file in the bundle
 * directory with the current one, rather than layering new bundles.
 */
export async function buildShareBundle(
  options: BuildShareBundleOptions,
): Promise<BuildShareBundleResult> {
  const { projectDir, irVersion } = options;
  const env = options.env ?? process.env;

  const outputs = renderOutputsForVersion(projectDir, irVersion);
  if (outputs.length === 0) {
    throw new BundleError(
      `No renders found for IR version ${irVersion} in "${subdirPath(projectDir, 'renders')}". Run "waggle render" first.`,
    );
  }

  const primaryOutput = pickPrimary(outputs, options.preferredPresetId);
  const alternateOutputs = outputs.filter((output) => output.path !== primaryOutput.path);

  const primaryManifestResult = await ensureRenderManifest(primaryOutput.path);
  const alternateManifestResults = await Promise.all(
    alternateOutputs.map((output) => ensureRenderManifest(output.path)),
  );

  const bundleDir = shareBundleDir(projectDir, irVersion);
  mkdirSync(bundleDir, { recursive: true });

  copyFileSync(primaryOutput.path, path.join(bundleDir, primaryManifestResult.manifest.filename));
  for (const [index, output] of alternateOutputs.entries()) {
    const manifest = alternateManifestResults[index];
    if (manifest === undefined) {
      continue;
    }
    copyFileSync(output.path, path.join(bundleDir, manifest.manifest.filename));
  }

  const posterPath = path.join(bundleDir, POSTER_FILENAME);
  await generatePoster({
    sourcePath: primaryOutput.path,
    outputPath: posterPath,
    atMs: choosePosterTimeMs(primaryManifestResult.manifest.durationMs),
    env,
    runner: options.ffmpegRunner,
  });

  const { captionsVtt, transcriptText } = readNarrationCaptionsAndTranscript(projectDir);
  if (captionsVtt !== null) {
    writeFileSync(path.join(bundleDir, CAPTIONS_FILENAME), captionsVtt, 'utf8');
  }
  if (transcriptText !== null) {
    writeFileSync(path.join(bundleDir, TRANSCRIPT_FILENAME), transcriptText, 'utf8');
  }

  const html = buildShareHtml({
    walkthroughTitle: options.walkthroughTitle,
    projectName: options.projectName,
    irVersion,
    brandKitId: primaryManifestResult.manifest.brandKitId,
    primary: toVariant(primaryManifestResult.manifest),
    alternates: alternateManifestResults.map((result) => toVariant(result.manifest)),
    posterFilename: POSTER_FILENAME,
    captionsFilename: captionsVtt === null ? null : CAPTIONS_FILENAME,
    transcriptFilename: transcriptText === null ? null : TRANSCRIPT_FILENAME,
    transcriptText,
  });

  const indexPath = path.join(bundleDir, BUNDLE_INDEX_FILENAME);
  writeFileSync(indexPath, html, 'utf8');

  const integrity = checkLinkIntegrity(html, bundleDir);
  if (!integrity.ok) {
    throw new BundleLinkIntegrityError(integrity.missing);
  }

  return {
    bundleDir,
    indexPath,
    primary: primaryManifestResult.manifest,
    alternates: alternateManifestResults.map((result) => result.manifest),
    hasCaptions: captionsVtt !== null,
    hasTranscript: transcriptText !== null,
  };
}
