// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from 'zod';

/**
 * Render presets: the output geometry a walkthrough is composited into.
 *
 * A preset is deliberately just dimensions plus a frame rate. Everything
 * else about how a render looks lives in the brand kit, because
 * "A render is f(IR version, brand kit, preset)" (corpus, "Brand kits")
 * only holds if those three axes stay disjoint.
 *
 * ADR-011 governs what happens when the preset's aspect ratio is not the
 * recording's: the compositor drives an animated crop window that follows
 * the IR focus track instead of a dumb centre crop, and the result is
 * labelled `reframed` rather than `native` in the render metadata.
 */

export const RenderPresetSchema = z.strictObject({
  id: z.string().min(1, 'preset id must not be empty'),
  width: z.number().int().positive('preset width must be a positive integer'),
  height: z.number().int().positive('preset height must be a positive integer'),
  fps: z.number().positive('preset fps must be greater than zero'),
});

export type RenderPreset = z.infer<typeof RenderPresetSchema>;

/**
 * Whether the preset matched the recording's own aspect ratio (`native`)
 * or required the ADR-011 smart-reframe crop window (`reframed`). Written
 * into the render metadata because ADR-011 requires reframed output to be
 * "honestly labeled".
 */
export const REFRAME_MODES = ['native', 'reframed'] as const;
export type ReframeMode = (typeof REFRAME_MODES)[number];

/** The built-in presets, keyed by the id `waggle render --preset <id>` takes. */
export const BUILT_IN_PRESETS: Readonly<Record<string, RenderPreset>> = Object.freeze({
  '16x9': { id: '16x9', width: 1920, height: 1080, fps: 30 },
  '9x16': { id: '9x16', width: 1080, height: 1920, fps: 30 },
  '1x1': { id: '1x1', width: 1080, height: 1080, fps: 30 },
  '4x5': { id: '4x5', width: 1080, height: 1350, fps: 30 },
});

export const DEFAULT_PRESET_ID = '16x9';

/**
 * A preset entry as it may appear in `waggle.json`'s `presets` record,
 * whose "shape is owned by prd-007" per the manifest schema in
 * `@waggle/ir`. A project overrides a built-in id (to render 16x9 at 720p,
 * say) or declares an id of its own.
 */
export const ManifestPresetSchema = z.strictObject({
  width: z.number().int().positive('preset width must be a positive integer'),
  height: z.number().int().positive('preset height must be a positive integer'),
  fps: z.number().positive('preset fps must be greater than zero').optional(),
  /** Brand kit id this preset defaults to, when the caller does not name one. */
  brandKit: z.string().min(1, 'preset brandKit must not be empty').optional(),
});

export type ManifestPreset = z.infer<typeof ManifestPresetSchema>;

export class PresetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PresetError';
  }
}

export interface ResolvedPreset {
  readonly preset: RenderPreset;
  /** The brand kit id the manifest entry names, if any. */
  readonly brandKitId: string | null;
  /** `manifest` when the project overrode or declared the id, `built-in` otherwise. */
  readonly source: 'manifest' | 'built-in';
}

/**
 * Resolves `--preset <id>` against the project manifest first and the
 * built-in table second, so a project can render `16x9` at whatever
 * resolution it actually wants without inventing a new id nobody
 * recognizes.
 */
export function resolvePreset(
  presetId: string,
  manifestPresets: Readonly<Record<string, unknown>> = {},
): ResolvedPreset {
  const declared = manifestPresets[presetId];
  if (declared !== undefined) {
    const result = ManifestPresetSchema.safeParse(declared);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('\n');
      throw new PresetError(
        `waggle.json declares preset "${presetId}" but it is not a valid preset:\n${details}`,
      );
    }
    const builtIn = BUILT_IN_PRESETS[presetId];
    return {
      preset: {
        id: presetId,
        width: result.data.width,
        height: result.data.height,
        fps: result.data.fps ?? builtIn?.fps ?? 30,
      },
      brandKitId: result.data.brandKit ?? null,
      source: 'manifest',
    };
  }

  const builtIn = BUILT_IN_PRESETS[presetId];
  if (builtIn === undefined) {
    const known = [...new Set([...Object.keys(BUILT_IN_PRESETS), ...Object.keys(manifestPresets)])]
      .sort()
      .join(', ');
    throw new PresetError(`Unknown preset "${presetId}". Known presets: ${known}.`);
  }
  return { preset: builtIn, brandKitId: null, source: 'built-in' };
}

/** True when the preset's aspect ratio matches the source within a half-pixel tolerance. */
export function isNativeAspect(
  preset: RenderPreset,
  sourceWidth: number,
  sourceHeight: number,
): boolean {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return false;
  }
  const presetAspect = preset.width / preset.height;
  const sourceAspect = sourceWidth / sourceHeight;
  return Math.abs(presetAspect - sourceAspect) <= 0.01;
}

export function reframeModeFor(
  preset: RenderPreset,
  sourceWidth: number,
  sourceHeight: number,
): ReframeMode {
  return isNativeAspect(preset, sourceWidth, sourceHeight) ? 'native' : 'reframed';
}
