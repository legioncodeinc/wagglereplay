import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { CHECKSUM_ALGORITHM, sha256File } from './checksum.js';
import { composeMetadataPath, parseRenderFilename, shareManifestPath } from './naming.js';

/**
 * The prd-008 AC1 sidecar: "a JSON sidecar recording IR version, brand
 * kit, preset, native-vs-reframed label, duration, and checksum."
 *
 * `@waggle/compose`'s `renderProject` already writes a `.render.json`
 * sidecar with every field except the checksum (`render-project.ts`'s
 * `writeRenderMetadata`, deliberately timestamp-free "because a sidecar
 * with a clock in it would be the one part of a render that is not
 * reproducible"). This package does not own that file (packages/compose
 * is out of this Bee's scope) and does not duplicate its contents by hand:
 * `buildRenderManifest` below READS it and adds exactly the one field it
 * is missing, so the two sidecars can never disagree about anything they
 * both claim to know. Kept equally timestamp-free for the same reason:
 * the checksum makes staleness verifiable from content, not from a clock.
 */
export const RENDER_MANIFEST_SCHEMA_VERSION = 1;

export const RenderManifestPresetSchema = z.strictObject({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
});

export const RenderManifestChecksumSchema = z.strictObject({
  algorithm: z.literal(CHECKSUM_ALGORITHM),
  value: z.string().regex(/^[0-9a-f]{64}$/, 'value must be a lowercase hex sha256 digest'),
});

export const RenderManifestSchema = z.strictObject({
  schemaVersion: z.literal(RENDER_MANIFEST_SCHEMA_VERSION),
  filename: z.string().min(1),
  irVersion: z.number().int().positive(),
  brandKitId: z.string().min(1),
  preset: RenderManifestPresetSchema,
  /** ADR-011's honesty label: whether the preset matched the recording's own aspect ratio. */
  reframe: z.enum(['native', 'reframed']),
  durationMs: z.number().nonnegative(),
  checksum: RenderManifestChecksumSchema,
});

export type RenderManifest = z.infer<typeof RenderManifestSchema>;

export class RenderManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenderManifestError';
  }
}

/**
 * The subset of `@waggle/compose`'s `.render.json` this package reads.
 * Deliberately NOT `.strict()`: that file is owned by prd-007, is free to
 * grow fields this package does not know about, and this schema's job is
 * only to confirm the fields prd-008's sidecar needs are present and
 * well-typed, not to pin the whole shape.
 */
const ComposeRenderMetadataSchema = z.object({
  irVersion: z.number().int().positive(),
  brandKitId: z.string().min(1),
  preset: RenderManifestPresetSchema,
  reframe: z.enum(['native', 'reframed']),
  durationMs: z.number().nonnegative(),
});

function readComposeMetadata(
  renderOutputPath: string,
): z.infer<typeof ComposeRenderMetadataSchema> {
  const metadataPath = composeMetadataPath(renderOutputPath);
  if (!existsSync(metadataPath)) {
    throw new RenderManifestError(
      `No compositor metadata at "${metadataPath}". "waggle render" writes this sidecar for every real encode; a --dry-run render, or a render produced before prd-007 landed, has none. Re-run "waggle render" for this output before exporting or cleaning it.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    throw new RenderManifestError(
      `"${metadataPath}" is not valid JSON: ${(error as Error).message}`,
    );
  }
  const result = ComposeRenderMetadataSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new RenderManifestError(`"${metadataPath}" is missing expected fields:\n${details}`);
  }
  return result.data;
}

/**
 * Builds the prd-008 sidecar for one render output: reads compose's own
 * metadata for everything but the checksum, then streams the MP4 itself
 * to compute it.
 */
export async function buildRenderManifest(renderOutputPath: string): Promise<RenderManifest> {
  const filename = renderOutputPath.split(/[\\/]/).pop();
  if (filename === undefined || parseRenderFilename(filename) === null) {
    throw new RenderManifestError(
      `"${renderOutputPath}" does not follow the render naming scheme (walkthrough.v<N>.<kit>.<preset>.mp4).`,
    );
  }
  const composeMetadata = readComposeMetadata(renderOutputPath);
  const checksum = await sha256File(renderOutputPath);

  return RenderManifestSchema.parse({
    schemaVersion: RENDER_MANIFEST_SCHEMA_VERSION,
    filename,
    irVersion: composeMetadata.irVersion,
    brandKitId: composeMetadata.brandKitId,
    preset: composeMetadata.preset,
    reframe: composeMetadata.reframe,
    durationMs: composeMetadata.durationMs,
    checksum: { algorithm: CHECKSUM_ALGORITHM, value: checksum },
  });
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Reads the `.manifest.json` sidecar already on disk for `renderOutputPath`,
 * or `null` if it has not been written yet.
 */
export function readRenderManifest(renderOutputPath: string): RenderManifest | null {
  const manifestPath = shareManifestPath(renderOutputPath);
  if (!existsSync(manifestPath)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return RenderManifestSchema.parse(parsed);
}

/**
 * Ensures `renderOutputPath` has a correct, up-to-date `.manifest.json`
 * sidecar: writes one if absent, or if the recorded checksum no longer
 * matches the file on disk (the render was regenerated since the sidecar
 * was last written). Returns the manifest either way, and whether a write
 * happened, so callers (the export bundler, the clean pruner) can report
 * accurately without re-deriving "did this change" themselves.
 */
export async function ensureRenderManifest(
  renderOutputPath: string,
): Promise<{ manifest: RenderManifest; wrote: boolean }> {
  const existing = readRenderManifest(renderOutputPath);
  if (existing !== null) {
    const currentChecksum = await sha256File(renderOutputPath);
    if (currentChecksum === existing.checksum.value) {
      return { manifest: existing, wrote: false };
    }
  }
  const manifest = await buildRenderManifest(renderOutputPath);
  writeFileSync(shareManifestPath(renderOutputPath), serializeJson(manifest), 'utf8');
  return { manifest, wrote: true };
}
