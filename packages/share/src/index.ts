/**
 * `@waggle/share`: render output management, the static share-page
 * bundle, and the optional R2 uploader (prd-008).
 *
 * Governed by:
 *  - ADR-009, delivery is local render files plus a static share-page
 *    export; R2 upload is an optional, user-owned add-on
 *  - ADR-011, reframed output is labelled honestly; this package surfaces
 *    that label on the share page and in the AC1 sidecar
 *  - ADR-008, no secrets in project files: every R2 credential is read
 *    from the environment
 *  - library/knowledge/private/waggle/replay-and-render.md
 *
 * See README.md for the bundle layout, the sidecar shape, and exactly
 * which R2 assertion needs a live bucket to fully verify.
 */

// --- The share bundle (AC2) -------------------------------------------------
export {
  type BuildShareBundleOptions,
  type BuildShareBundleResult,
  BundleError,
  BundleLinkIntegrityError,
  buildShareBundle,
  shareBundleDir,
} from './bundle/build-bundle.js';
export {
  buildShareHtml,
  escapeHtml,
  type ShareBundleContent,
  type ShareRenderVariant,
} from './bundle/html-template.js';
export {
  checkLinkIntegrity,
  type LinkIntegrityResult,
} from './bundle/link-integrity.js';
export { CHECKSUM_ALGORITHM, sha256File } from './checksum.js';
// --- `waggle clean` (AC4) ---------------------------------------------------
export {
  type CleanCandidate,
  type CleanPlan,
  type CleanPlanOptions,
  type CleanReason,
  DEFAULT_KEEP_VERSIONS,
  type DeleteCleanResult,
  deleteCleanCandidates,
  planClean,
} from './clean/plan.js';
export {
  FfmpegLaunchError,
  type FfmpegRunner,
  type FfmpegRunResult,
  runFfmpeg,
} from './ffmpeg-run.js';
export {
  listRenderOutputs,
  RENDER_SHARE_SUBDIR,
  RENDER_WORK_SUBDIR,
  type RenderOutputInfo,
  renderOutputsForVersion,
} from './list-renders.js';
export {
  buildRenderManifest,
  ensureRenderManifest,
  RENDER_MANIFEST_SCHEMA_VERSION,
  type RenderManifest,
  RenderManifestChecksumSchema,
  RenderManifestError,
  RenderManifestPresetSchema,
  RenderManifestSchema,
  readRenderManifest,
} from './manifest.js';
// --- Naming scheme and sidecars (AC1) ---------------------------------------
export {
  composeMetadataPath,
  parseRenderFilename,
  RENDER_FILENAME_PATTERN,
  type RenderOutputIdentity,
  shareManifestPath,
} from './naming.js';
export {
  choosePosterTimeMs,
  type GeneratePosterOptions,
  generatePoster,
  PosterGenerationError,
} from './poster.js';
export {
  type FetchLike,
  type PutObjectOptions,
  type PutObjectResult,
  R2_REGION,
  R2_SERVICE,
  R2Client,
  type R2ClientOptions,
  R2UploadError,
} from './r2/client.js';
// --- The optional R2 uploader (AC3) -----------------------------------------
export {
  describeR2EnvRequirements,
  R2_ENV_VARS,
  type R2Config,
  type R2ConfigResult,
  readR2ConfigFromEnv,
} from './r2/env.js';
export { type UploadBundleResult, uploadBundle } from './r2/upload-bundle.js';
