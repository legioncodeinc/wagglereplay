// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

/**
 * The brand kit: everything a render's LOOK is parameterized by.
 *
 * The corpus (library/knowledge/private/waggle/composition.md, "Brand
 * kits") fixes the field list: "palette, logo, watermark position/opacity,
 * caption style (font, size, karaoke colors), cursor style, intro/outro,
 * voice id", and fixes the property that makes the whole compositor worth
 * building: "A render is f(IR version, brand kit, preset): idempotent and
 * cacheable. Re-render with a different kit touches only the compositor."
 *
 * That second sentence is a hard constraint on this schema, not a nice
 * idea: nothing here may describe WHAT happened in the walkthrough (the
 * IR's job) or WHAT was said (narration's job). A brand kit only ever
 * describes how the same walkthrough is painted. prd-007 AC8 tests exactly
 * this: a second kit changes only branded pixels and writes nothing under
 * the IR or narration directories.
 *
 * Backend-neutral by construction. The ffmpeg backend in this package is
 * one consumer; the Remotion plugin (prd-014, ADR-003) consumes the same
 * kit as `inputProps`, and the avatar backend (prd-017, ADR-007) consumes
 * `pictureInPicture` for its slot geometry.
 */

export const BRAND_KIT_SCHEMA_VERSION = 1;

/** `#rgb` or `#rrggbb`. Alpha never rides in the hex: it is always its own field. */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const HexColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, 'color must be #rgb or #rrggbb (alpha is a separate field)');

/** 0 (fully transparent) to 1 (fully opaque). */
export const OpacitySchema = z
  .number()
  .min(0, 'opacity must be >= 0')
  .max(1, 'opacity must be <= 1');

/** A fraction of the rendered frame's width or height, 0 to 1. */
export const FractionSchema = z
  .number()
  .min(0, 'fraction must be >= 0')
  .max(1, 'fraction must be <= 1');

/**
 * The nine-cell anchor grid every positioned layer uses. Kept as one
 * shared enum so a logo, a watermark, and a PiP avatar are all placed by
 * the same rules and a backend implements the mapping exactly once.
 */
export const LAYER_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type LayerAnchor = (typeof LAYER_ANCHORS)[number];

export const LayerAnchorSchema = z.enum(LAYER_ANCHORS);

export const PaletteSchema = z.strictObject({
  primary: HexColorSchema,
  accent: HexColorSchema,
  background: HexColorSchema,
  foreground: HexColorSchema,
  muted: HexColorSchema,
});

export type Palette = z.infer<typeof PaletteSchema>;

/** An image layer (logo, image watermark). `source` is project-relative. */
export const ImageLayerSchema = z.strictObject({
  source: z.string().min(1, 'image source must not be empty'),
  anchor: LayerAnchorSchema,
  /** Rendered width as a fraction of the frame width. Height follows the source aspect. */
  widthPct: FractionSchema,
  /** Distance from the anchored edges, as a fraction of the frame width. */
  marginPct: FractionSchema,
  opacity: OpacitySchema,
});

export type ImageLayer = z.infer<typeof ImageLayerSchema>;

/**
 * A watermark is either an image or a text line. Both are supported
 * because a text watermark costs nothing (it rides the same libass text
 * renderer the captions already use) and it is what a user without a logo
 * file actually wants.
 */
export const WatermarkSchema = z.discriminatedUnion('kind', [
  ImageLayerSchema.extend({ kind: z.literal('image') }),
  z.strictObject({
    kind: z.literal('text'),
    text: z.string().min(1, 'watermark text must not be empty'),
    anchor: LayerAnchorSchema,
    /** Font size as a fraction of the frame HEIGHT (text scales with height, not width). */
    fontSizePct: FractionSchema,
    color: HexColorSchema,
    outlineColor: HexColorSchema,
    marginPct: FractionSchema,
    opacity: OpacitySchema,
  }),
]);

export type Watermark = z.infer<typeof WatermarkSchema>;

/** `\k` snaps the whole word at once; `\kf` sweeps the fill across it. */
export const KARAOKE_STYLES = ['jump', 'sweep'] as const;
export type KaraokeStyle = (typeof KARAOKE_STYLES)[number];

export const CaptionStyleSchema = z.strictObject({
  enabled: z.boolean(),
  /** The ASS `Fontname`. Resolved against `fontsDir` first, then system fonts. */
  fontFamily: z.string().min(1, 'caption fontFamily must not be empty'),
  /**
   * Project-relative directory of brand font files handed to libass via
   * the `subtitles` filter's `fontsdir` option (corpus: "fontsdir ships
   * brand fonts"). `null` means system fonts only.
   */
  fontsDir: z.string().min(1, 'fontsDir must not be empty').nullable(),
  /** Font size as a fraction of the frame height. */
  fontSizePct: FractionSchema,
  /**
   * The colour a word is painted BEFORE it is spoken. In ASS this lands in
   * `SecondaryColour`, not `PrimaryColour`: karaoke starts in secondary and
   * switches to primary as it is sung. Naming these by role rather than by
   * ASS field name is deliberate, because the inversion is a classic
   * footgun (see ../captions/ass-style.ts).
   */
  textColor: HexColorSchema,
  /** The colour a word is painted once it has been spoken (ASS `PrimaryColour`). */
  highlightColor: HexColorSchema,
  outlineColor: HexColorSchema,
  /** Box/shadow colour behind the text. */
  backColor: HexColorSchema,
  outlineWidth: z.number().nonnegative('outlineWidth must not be negative'),
  shadowDepth: z.number().nonnegative('shadowDepth must not be negative'),
  bold: z.boolean(),
  /** Where the caption block sits within the frame. */
  anchor: LayerAnchorSchema,
  /** Caption block distance from the frame edge, as a fraction of frame height. */
  marginVPct: FractionSchema,
  maxCharsPerLine: z.number().int().positive('maxCharsPerLine must be a positive integer'),
  maxLinesPerCue: z.number().int().positive('maxLinesPerCue must be a positive integer'),
  karaokeStyle: z.enum(KARAOKE_STYLES),
});

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

/**
 * The damped-spring parameters the cursor path is smoothed with.
 * `stiffness` is the spring's natural angular frequency in rad/s;
 * `dampingRatio` of 1 is critical damping (no overshoot), below 1 lets the
 * cursor overshoot and settle, which reads as "lively".
 */
export const CursorSpringSchema = z.strictObject({
  stiffness: z.number().positive('spring stiffness must be greater than zero'),
  dampingRatio: z.number().positive('damping ratio must be greater than zero'),
  /**
   * How many smoothed samples per second are baked into the overlay
   * position expression. Higher is smoother and produces a longer filter
   * graph; see ../cursor/track.ts for the segment cap that bounds it.
   */
  sampleHz: z.number().positive('sampleHz must be greater than zero'),
});

export type CursorSpring = z.infer<typeof CursorSpringSchema>;

export const ClickRippleSchema = z.strictObject({
  enabled: z.boolean(),
  color: HexColorSchema,
  durationMs: z.number().positive('ripple durationMs must be greater than zero'),
  startRadiusPx: z.number().positive('ripple startRadiusPx must be greater than zero'),
  endRadiusPx: z.number().positive('ripple endRadiusPx must be greater than zero'),
  thicknessPx: z.number().positive('ripple thicknessPx must be greater than zero'),
  opacity: OpacitySchema,
});

export type ClickRipple = z.infer<typeof ClickRippleSchema>;

export const CursorStyleSchema = z.strictObject({
  enabled: z.boolean(),
  /** Sprite height in rendered pixels. The arrow's width follows a fixed aspect. */
  sizePx: z.number().int().positive('cursor sizePx must be a positive integer'),
  color: HexColorSchema,
  outlineColor: HexColorSchema,
  opacity: OpacitySchema,
  spring: CursorSpringSchema,
  ripple: ClickRippleSchema,
});

export type CursorStyle = z.infer<typeof CursorStyleSchema>;

/**
 * Click-driven auto-zoom (AC5). Implemented with crop+scale expressions on
 * an upscaled canvas, never `zoompan`: ADR-003 records that "known zoompan
 * jitter is avoided by using crop+scale expressions on an upscaled canvas
 * rather than zoompan".
 */
export const ZoomStyleSchema = z.strictObject({
  enabled: z.boolean(),
  /** Peak magnification. 1 is no zoom; 1.4 shows 1/1.4 of the frame. */
  level: z.number().min(1, 'zoom level must be at least 1'),
  /** How long the zoom stays at `level` around a click. */
  holdMs: z.number().nonnegative('zoom holdMs must not be negative'),
  /** Ease-in and ease-out duration on each side of the hold. */
  easeMs: z.number().positive('zoom easeMs must be greater than zero'),
  /** How far BEFORE the click the ease-in starts. */
  leadMs: z.number().nonnegative('zoom leadMs must not be negative'),
});

export type ZoomStyle = z.infer<typeof ZoomStyleSchema>;

/** An intro or outro card: a solid colour plate carrying up to two text lines. */
export const CardSchema = z.strictObject({
  enabled: z.boolean(),
  durationMs: z.number().nonnegative('card durationMs must not be negative'),
  backgroundColor: HexColorSchema,
  title: z.string(),
  subtitle: z.string(),
  titleColor: HexColorSchema,
  subtitleColor: HexColorSchema,
  /** Title font size as a fraction of frame height; the subtitle renders at 55% of it. */
  titleSizePct: FractionSchema,
});

export type Card = z.infer<typeof CardSchema>;

/**
 * The reserved picture-in-picture slot (ADR-007).
 *
 * No avatar work happens before phase 4, but the slot geometry is fixed
 * NOW so that "a future plugins/avatar backend (HeyGen or Tavus adapter,
 * cached per script+voice+avatar combo) composites without rework".
 * prd-017 supplies a `PictureInPictureInput` (see ../compositor.ts); this
 * kit supplies where it lands and how big it is.
 */
export const PictureInPictureStyleSchema = z.strictObject({
  anchor: LayerAnchorSchema,
  widthPct: FractionSchema,
  marginPct: FractionSchema,
  opacity: OpacitySchema,
});

export type PictureInPictureStyle = z.infer<typeof PictureInPictureStyleSchema>;

/**
 * Narration/source audio balance and the AC6 ducking parameters. Ducking is
 * a sidechain compressor keyed off the narration, so the source audio only
 * drops while someone is actually speaking.
 */
export const AudioStyleSchema = z.strictObject({
  /** Gain applied to the narration track, in dB. */
  narrationGainDb: z.number(),
  /** Gain applied to the original recording's own audio, in dB. */
  sourceGainDb: z.number(),
  ducking: z.strictObject({
    enabled: z.boolean(),
    /** Sidechain threshold as a linear amplitude (ffmpeg `sidechaincompress` units). */
    threshold: z.number().positive('ducking threshold must be greater than zero').max(1),
    ratio: z.number().min(1, 'ducking ratio must be at least 1'),
    attackMs: z.number().positive('ducking attackMs must be greater than zero'),
    releaseMs: z.number().positive('ducking releaseMs must be greater than zero'),
  }),
});

export type AudioStyle = z.infer<typeof AudioStyleSchema>;

export const BrandKitSchema = z.strictObject({
  schemaVersion: z.literal(BRAND_KIT_SCHEMA_VERSION),
  /** Stable identifier; also the `brand/<id>.json` filename stem. */
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'brand kit id must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'brand kit name must not be empty'),
  palette: PaletteSchema,
  logo: ImageLayerSchema.nullable(),
  watermark: WatermarkSchema.nullable(),
  captions: CaptionStyleSchema,
  cursor: CursorStyleSchema,
  zoom: ZoomStyleSchema,
  intro: CardSchema.nullable(),
  outro: CardSchema.nullable(),
  pictureInPicture: PictureInPictureStyleSchema,
  /**
   * The narration voice this kit is authored against (ADR-006 voice ids).
   * Carried here because the corpus lists it as a brand-kit field, and
   * consumed by `@waggle/narrate`, never by the compositor: a re-render
   * with a different kit must not re-synthesize audio (AC8).
   */
  voiceId: z.string().min(1, 'voiceId must not be empty').nullable(),
  audio: AudioStyleSchema,
});

export type BrandKit = z.infer<typeof BrandKitSchema>;

/** Thrown when a brand kit file is unreadable, unparseable, or invalid. */
export class BrandKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandKitError';
  }
}

/**
 * Parses an unknown value as a brand kit, raising a `BrandKitError` whose
 * message names every offending JSON path rather than a bare
 * "invalid input".
 */
export function parseBrandKit(value: unknown, sourceLabel: string): BrandKit {
  const result = BrandKitSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map(
      (issue) => `  - ${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`,
    )
    .join('\n');
  throw new BrandKitError(`${sourceLabel} is not a valid brand kit:\n${details}`);
}
