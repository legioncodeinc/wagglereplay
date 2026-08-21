/**
 * The render output naming scheme (prd-008 AC1).
 *
 * `@waggle/compose`'s `renderFilename(irVersion, kit, presetId)` already
 * WRITES this pattern (`walkthrough.v{n}.{kit}.{preset}.mp4`,
 * `render-project.ts`); this module is the reverse direction, parsing a
 * filename already on disk back into its identity, which is what the
 * export bundler and the clean pruner both need in order to group and
 * reason about renders without re-deriving compose's own logic.
 *
 * Kept deliberately dependency-free of `@waggle/compose` so a corrupt or
 * foreign file in `renders/` (something a user dropped in by hand) is
 * reported as "does not match the naming scheme" rather than throwing
 * deep inside an unrelated package.
 */

/** Brand kit ids and preset ids are slug-shaped: no dots, no path separators. */
const SEGMENT_PATTERN = '[a-zA-Z0-9_-]+';

export const RENDER_FILENAME_PATTERN = new RegExp(
  `^walkthrough\\.v([1-9][0-9]*)\\.(${SEGMENT_PATTERN})\\.(${SEGMENT_PATTERN})\\.mp4$`,
);

export interface RenderOutputIdentity {
  /** The exact filename this identity was parsed from, e.g. "walkthrough.v1.default.16x9.mp4". */
  readonly filename: string;
  readonly irVersion: number;
  readonly brandKitId: string;
  readonly presetId: string;
}

/**
 * Parses a render output filename against the stable naming scheme, or
 * returns `null` for anything that does not match (a `.render.json` or
 * `.manifest.json` sidecar, an unrelated file a user dropped into
 * `renders/`, or a filename from before this scheme existed).
 */
export function parseRenderFilename(filename: string): RenderOutputIdentity | null {
  const match = RENDER_FILENAME_PATTERN.exec(filename);
  if (match === null) {
    return null;
  }
  const [, versionText, brandKitId, presetId] = match;
  if (versionText === undefined || brandKitId === undefined || presetId === undefined) {
    return null;
  }
  return {
    filename,
    irVersion: Number.parseInt(versionText, 10),
    brandKitId,
    presetId,
  };
}

/** The `.render.json` sidecar `@waggle/compose` writes next to every encoded render. */
export function composeMetadataPath(renderOutputPath: string): string {
  return `${renderOutputPath}.render.json`;
}

/** The `.manifest.json` sidecar this package writes (prd-008 AC1's checksum-bearing sidecar). */
export function shareManifestPath(renderOutputPath: string): string {
  return `${renderOutputPath}.manifest.json`;
}
