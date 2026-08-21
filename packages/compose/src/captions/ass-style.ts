import type { BrandKit, CaptionStyle, Card, Watermark } from '../brand/schema.js';
import type { RenderPreset } from '../presets.js';
import { sanitizeAssField, toAssAlignment, toAssColor } from './ass-primitives.js';

/**
 * ASS `V4+ Styles` rows built from a brand kit (prd-007 AC2, task 3).
 *
 * The document declares `PlayResX`/`PlayResY` equal to the preset's own
 * pixel dimensions (see ./ass-document.ts), so every size and margin here
 * is in OUTPUT pixels. That is why the kit stores sizes as fractions of
 * the frame: one kit renders correctly at 1920x1080 and at 1080x1920
 * without a second set of numbers.
 */

export const CAPTION_STYLE_NAME = 'WaggleCaption';
export const WATERMARK_STYLE_NAME = 'WaggleWatermark';
export const INTRO_TITLE_STYLE_NAME = 'WaggleIntroTitle';
export const INTRO_SUBTITLE_STYLE_NAME = 'WaggleIntroSubtitle';
export const OUTRO_TITLE_STYLE_NAME = 'WaggleOutroTitle';
export const OUTRO_SUBTITLE_STYLE_NAME = 'WaggleOutroSubtitle';

export const ASS_STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

interface StyleRowInput {
  readonly name: string;
  readonly fontName: string;
  readonly fontSize: number;
  readonly primaryColour: string;
  readonly secondaryColour: string;
  readonly outlineColour: string;
  readonly backColour: string;
  readonly bold: boolean;
  readonly outline: number;
  readonly shadow: number;
  readonly alignment: number;
  readonly marginL: number;
  readonly marginR: number;
  readonly marginV: number;
}

function styleRow(input: StyleRowInput): string {
  const fields = [
    input.name,
    sanitizeAssField(input.fontName),
    String(Math.round(input.fontSize)),
    input.primaryColour,
    input.secondaryColour,
    input.outlineColour,
    input.backColour,
    input.bold ? '-1' : '0',
    '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    '1',
    String(Math.round(input.outline)),
    String(Math.round(input.shadow)),
    String(input.alignment),
    String(Math.round(input.marginL)),
    String(Math.round(input.marginR)),
    String(Math.round(input.marginV)),
    '1',
  ];
  return `Style: ${fields.join(',')}`;
}

/**
 * The karaoke caption style.
 *
 * The colour mapping is inverted relative to intuition and it is the one
 * thing to get right in this file: ASS karaoke paints text in
 * `SecondaryColour` and repaints each syllable in `PrimaryColour` as it is
 * sung. So the kit's `highlightColor` (the "already spoken" colour) is
 * PRIMARY and the kit's `textColor` (the "not yet spoken" colour) is
 * SECONDARY. Swapping them produces a caption that looks plausible and
 * highlights backwards.
 */
export function buildCaptionStyleRow(captions: CaptionStyle, preset: RenderPreset): string {
  const marginH = Math.round(preset.width * 0.06);
  return styleRow({
    name: CAPTION_STYLE_NAME,
    fontName: captions.fontFamily,
    fontSize: captions.fontSizePct * preset.height,
    primaryColour: toAssColor(captions.highlightColor),
    secondaryColour: toAssColor(captions.textColor),
    outlineColour: toAssColor(captions.outlineColor),
    backColour: toAssColor(captions.backColor, 0.5),
    bold: captions.bold,
    outline: captions.outlineWidth,
    shadow: captions.shadowDepth,
    alignment: toAssAlignment(captions.anchor),
    marginL: marginH,
    marginR: marginH,
    marginV: captions.marginVPct * preset.height,
  });
}

/** The style a text watermark rides on. Returns `null` for an image watermark. */
export function buildWatermarkStyleRow(
  watermark: Watermark | null,
  preset: RenderPreset,
): string | null {
  if (watermark === null || watermark.kind !== 'text') {
    return null;
  }
  const margin = Math.round(watermark.marginPct * preset.width);
  return styleRow({
    name: WATERMARK_STYLE_NAME,
    fontName: 'Arial',
    fontSize: watermark.fontSizePct * preset.height,
    primaryColour: toAssColor(watermark.color, watermark.opacity),
    secondaryColour: toAssColor(watermark.color, watermark.opacity),
    outlineColour: toAssColor(watermark.outlineColor, watermark.opacity),
    backColour: toAssColor(watermark.outlineColor, 0),
    bold: true,
    outline: 1,
    shadow: 0,
    alignment: toAssAlignment(watermark.anchor),
    marginL: margin,
    marginR: margin,
    marginV: margin,
  });
}

/** Title and subtitle styles for an intro or outro card. */
export function buildCardStyleRows(
  card: Card | null,
  preset: RenderPreset,
  titleStyleName: string,
  subtitleStyleName: string,
): string[] {
  if (card === null || !card.enabled) {
    return [];
  }
  const titleSize = card.titleSizePct * preset.height;
  const marginH = Math.round(preset.width * 0.1);
  return [
    styleRow({
      name: titleStyleName,
      fontName: 'Arial',
      fontSize: titleSize,
      primaryColour: toAssColor(card.titleColor),
      secondaryColour: toAssColor(card.titleColor),
      outlineColour: toAssColor(card.backgroundColor),
      backColour: toAssColor(card.backgroundColor, 0),
      bold: true,
      outline: 0,
      shadow: 0,
      // Both card lines are placed with an explicit `\pos` in
      // ./ass-document.ts, so the alignment is the centred one and the
      // margins only constrain wrapping.
      alignment: 5,
      marginL: marginH,
      marginR: marginH,
      marginV: 0,
    }),
    styleRow({
      name: subtitleStyleName,
      fontName: 'Arial',
      fontSize: titleSize * 0.55,
      primaryColour: toAssColor(card.subtitleColor),
      secondaryColour: toAssColor(card.subtitleColor),
      outlineColour: toAssColor(card.backgroundColor),
      backColour: toAssColor(card.backgroundColor, 0),
      bold: false,
      outline: 0,
      shadow: 0,
      alignment: 5,
      marginL: marginH,
      marginR: marginH,
      marginV: 0,
    }),
  ];
}

/** Every style row this kit needs, in a fixed order (AC4 determinism). */
export function buildStyleRows(kit: BrandKit, preset: RenderPreset): string[] {
  const rows: string[] = [buildCaptionStyleRow(kit.captions, preset)];
  const watermarkRow = buildWatermarkStyleRow(kit.watermark, preset);
  if (watermarkRow !== null) {
    rows.push(watermarkRow);
  }
  rows.push(
    ...buildCardStyleRows(kit.intro, preset, INTRO_TITLE_STYLE_NAME, INTRO_SUBTITLE_STYLE_NAME),
  );
  rows.push(
    ...buildCardStyleRows(kit.outro, preset, OUTRO_TITLE_STYLE_NAME, OUTRO_SUBTITLE_STYLE_NAME),
  );
  return rows;
}
