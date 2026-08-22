// SPDX-License-Identifier: AGPL-3.0-or-later
import type { WalkthroughFlow } from '@waggle/ir';
import type { NarrationWordsDocument } from '@waggle/narrate';
import type { BrandKit } from './brand/schema.js';
import type { ReframeMode, RenderPreset } from './presets.js';

/**
 * The compositor contract (prd-007 AC1).
 *
 * ADR-003 makes this interface the load-bearing abstraction of the whole
 * render layer: "packages/compose defines a compositor interface. The
 * default backend is pure ffmpeg (filter graphs generated from the IR and
 * brand config). plugins/remotion ships as an optional backend for users
 * who accept Remotion's terms; the composition keeps a reserved PiP layer
 * slot (see ADR-007)."
 *
 * Three future PRDs implement or extend against this file, so it is
 * written as a contract, not as an accident of the ffmpeg backend:
 *
 *  - prd-014 (Remotion plugin) implements `Compositor` a second time. It
 *    consumes `CompositorInputs` unchanged and declares its own
 *    `CompositorCapabilities`. Anything the ffmpeg backend can only do
 *    because it is ffmpeg belongs behind a capability flag, never in the
 *    input shape.
 *  - prd-017 (avatars) supplies `CompositorInputs.pictureInPicture`. The
 *    slot is wired end to end today and simply carries `null`; ADR-007
 *    reserves it now precisely so phase 4 "composites without rework".
 *  - prd-009 (replay) swaps `CompositorInputs.source`. See `SourceVideo`
 *    below for the exact seam.
 */

/** Where the pixels being composited over came from. THE prd-009 SEAM. */
export const SOURCE_VIDEO_KINDS = ['original-recording', 'replay'] as const;
export type SourceVideoKind = (typeof SOURCE_VIDEO_KINDS)[number];

/**
 * The video track everything else is painted onto.
 *
 * Phase 1 composites over the ORIGINAL screen recording referenced by
 * `flow.waggle.sourceRecording.videoRef`. prd-009 replays the IR against
 * the live app and produces a fresh capture instead. Nothing else in this
 * package knows or cares which one it got: the compositor consumes a path,
 * a pixel size, a duration, and whether an audio track came with it.
 *
 * The swap is therefore one call site (`resolveSourceVideo` in
 * ./render/render-project.ts) returning a different `kind` and `path`,
 * with zero changes to the graph builder, the caption generator, the
 * cursor synthesizer, or the encoder.
 */
export interface SourceVideo {
  readonly kind: SourceVideoKind;
  /** Absolute path to a container ffmpeg (or another backend) can decode. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly hasAudio: boolean;
}

/**
 * Narration, if the project has any. `audioPath` and `words` travel
 * together because captions without audio would be timed against nothing.
 * `words` is the shared `words.json` contract owned by `@waggle/narrate`
 * (and re-produced by prd-013's forced-alignment pipeline); this package
 * imports the type rather than restating the shape.
 */
export interface NarrationInput {
  readonly audioPath: string;
  readonly words: NarrationWordsDocument;
}

/**
 * The reserved picture-in-picture input (ADR-007, prd-017).
 *
 * The corpus records the alpha trap this shape exists to survive: "MP4 has
 * no alpha; VP9 WebM does; force -c:v libvpx-vp9 on input or alpha
 * silently drops; overlay alpha=straight vs premultiplied mismatches
 * fringe." `hasAlpha` is therefore an explicit assertion by the caller,
 * not something a backend guesses from the file extension, and
 * `alphaMode` chooses the overlay blend rather than defaulting silently.
 */
export interface PictureInPictureInput {
  readonly path: string;
  readonly hasAlpha: boolean;
  readonly alphaMode: 'straight' | 'premultiplied';
  /** When the PiP track starts on the composited timeline, in ms. */
  readonly startMs: number;
  /** When it ends, in ms. `null` means "until it runs out". */
  readonly endMs: number | null;
}

/**
 * One point of a replay-emitted focus track (prd-009 AC5, ADR-011).
 * Declared here rather than imported from @waggle/replay so the
 * compositor contract keeps its one-direction dependency shape; the
 * shapes are identical by construction and prd-009's tests pin them.
 */
export interface FocusPointInput {
  /** Body time, ms relative to the capture's start. */
  readonly atMs: number;
  /** Normalized 0..1 focus position. */
  readonly nx: number;
  readonly ny: number;
}

/** Where the finished file goes. */
export interface OutputTarget {
  readonly path: string;
  /**
   * Directory for generated intermediates (the ASS file, sprite PNGs, the
   * filter graph). The ffmpeg backend runs with this as its working
   * directory, which is what keeps generated graph text free of absolute
   * machine-specific paths and therefore deterministic (AC4).
   */
  readonly workDir: string;
}

export interface CompositorInputs {
  readonly source: SourceVideo;
  readonly flow: WalkthroughFlow;
  readonly narration: NarrationInput | null;
  readonly brandKit: BrandKit;
  /**
   * Directory that brand-kit-relative asset paths (`logo.source`,
   * `watermark.source`, `captions.fontsDir`) resolve against, normally the
   * project directory. A kit stores project-relative paths so it stays
   * committable and portable; the backend needs absolute ones.
   */
  readonly assetBaseDir: string;
  readonly preset: RenderPreset;
  readonly output: OutputTarget;
  /** ADR-007's reserved slot. `null` until prd-017. */
  readonly pictureInPicture: PictureInPictureInput | null;
  /**
   * prd-009 AC5: a replay-emitted focus track that REPLACES the
   * recorded-IR focus events for the zoom/reframe crop window. Undefined
   * for original-recording renders, which keep deriving focus from the
   * IR's own clicks and cursor trail.
   */
  readonly focusTrack?: readonly FocusPointInput[];
  /**
   * When true the backend prepares every intermediate and reports the
   * command it would run, without encoding. Used by the graph-determinism
   * tests (AC4) and by `waggle render --dry-run`.
   */
  readonly dryRun?: boolean;
}

/**
 * What a backend declares it can do.
 *
 * This is how prd-014 gets to ship a Remotion backend with a genuinely
 * different feature set without the caller having to special-case it by
 * name: a caller that needs karaoke captions checks
 * `capabilities.karaokeCaptions`, and a backend that cannot do something
 * says so here instead of silently dropping the layer.
 */
export interface CompositorCapabilities {
  /** Word-level karaoke highlighting, not just block captions. */
  readonly karaokeCaptions: boolean;
  readonly syntheticCursor: boolean;
  readonly clickRipples: boolean;
  /** Click-driven auto-zoom (AC5). */
  readonly autoZoom: boolean;
  /** ADR-011's animated focus-following crop for non-native aspect ratios. */
  readonly smartReframe: boolean;
  readonly introOutroCards: boolean;
  readonly watermark: boolean;
  readonly logo: boolean;
  /** Whether the reserved ADR-007 PiP slot is actually composited by this backend. */
  readonly pictureInPicture: boolean;
  /** Whether an alpha-carrying PiP input is honoured (VP9 WebM, per the corpus). */
  readonly alphaPictureInPicture: boolean;
  readonly narrationAudio: boolean;
  /** Sidechain ducking of the source audio under narration (AC6). */
  readonly audioDucking: boolean;
  readonly containerFormats: readonly string[];
  readonly videoCodecs: readonly string[];
  /**
   * Whether identical inputs produce byte-identical output streams. The
   * ffmpeg backend declares `true` and AC7 proves it; a backend that
   * cannot promise this declares `false` rather than having callers find
   * out from a failing cache.
   */
  readonly deterministicOutput: boolean;
}

/** One layer the backend actually assembled, in bottom-to-top paint order. */
export interface LayerRecord {
  readonly name: string;
  /** False for a layer that was reserved but carried no content, e.g. an empty PiP slot. */
  readonly present: boolean;
  readonly detail: string;
}

export interface CompositeResult {
  readonly outputPath: string;
  readonly presetId: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly durationMs: number;
  /** ADR-011: reframed output is honestly labelled. */
  readonly reframe: ReframeMode;
  readonly sourceKind: SourceVideoKind;
  readonly brandKitId: string;
  readonly layers: readonly LayerRecord[];
  /** The exact filter graph text. Deterministic for identical inputs (AC4). */
  readonly filterGraph: string;
  /** The argv the backend ran (or would have run, under `dryRun`). */
  readonly command: readonly string[];
  /** False when `dryRun` was set: nothing was encoded. */
  readonly encoded: boolean;
}

export interface Compositor {
  /** Stable backend id, e.g. `ffmpeg`. Recorded in render metadata. */
  readonly name: string;
  readonly capabilities: CompositorCapabilities;
  composite(inputs: CompositorInputs): Promise<CompositeResult>;
}

/** Thrown when the inputs a backend was handed cannot produce a render. */
export class CompositorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositorInputError';
  }
}

/** Thrown when the underlying renderer (ffmpeg, Remotion, ...) failed. */
export class CompositorRenderError extends Error {
  readonly exitCode: number | null;
  readonly stderrTail: string;

  constructor(message: string, exitCode: number | null, stderrTail: string) {
    super(message);
    this.name = 'CompositorRenderError';
    this.exitCode = exitCode;
    this.stderrTail = stderrTail;
  }
}

/**
 * Fails fast on the input combinations no backend can render, so a caller
 * gets a named problem instead of a decoder error 40 seconds into an
 * encode. Backends call this first; it is exported so prd-014 reuses the
 * same checks rather than reimplementing them.
 */
export function assertCompositorInputs(
  inputs: CompositorInputs,
  capabilities: CompositorCapabilities,
): void {
  if (inputs.source.durationMs <= 0) {
    throw new CompositorInputError(
      `Source video "${inputs.source.path}" reports a duration of ${inputs.source.durationMs}ms. There is nothing to composite.`,
    );
  }
  if (inputs.source.width <= 0 || inputs.source.height <= 0) {
    throw new CompositorInputError(
      `Source video "${inputs.source.path}" reports a ${inputs.source.width}x${inputs.source.height} frame size.`,
    );
  }
  if (inputs.narration !== null && !capabilities.narrationAudio) {
    throw new CompositorInputError(
      `Backend does not support narration audio, but narration was supplied ("${inputs.narration.audioPath}").`,
    );
  }
  if (inputs.pictureInPicture !== null && !capabilities.pictureInPicture) {
    throw new CompositorInputError(
      'Backend does not composite the picture-in-picture slot, but a PiP input was supplied.',
    );
  }
  if (
    inputs.pictureInPicture !== null &&
    inputs.pictureInPicture.hasAlpha &&
    !capabilities.alphaPictureInPicture
  ) {
    throw new CompositorInputError(
      'Backend does not honour an alpha picture-in-picture input, and the supplied PiP declares alpha. Compositing it would silently drop transparency.',
    );
  }
}
