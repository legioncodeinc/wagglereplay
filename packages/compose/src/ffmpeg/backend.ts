import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildAssDocument } from '../captions/ass-document.js';
import {
  assertCompositorInputs,
  type CompositeResult,
  type Compositor,
  type CompositorCapabilities,
  CompositorInputError,
  type CompositorInputs,
  CompositorRenderError,
} from '../compositor.js';
import {
  buildFilterGraph,
  CAPTIONS_FILENAME,
  CURSOR_SPRITE_FILENAME,
  FONTS_DIRNAME,
  RIPPLE_SPRITE_FILENAME,
} from '../graph/build-graph.js';
import { reframeModeFor } from '../presets.js';
import { buildTimeline } from '../timeline.js';
import { buildEncodeArgs, buildStreamHashArgs, GRAPH_FILENAME } from './encode-args.js';
import { resolveFfmpegPath, run, stderrTail } from './run-ffmpeg.js';
import { encodeCursorSprite, encodeRippleSprite } from './sprites.js';

/**
 * The default compositor backend (ADR-003).
 *
 * "The default backend is pure ffmpeg (filter graphs generated from the IR
 * and brand config)." This class is the one place that turns the generated
 * graph, the generated ASS, and the generated sprites into a process
 * launch.
 *
 * It runs ffmpeg with the render's WORK DIRECTORY as the child process's
 * cwd. That single decision is what keeps machine-specific absolute paths
 * out of the filter graph (only relative filenames appear inside filters),
 * which is what makes the graph text deterministic across machines and
 * therefore golden-file testable, and it sidesteps the `subtitles`
 * filter's notorious Windows drive-letter escaping (`C\:/path`) entirely.
 */

export const FFMPEG_CAPABILITIES: CompositorCapabilities = Object.freeze({
  karaokeCaptions: true,
  syntheticCursor: true,
  clickRipples: true,
  autoZoom: true,
  smartReframe: true,
  introOutroCards: true,
  watermark: true,
  logo: true,
  pictureInPicture: true,
  alphaPictureInPicture: true,
  narrationAudio: true,
  audioDucking: true,
  containerFormats: Object.freeze(['mp4']),
  videoCodecs: Object.freeze(['h264']),
  deterministicOutput: true,
});

export interface FfmpegCompositorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly crf?: number;
  readonly x264Preset?: string;
}

export class FfmpegCompositor implements Compositor {
  readonly name = 'ffmpeg';
  readonly capabilities = FFMPEG_CAPABILITIES;

  private readonly env: NodeJS.ProcessEnv;
  private readonly crf: number | undefined;
  private readonly x264Preset: string | undefined;

  constructor(options: FfmpegCompositorOptions = {}) {
    this.env = options.env ?? process.env;
    this.crf = options.crf;
    this.x264Preset = options.x264Preset;
  }

  async composite(inputs: CompositorInputs): Promise<CompositeResult> {
    assertCompositorInputs(inputs, this.capabilities);
    assertReadable(inputs.source.path, 'source video');
    if (inputs.narration !== null) {
      assertReadable(inputs.narration.audioPath, 'narration audio');
    }

    const workDir = inputs.output.workDir;
    mkdirSync(workDir, { recursive: true });
    mkdirSync(path.join(workDir, FONTS_DIRNAME), { recursive: true });
    mkdirSync(path.dirname(inputs.output.path), { recursive: true });

    // --- Generated intermediates, all inside the work directory ---------
    const assDocument = buildAssDocument({
      kit: inputs.brandKit,
      preset: inputs.preset,
      timeline: buildTimeline(inputs.brandKit, inputs.source.durationMs),
      words: inputs.narration === null ? null : inputs.narration.words,
    });
    writeFileSync(path.join(workDir, CAPTIONS_FILENAME), assDocument.text, 'utf8');
    copyBrandFonts(inputs, workDir);

    const graph = buildFilterGraph({ inputs, captionCueCount: assDocument.cueCount });

    if (inputs.brandKit.cursor.enabled && graph.cursorTrack.path.length > 0) {
      writeFileSync(
        path.join(workDir, CURSOR_SPRITE_FILENAME),
        encodeCursorSprite(inputs.brandKit.cursor),
      );
    }
    if (graph.cursorTrack.ripples.length > 0) {
      writeFileSync(
        path.join(workDir, RIPPLE_SPRITE_FILENAME),
        encodeRippleSprite(inputs.brandKit.cursor.ripple),
      );
    }
    writeFileSync(path.join(workDir, GRAPH_FILENAME), graph.text, 'utf8');

    const args = buildEncodeArgs({
      graph,
      preset: inputs.preset,
      durationMs: graph.timeline.totalMs,
      outputPath: path.resolve(inputs.output.path),
      crf: this.crf,
      x264Preset: this.x264Preset,
    });

    const result: CompositeResult = {
      outputPath: path.resolve(inputs.output.path),
      presetId: inputs.preset.id,
      width: inputs.preset.width,
      height: inputs.preset.height,
      fps: inputs.preset.fps,
      durationMs: graph.timeline.totalMs,
      reframe: reframeModeFor(inputs.preset, inputs.source.width, inputs.source.height),
      sourceKind: inputs.source.kind,
      brandKitId: inputs.brandKit.id,
      layers: graph.layers,
      filterGraph: graph.text,
      command: [resolveFfmpegPath(this.env), ...args],
      encoded: false,
    };

    if (inputs.dryRun === true) {
      return result;
    }

    const run_ = await run(resolveFfmpegPath(this.env), args, { cwd: workDir, env: this.env });
    if (run_.code !== 0) {
      throw new CompositorRenderError(
        `ffmpeg exited with code ${String(run_.code)} while rendering "${result.outputPath}".`,
        run_.code,
        stderrTail(run_.stderr),
      );
    }
    if (!existsSync(result.outputPath)) {
      throw new CompositorRenderError(
        `ffmpeg reported success but "${result.outputPath}" does not exist.`,
        run_.code,
        stderrTail(run_.stderr),
      );
    }

    return { ...result, encoded: true };
  }
}

function assertReadable(filePath: string, label: string): void {
  if (!existsSync(filePath)) {
    throw new CompositorInputError(`The ${label} "${filePath}" does not exist.`);
  }
  if (!statSync(filePath).isFile()) {
    throw new CompositorInputError(`The ${label} "${filePath}" is not a file.`);
  }
}

/**
 * Copies the brand kit's font files into the work directory's `fonts/`.
 *
 * The corpus asks for "fontsdir ships brand fonts". They are COPIED rather
 * than referenced in place so the graph can name a relative directory: an
 * absolute `fontsdir=` would put a machine-specific path into the graph
 * text and break the AC4 determinism claim on the very first golden-file
 * comparison run on another machine.
 */
function copyBrandFonts(inputs: CompositorInputs, workDir: string): void {
  const fontsDir = inputs.brandKit.captions.fontsDir;
  if (fontsDir === null) {
    return;
  }
  const sourceDir = path.resolve(inputs.assetBaseDir, fontsDir);
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new CompositorInputError(
      `The brand kit names a fonts directory "${fontsDir}" that does not exist (looked in "${sourceDir}").`,
    );
  }
  const target = path.join(workDir, FONTS_DIRNAME);
  for (const entry of readdirSync(sourceDir).sort()) {
    const from = path.join(sourceDir, entry);
    if (statSync(from).isFile()) {
      copyFileSync(from, path.join(target, entry));
    }
  }
}

/**
 * Hashes a rendered file's demuxed streams. This is the measurement AC7's
 * idempotency claim is made against, exposed so callers (and the test
 * suite) use exactly the same one.
 */
export async function hashRenderedStreams(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const result = await run(resolveFfmpegPath(env), buildStreamHashArgs(filePath), { env });
  if (result.code !== 0) {
    throw new CompositorRenderError(
      `Could not hash the streams of "${filePath}".`,
      result.code,
      stderrTail(result.stderr),
    );
  }
  return result.stdout.trim();
}
