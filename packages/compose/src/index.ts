/**
 * `@waggle/compose`: the compositor interface and its default ffmpeg
 * backend (prd-007).
 *
 * Governed by:
 *  - ADR-003, ffmpeg is the default backend and this package defines the
 *    interface prd-014's Remotion plugin implements
 *  - ADR-007, the picture-in-picture slot is reserved and wired now, with
 *    no avatar work before phase 4 (prd-017)
 *  - ADR-011, non-native presets are reframed by an IR-focus-driven crop
 *    window and labelled honestly in the render metadata
 *  - library/knowledge/private/waggle/composition.md
 *
 * See README.md for the interface contract, the layer paint order, and the
 * exact seam prd-009 swaps to composite over replayed video instead of the
 * original recording.
 */

// --- Audio mux and ducking (AC6) --------------------------------------------
export {
  AUDIO_CHANNEL_LAYOUT,
  AUDIO_SAMPLE_RATE,
  type AudioChain,
  type AudioChainInput,
  buildAudioChain,
} from './audio/mix.js';

// --- Brand kits (AC1) --------------------------------------------------------
export { DEFAULT_BRAND_KIT, DEFAULT_BRAND_KIT_ID } from './brand/defaults.js';
export {
  brandDir,
  brandKitPath,
  loadBrandKit,
  serializeBrandKit,
  writeBrandKit,
} from './brand/io.js';
export {
  type AudioStyle,
  AudioStyleSchema,
  BRAND_KIT_SCHEMA_VERSION,
  type BrandKit,
  BrandKitError,
  BrandKitSchema,
  type CaptionStyle,
  CaptionStyleSchema,
  type Card,
  CardSchema,
  type ClickRipple,
  ClickRippleSchema,
  type CursorSpring,
  CursorSpringSchema,
  type CursorStyle,
  CursorStyleSchema,
  FractionSchema,
  HexColorSchema,
  type ImageLayer,
  ImageLayerSchema,
  KARAOKE_STYLES,
  type KaraokeStyle,
  LAYER_ANCHORS,
  type LayerAnchor,
  LayerAnchorSchema,
  OpacitySchema,
  type Palette,
  PaletteSchema,
  type PictureInPictureStyle,
  PictureInPictureStyleSchema,
  parseBrandKit,
  type Watermark,
  WatermarkSchema,
  type ZoomStyle,
  ZoomStyleSchema,
} from './brand/schema.js';
// --- Karaoke captions (AC2) --------------------------------------------------
export {
  ASS_EVENT_FORMAT,
  type AssDocument,
  type AssDocumentInput,
  buildAssDocument,
} from './captions/ass-document.js';
export {
  buildKaraokeCues,
  type KaraokeCue,
  type KaraokeCueOptions,
  renderKaraokeText,
} from './captions/ass-karaoke.js';
export {
  escapeAssText,
  joinAssLines,
  parseHexColor,
  type Rgb,
  sanitizeAssField,
  toAssAlignment,
  toAssColor,
  toAssTime,
  toFfmpegColor,
} from './captions/ass-primitives.js';
export {
  ASS_STYLE_FORMAT,
  buildCaptionStyleRow,
  buildCardStyleRows,
  buildStyleRows,
  buildWatermarkStyleRow,
  CAPTION_STYLE_NAME,
  WATERMARK_STYLE_NAME,
} from './captions/ass-style.js';
// --- The compositor contract (AC1) ------------------------------------------
export {
  assertCompositorInputs,
  type CompositeResult,
  type Compositor,
  type CompositorCapabilities,
  CompositorInputError,
  type CompositorInputs,
  CompositorRenderError,
  type FocusPointInput,
  type LayerRecord,
  type NarrationInput,
  type OutputTarget,
  type PictureInPictureInput,
  SOURCE_VIDEO_KINDS,
  type SourceVideo,
  type SourceVideoKind,
} from './compositor.js';
// --- Synthetic cursor and click ripples (AC3) -------------------------------
export {
  MAX_SPRING_SUBSTEP_MS,
  SPRING_SUBSTEPS,
  type SpringPathOptions,
  springSmoothPath,
  type TimedPoint,
} from './cursor/spring.js';
export {
  buildCursorOverlayExpressions,
  buildCursorTrack,
  type CursorOverlayExpressions,
  type CursorTrack,
  type CursorTrackInput,
  MAX_CURSOR_SEGMENTS,
  type RippleWindow,
} from './cursor/track.js';
// --- Expression helpers ------------------------------------------------------
export {
  clampExpr,
  EASINGS,
  type Easing,
  EXPR_PRECISION,
  enableWindow,
  type Keyframe,
  ms,
  num,
  piecewise,
} from './expr/piecewise.js';
// --- The ffmpeg backend (AC4, AC7) ------------------------------------------
export {
  FFMPEG_CAPABILITIES,
  FfmpegCompositor,
  type FfmpegCompositorOptions,
  hashRenderedStreams,
} from './ffmpeg/backend.js';
export {
  buildEncodeArgs,
  buildStreamHashArgs,
  DEFAULT_AUDIO_BITRATE,
  DEFAULT_CRF,
  DEFAULT_X264_PRESET,
  DETERMINISTIC_THREADS,
  type EncodeArgsInput,
  GRAPH_FILENAME,
} from './ffmpeg/encode-args.js';
export {
  type Bitmap,
  createBitmap,
  encodePng,
  setPixel,
} from './ffmpeg/png.js';
export { ProbeError, type ProbeResult, probeMedia, probeSourceVideo } from './ffmpeg/probe.js';
export {
  FFMPEG_PATH_ENV_VAR,
  FFPROBE_PATH_ENV_VAR,
  FfmpegNotFoundError,
  resolveFfmpegPath,
  resolveFfprobePath,
} from './ffmpeg/run-ffmpeg.js';
export {
  encodeCursorSprite,
  encodeRippleSprite,
  renderCursorSprite,
  renderRippleSprite,
} from './ffmpeg/sprites.js';
// --- Filter graph (AC4) ------------------------------------------------------
export {
  type BuildGraphOptions,
  type BuiltGraph,
  buildFilterGraph,
  CAPTIONS_FILENAME,
  CURSOR_SPRITE_FILENAME,
  FONTS_DIRNAME,
  type GraphInput,
  RIPPLE_SPRITE_FILENAME,
} from './graph/build-graph.js';
// --- Presets and the ADR-011 reframe label ----------------------------------
export {
  BUILT_IN_PRESETS,
  DEFAULT_PRESET_ID,
  isNativeAspect,
  type ManifestPreset,
  ManifestPresetSchema,
  PresetError,
  REFRAME_MODES,
  type ReframeMode,
  type RenderPreset,
  RenderPresetSchema,
  type ResolvedPreset,
  reframeModeFor,
  resolvePreset,
} from './presets.js';
// --- Project-level render (AC7, AC8) ----------------------------------------
export {
  immutableRenderInputs,
  loadNarration,
  loadReplayFocusTrack,
  REPLAY_CAPTURES_SUBDIR,
  REPLAY_INDEX_FILENAME,
  RenderInputError,
  type RenderProjectOptions,
  type RenderProjectResult,
  type ReplayIndex,
  type ReplayIndexEntry,
  ReplayIndexError,
  type ResolveSourceOptions,
  readReplayIndex,
  renderFilename,
  renderProject,
  resolveSourceVideo,
  WORK_SUBDIR,
} from './render/render-project.js';
// --- Timeline ----------------------------------------------------------------
export {
  buildTimeline,
  type RenderTimeline,
  toClampedTimelineMs,
  toTimelineMs,
} from './timeline.js';
// --- Auto-zoom and smart reframe (AC5) --------------------------------------
export {
  buildZoomExpressions,
  type CoverGeometry,
  computeCoverGeometry,
  projectNormalizedX,
  projectNormalizedY,
  type ZoomExpressions,
} from './zoom/expressions.js';
export {
  buildZoomTrack,
  buildZoomWindows,
  collectFocusEvents,
  type FocusEvent,
  type ZoomTrack,
  type ZoomTrackInput,
  type ZoomWindow,
} from './zoom/segments.js';
