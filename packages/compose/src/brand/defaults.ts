import { BRAND_KIT_SCHEMA_VERSION, type BrandKit, BrandKitSchema } from './schema.js';

/**
 * The kit a project renders with when `brand/` is empty.
 *
 * It is a real, opinionated kit rather than a neutral stub: a first
 * `waggle render` on a freshly recorded project should already produce
 * something watchable (AC7), and every field here doubles as the
 * documented default value for that field.
 *
 * Parsed through `BrandKitSchema` on the way out so this literal can never
 * drift out of the schema it claims to satisfy.
 */
export const DEFAULT_BRAND_KIT: BrandKit = BrandKitSchema.parse({
  schemaVersion: BRAND_KIT_SCHEMA_VERSION,
  id: 'default',
  name: 'Waggle default',
  palette: {
    primary: '#f5b301',
    accent: '#ff7a1a',
    background: '#101820',
    foreground: '#ffffff',
    muted: '#9aa5b1',
  },
  logo: null,
  watermark: null,
  captions: {
    enabled: true,
    fontFamily: 'Arial',
    fontsDir: null,
    fontSizePct: 0.058,
    textColor: '#ffffff',
    highlightColor: '#f5b301',
    outlineColor: '#101820',
    backColor: '#101820',
    outlineWidth: 2,
    shadowDepth: 1,
    bold: true,
    anchor: 'bottom-center',
    marginVPct: 0.08,
    maxCharsPerLine: 42,
    maxLinesPerCue: 2,
    karaokeStyle: 'sweep',
  },
  cursor: {
    enabled: true,
    sizePx: 34,
    color: '#ffffff',
    outlineColor: '#101820',
    opacity: 1,
    spring: {
      stiffness: 26,
      dampingRatio: 1,
      sampleHz: 12,
    },
    ripple: {
      enabled: true,
      color: '#f5b301',
      durationMs: 600,
      startRadiusPx: 10,
      endRadiusPx: 54,
      thicknessPx: 4,
      opacity: 0.85,
    },
  },
  zoom: {
    enabled: true,
    level: 1.35,
    holdMs: 900,
    easeMs: 450,
    leadMs: 250,
  },
  intro: null,
  outro: null,
  pictureInPicture: {
    anchor: 'bottom-right',
    widthPct: 0.22,
    marginPct: 0.03,
    opacity: 1,
  },
  voiceId: null,
  audio: {
    narrationGainDb: 0,
    sourceGainDb: -6,
    ducking: {
      enabled: true,
      threshold: 0.03,
      ratio: 8,
      attackMs: 20,
      releaseMs: 300,
    },
  },
});

/** The brand kit id looked up when a render does not name one. */
export const DEFAULT_BRAND_KIT_ID = DEFAULT_BRAND_KIT.id;
