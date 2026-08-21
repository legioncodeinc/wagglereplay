import path from 'node:path';
import { buildAudioChain } from '../audio/mix.js';
import type { BrandKit, LayerAnchor } from '../brand/schema.js';
import { toFfmpegColor } from '../captions/ass-primitives.js';
import type { CompositorInputs, LayerRecord } from '../compositor.js';
import {
  buildCursorOverlayExpressions,
  buildCursorTrack,
  type CursorTrack,
} from '../cursor/track.js';
import { enableWindow, ms, num } from '../expr/piecewise.js';
import type { RenderPreset } from '../presets.js';
import { reframeModeFor } from '../presets.js';
import type { RenderTimeline } from '../timeline.js';
import { buildTimeline } from '../timeline.js';
import {
  buildZoomExpressions,
  computeCoverGeometry,
  projectNormalizedX,
  projectNormalizedY,
} from '../zoom/expressions.js';
import { buildZoomTrack } from '../zoom/segments.js';

/**
 * The filter-graph builder (prd-007 AC4).
 *
 * Everything about this module serves one property: **the graph text is a
 * pure, deterministic function of its inputs.** That is what makes AC7's
 * idempotency claim reachable, what makes the graph golden-file testable,
 * and what makes a render cacheable by hashing its inputs.
 *
 * Three rules keep it true, and breaking any of them breaks the claim
 * silently rather than loudly:
 *
 *  1. **No absolute paths in the graph.** The only path that appears
 *     inside a filter (the burned `.ass` and its `fontsdir`) is a bare
 *     relative name, because the backend runs ffmpeg with the work
 *     directory as its cwd. This also sidesteps the `subtitles` filter's
 *     Windows drive-letter escaping problem entirely.
 *  2. **No clock, no environment, no filesystem reads.** Input ORDER is
 *     fixed by ../ffmpeg/backend.ts's declaration order, not by iteration
 *     over anything unordered.
 *  3. **Every number goes through `num()`.** See ../expr/piecewise.ts.
 *
 * Paint order, bottom to top, is fixed here and is the contract the
 * Remotion backend (prd-014) must match to produce a comparable render:
 *
 *   base video -> zoom/reframe crop -> intro/outro plates
 *     -> click ripples -> synthetic cursor
 *     -> burned text (captions, text watermark, card titles)
 *     -> logo, image watermark
 *     -> picture-in-picture (ADR-007's reserved slot, topmost)
 */

/** The generated ASS filename inside the work directory. */
export const CAPTIONS_FILENAME = 'captions.ass';
/** The fonts directory handed to libass. Always created, possibly empty. */
export const FONTS_DIRNAME = 'fonts';
export const CURSOR_SPRITE_FILENAME = 'cursor.png';
export const RIPPLE_SPRITE_FILENAME = 'ripple.png';

/** One `-i` input, in the order the backend passes them to ffmpeg. */
export interface GraphInput {
  /** Absolute path or a work-directory-relative filename. */
  readonly path: string;
  /** Per-input options that must precede `-i`, e.g. `-loop 1`. */
  readonly options: readonly string[];
  /** What this input is, for the layer manifest. */
  readonly role: string;
}

export interface BuiltGraph {
  readonly text: string;
  readonly inputs: readonly GraphInput[];
  readonly videoLabel: string;
  readonly audioLabel: string | null;
  readonly layers: readonly LayerRecord[];
  readonly timeline: RenderTimeline;
  readonly cursorTrack: CursorTrack;
  /** How many karaoke cues the ASS document carries; filled in by the backend. */
  readonly captionCueCount: number;
}

export interface BuildGraphOptions {
  readonly inputs: CompositorInputs;
  /** Cue count from the already-generated ASS document. */
  readonly captionCueCount: number;
}

/**
 * Anchors an overlay in the output frame. `main_w`/`main_h` are the base
 * frame, `overlay_w`/`overlay_h` the sprite, both resolved by ffmpeg at
 * runtime because a scaled logo's height is not known until it is scaled.
 */
function anchorExpressions(anchor: LayerAnchor, marginPx: number): { x: string; y: string } {
  const margin = num(marginPx);
  const horizontal = anchor.endsWith('-left')
    ? margin
    : anchor.endsWith('-right')
      ? `main_w-overlay_w-${margin}`
      : '(main_w-overlay_w)/2';
  const vertical = anchor.startsWith('top-')
    ? margin
    : anchor.startsWith('bottom-')
      ? `main_h-overlay_h-${margin}`
      : '(main_h-overlay_h)/2';
  return { x: horizontal, y: vertical };
}

/** Deterministic, sequential filter-graph labels. */
class LabelAllocator {
  private counter = 0;

  next(prefix: string): string {
    const label = `${prefix}${this.counter}`;
    this.counter += 1;
    return label;
  }
}

/**
 * Assembles one filter chain: `[in]filter,filter,...[out]`.
 *
 * Empty filter entries are dropped rather than emitted as a stray comma,
 * which is what lets a conditional filter (an opacity pass that is only
 * needed below full opacity) be expressed as `condition ? 'filter' : ''`
 * at the call site.
 */
function chain(
  inputLabels: readonly string[],
  filters: readonly string[],
  outputLabel: string,
): string {
  const body = filters.filter((filter) => filter !== '').join(',');
  const head = inputLabels.map((label) => `[${label}]`).join('');
  return `${head}${body}[${outputLabel}]`;
}

export function buildFilterGraph(options: BuildGraphOptions): BuiltGraph {
  const { inputs, captionCueCount } = options;
  const { brandKit: kit, preset, source, flow, narration } = inputs;

  const timeline = buildTimeline(kit, source.durationMs);
  const reframe = reframeModeFor(preset, source.width, source.height);
  const geometry = computeCoverGeometry(preset, source.width, source.height);
  const zoomTrack = buildZoomTrack({
    flow,
    zoom: kit.zoom,
    timeline,
    reframe,
    ...(inputs.focusTrack !== undefined ? { focusTrack: inputs.focusTrack } : {}),
  });
  const zoom = buildZoomExpressions(zoomTrack, preset, geometry);
  const cursorTrack = buildCursorTrack({ flow, cursor: kit.cursor, timeline });

  const graphInputs: GraphInput[] = [
    { path: source.path, options: [], role: `source video (${source.kind})` },
  ];
  const chains: string[] = [];
  const layers: LayerRecord[] = [];
  const labels = new LabelAllocator();

  // --- Base video: fps normalize, zoom/reframe, intro/outro plates -------
  const baseLabel = labels.next('v');
  chains.push(
    chain(
      ['0:v'],
      [
        `fps=fps=${num(preset.fps)}`,
        'format=rgba',
        `scale=w='${zoom.scaledWidth}':h='${zoom.scaledHeight}':eval=frame:flags=bicubic`,
        `crop=w=${preset.width}:h=${preset.height}:x='${zoom.cropX}':y='${zoom.cropY}'`,
        'setsar=1',
        buildTpadFilter(kit, timeline),
      ],
      baseLabel,
    ),
  );
  layers.push({
    name: 'base-video',
    present: true,
    detail: `${source.width}x${source.height} ${source.kind} covered at ${geometry.coverWidth}x${geometry.coverHeight}, ${reframe}`,
  });
  layers.push({
    name: 'auto-zoom',
    present: zoomTrack.windows.length > 0,
    detail:
      zoomTrack.windows.length > 0
        ? `${zoomTrack.windows.length} zoom window(s) at level ${num(kit.zoom.level)} via crop+scale (never zoompan)`
        : 'no zoom windows (no focus events or zoom disabled)',
  });
  layers.push({
    name: 'intro-outro-plates',
    present: timeline.introMs > 0 || timeline.outroMs > 0,
    detail: `intro ${num(timeline.introMs)}ms, outro ${num(timeline.outroMs)}ms`,
  });

  let current = baseLabel;

  // --- Click ripples ----------------------------------------------------
  const ripples = cursorTrack.ripples;
  if (ripples.length > 0) {
    const rippleInputIndex = graphInputs.length;
    graphInputs.push({
      path: RIPPLE_SPRITE_FILENAME,
      // The ripple's size is animated per frame, so its input has to
      // produce a frame per output frame rather than a single still.
      options: ['-loop', '1', '-framerate', num(preset.fps)],
      role: 'click ripple sprite',
    });

    const splitLabels = ripples.map(() => labels.next('rp'));
    chains.push(
      `[${rippleInputIndex}:v]format=rgba${ripples.length > 1 ? `,split=${ripples.length}` : ''}${splitLabels
        .map((label) => `[${label}]`)
        .join('')}`,
    );

    const startDiameter = kit.cursor.ripple.startRadiusPx * 2;
    const endDiameter = kit.cursor.ripple.endRadiusPx * 2;
    for (let i = 0; i < ripples.length; i += 1) {
      const ripple = ripples[i];
      const splitLabel = splitLabels[i];
      if (ripple === undefined || splitLabel === undefined) {
        continue;
      }
      const durationS = (ripple.endMs - ripple.startMs) / 1000;
      const progress = `min(1,max(0,(t-${ms(ripple.startMs)})/${num(durationS)}))`;
      const diameter = `${num(startDiameter)}+${num(endDiameter - startDiameter)}*(${progress})`;
      const sized = labels.next('rs');
      chains.push(
        `[${splitLabel}]scale=w='ceil((${diameter})/2)*2':h='ceil((${diameter})/2)*2':eval=frame:flags=bilinear,fade=t=out:st=${ms(ripple.startMs)}:d=${num(durationS)}:alpha=1[${sized}]`,
      );
      const next = labels.next('v');
      chains.push(
        `[${current}][${sized}]overlay=x='(${projectNormalizedX(zoom, num(ripple.nx))})-overlay_w/2':y='(${projectNormalizedY(zoom, num(ripple.ny))})-overlay_h/2':enable='${enableWindow(ripple.startMs, ripple.endMs)}':format=auto[${next}]`,
      );
      current = next;
    }
  }
  layers.push({
    name: 'click-ripples',
    present: ripples.length > 0,
    detail:
      ripples.length > 0
        ? `${ripples.length} ripple(s), one overlay chain entry per click`
        : 'no clicks, or ripples disabled',
  });

  // --- Synthetic cursor -------------------------------------------------
  const cursorExpressions = buildCursorOverlayExpressions(cursorTrack, zoom);
  if (cursorExpressions !== null) {
    const cursorInputIndex = graphInputs.length;
    graphInputs.push({
      path: CURSOR_SPRITE_FILENAME,
      options: [],
      role: 'cursor sprite',
    });
    const prepared = labels.next('cu');
    chains.push(`[${cursorInputIndex}:v]format=rgba[${prepared}]`);
    const next = labels.next('v');
    chains.push(
      `[${current}][${prepared}]overlay=x='${cursorExpressions.x}':y='${cursorExpressions.y}':enable='${enableWindow(timeline.bodyStartMs, timeline.bodyEndMs)}':format=auto[${next}]`,
    );
    current = next;
  }
  layers.push({
    name: 'synthetic-cursor',
    present: cursorExpressions !== null,
    detail:
      cursorExpressions !== null
        ? `spring-smoothed path, ${cursorTrack.path.length} samples at ${num(kit.cursor.spring.sampleHz)}Hz`
        : 'no cursor trail, or cursor disabled',
  });

  // --- Burned text: captions, text watermark, card titles ---------------
  const hasBurnedText =
    captionCueCount > 0 ||
    (kit.watermark !== null && kit.watermark.kind === 'text') ||
    (kit.intro !== null && kit.intro.enabled) ||
    (kit.outro !== null && kit.outro.enabled);
  if (hasBurnedText) {
    const next = labels.next('v');
    chains.push(
      `[${current}]subtitles=filename=${CAPTIONS_FILENAME}:fontsdir=${FONTS_DIRNAME}[${next}]`,
    );
    current = next;
  }
  layers.push({
    name: 'captions',
    present: captionCueCount > 0,
    detail:
      captionCueCount > 0
        ? `${captionCueCount} karaoke cue(s), ASS \\${kit.captions.karaokeStyle === 'sweep' ? 'kf' : 'k'} tags burned via libass`
        : narration === null
          ? 'no narration, so no captions'
          : 'captions disabled in the brand kit',
  });
  layers.push({
    name: 'watermark',
    present: kit.watermark !== null,
    detail:
      kit.watermark === null
        ? 'none'
        : `${kit.watermark.kind} watermark at ${kit.watermark.anchor}`,
  });

  // --- Image watermark and logo ----------------------------------------
  if (kit.watermark !== null && kit.watermark.kind === 'image') {
    current = appendImageOverlay(
      chains,
      graphInputs,
      labels,
      current,
      preset,
      inputs.assetBaseDir,
      {
        source: kit.watermark.source,
        anchor: kit.watermark.anchor,
        widthPct: kit.watermark.widthPct,
        marginPct: kit.watermark.marginPct,
        opacity: kit.watermark.opacity,
      },
      'watermark image',
    );
  }
  if (kit.logo !== null) {
    current = appendImageOverlay(
      chains,
      graphInputs,
      labels,
      current,
      preset,
      inputs.assetBaseDir,
      kit.logo,
      'logo image',
    );
  }
  layers.push({
    name: 'logo',
    present: kit.logo !== null,
    detail: kit.logo === null ? 'none' : `${kit.logo.source} at ${kit.logo.anchor}`,
  });

  // --- Picture-in-picture: ADR-007's reserved slot ----------------------
  // The slot is wired end to end today and simply carries no input. When
  // prd-017 supplies one, nothing else in this file changes.
  const pip = inputs.pictureInPicture;
  if (pip !== null) {
    const pipIndex = graphInputs.length;
    graphInputs.push({
      path: pip.path,
      // The corpus is explicit: "force -c:v libvpx-vp9 on input or alpha
      // silently drops". A PiP that declares alpha therefore names its
      // decoder rather than trusting probing.
      options: pip.hasAlpha ? ['-c:v', 'libvpx-vp9'] : [],
      role: 'picture-in-picture',
    });
    const pipWidth = Math.round(kit.pictureInPicture.widthPct * preset.width);
    const pipMargin = Math.round(kit.pictureInPicture.marginPct * preset.width);
    const { x, y } = anchorExpressions(kit.pictureInPicture.anchor, pipMargin);
    const prepared = labels.next('pp');
    const pipEndMs = pip.endMs ?? timeline.totalMs;
    chains.push(
      chain(
        [`${pipIndex}:v`],
        [
          'format=rgba',
          // "overlay alpha=straight vs premultiplied mismatches fringe": a
          // premultiplied source is converted rather than blended wrongly.
          pip.alphaMode === 'premultiplied' ? 'unpremultiply=inplace=1' : '',
          `scale=w=${pipWidth}:h=-2`,
          kit.pictureInPicture.opacity < 1
            ? `colorchannelmixer=aa=${num(kit.pictureInPicture.opacity)}`
            : '',
          `setpts=PTS-STARTPTS+${ms(pip.startMs)}/TB`,
        ],
        prepared,
      ),
    );
    const next = labels.next('v');
    chains.push(
      `[${current}][${prepared}]overlay=x='${x}':y='${y}':enable='${enableWindow(pip.startMs, pipEndMs)}':format=auto[${next}]`,
    );
    current = next;
  }
  layers.push({
    name: 'picture-in-picture',
    present: pip !== null,
    detail:
      pip === null
        ? `reserved slot (ADR-007), no input; geometry ${kit.pictureInPicture.anchor} at ${num(kit.pictureInPicture.widthPct * 100)}% width`
        : `${pip.hasAlpha ? 'alpha' : 'opaque'} input, ${pip.alphaMode} alpha, ${kit.pictureInPicture.anchor}`,
  });

  // --- Output pixel format ----------------------------------------------
  const videoLabel = labels.next('v');
  chains.push(`[${current}]format=yuv420p[${videoLabel}]`);

  // --- Audio -------------------------------------------------------------
  let narrationInputIndex: number | null = null;
  if (narration !== null) {
    narrationInputIndex = graphInputs.length;
    graphInputs.push({ path: narration.audioPath, options: [], role: 'narration audio' });
  }
  const audio = buildAudioChain({
    sourceLabel: source.hasAudio ? '0:a' : null,
    narrationLabel: narrationInputIndex === null ? null : `${narrationInputIndex}:a`,
    style: kit.audio,
    timeline,
    outputLabel: 'aout',
  });
  chains.push(...audio.chains);
  layers.push({ name: 'audio', present: audio.hasAudio, detail: audio.detail });

  return {
    text: `${chains.join(';\n')}\n`,
    inputs: graphInputs,
    videoLabel,
    audioLabel: audio.hasAudio ? 'aout' : null,
    layers,
    timeline,
    cursorTrack,
    captionCueCount,
  };
}

/**
 * The intro/outro plates.
 *
 * `tpad` EXTENDS the timeline with solid frames rather than covering the
 * recording's own first and last seconds, which is why ../timeline.ts
 * exists at all: every other layer's times are shifted by the intro's
 * duration. Returns an empty string when neither card is enabled, so the
 * filter simply does not appear in the graph.
 */
function buildTpadFilter(kit: BrandKit, timeline: RenderTimeline): string {
  const parts: string[] = [];
  if (timeline.introMs > 0 && kit.intro !== null) {
    parts.push(
      `start_duration=${num(timeline.introMs / 1000)}`,
      'start_mode=add',
      `color=${toFfmpegColor(kit.intro.backgroundColor)}`,
    );
  }
  if (timeline.outroMs > 0 && kit.outro !== null) {
    parts.push(
      `stop_duration=${num(timeline.outroMs / 1000)}`,
      'stop_mode=add',
      `color=${toFfmpegColor(kit.outro.backgroundColor)}`,
    );
  }
  return parts.length === 0 ? '' : `tpad=${parts.join(':')}`;
}

interface ImageOverlaySpec {
  readonly source: string;
  readonly anchor: LayerAnchor;
  readonly widthPct: number;
  readonly marginPct: number;
  readonly opacity: number;
}

function appendImageOverlay(
  chains: string[],
  graphInputs: GraphInput[],
  labels: LabelAllocator,
  currentLabel: string,
  preset: RenderPreset,
  assetBaseDir: string,
  spec: ImageOverlaySpec,
  role: string,
): string {
  const index = graphInputs.length;
  // Resolved to an absolute path here: kit asset paths are stored
  // project-relative so a kit stays committable, but they reach ffmpeg as
  // `-i` arguments, and the child process's cwd is the WORK directory, not
  // the project.
  graphInputs.push({ path: path.resolve(assetBaseDir, spec.source), options: [], role });

  const width = Math.max(2, Math.round(spec.widthPct * preset.width));
  const margin = Math.round(spec.marginPct * preset.width);
  const prepared = labels.next('im');
  chains.push(
    chain(
      [`${index}:v`],
      [
        'format=rgba',
        `scale=w=${width}:h=-2`,
        spec.opacity < 1 ? `colorchannelmixer=aa=${num(spec.opacity)}` : '',
      ],
      prepared,
    ),
  );

  const { x, y } = anchorExpressions(spec.anchor, margin);
  const next = labels.next('v');
  chains.push(`[${currentLabel}][${prepared}]overlay=x='${x}':y='${y}':format=auto[${next}]`);
  return next;
}
