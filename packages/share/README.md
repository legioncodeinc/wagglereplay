# @waggle/share

Render output management, the static share-page bundle, and the optional
R2 uploader (prd-008). Governed by ADR-009 (local render files plus a
static share-page export; R2 upload is optional and user-owned, never a
hosted service) and ADR-011 (reframed output is honestly labelled).

`waggle export` (`packages/cli/src/commands/export.ts`) and `waggle clean`
(`packages/cli/src/commands/clean.ts`) wire this package end to end. Every
piece is also exported individually from `src/index.ts` for direct use
(tests, Studio, a future `waggle export --dry-run`).

## AC1: the render output sidecar

`@waggle/compose`'s `renderProject` already writes a `.render.json`
sidecar next to every real encode, deliberately without a timestamp (see
its own doc comment: "a sidecar with a clock in it would be the one part
of a render that is not reproducible"). This package does not own that
file and does not duplicate its contents; `buildRenderManifest`
(`src/manifest.ts`) READS it and adds exactly the one field prd-008 AC1
asks for that it is missing: a checksum. The result is written as
`<output>.manifest.json`, equally timestamp-free, next to the render:

```json
{
  "schemaVersion": 1,
  "filename": "walkthrough.v1.default.16x9.mp4",
  "irVersion": 1,
  "brandKitId": "default",
  "preset": { "id": "16x9", "width": 1920, "height": 1080, "fps": 30 },
  "reframe": "native",
  "durationMs": 12345,
  "checksum": { "algorithm": "sha256", "value": "<64-char hex digest>" }
}
```

`ensureRenderManifest` writes this once and recomputes it only when the
checksum on disk no longer matches the recorded one (a re-render).
`listRenderOutputs`/`renderOutputsForVersion` (`src/list-renders.ts`) parse
the stable naming scheme (`walkthrough.v<N>.<kit>.<preset>.mp4`, matching
what `renderFilename` in `@waggle/compose` already writes) to group and
list renders without touching `.work/` (compose's scratch space) or
`share/` (this package's own bundle output).

## AC2: the share bundle

`buildShareBundle` (`src/bundle/build-bundle.ts`) assembles
`renders/share/v<n>/` for one IR version:

```
renders/share/v1/
  index.html                          self-contained: inline CSS, no JS, no CDN, no font, no network call
  poster.jpg                          a real ffmpeg frame grab, not a placeholder
  captions.vtt                        from @waggle/narrate's renderVtt(words.json), never reimplemented
  transcript.txt                      copied from narration/transcript.txt, or derived from words.json's sourceText
  walkthrough.v1.default.16x9.mp4     the embedded player's source
  walkthrough.v1.default.9x16.mp4     every other preset rendered for this IR version, offered as a download
```

`renders/` is already gitignored by the project's own `waggle init`
scaffold ("Rendered videos and share bundles are regenerable derivatives
of the Walkthrough IR. Do not commit them."), so `share/` living under it
needed no change to that scaffold.

**"Self-contained" means the HTML page itself has no external dependency**
(`src/bundle/html-template.ts`): every stylesheet rule is inlined in a
`<style>` block, there is no `<script>` tag at all (native
`<video controls>` is keyboard-operable on its own), and every asset the
page needs is a sibling file in the same directory, linked by a bare
relative path. That is what lets the bundle work from a `file://` URL, any
static host, or a GitHub Pages branch (ADR-009) with zero configuration.

**How the link-integrity check works and how it is proven** (AC2): after
the page is written, `checkLinkIntegrity` (`src/bundle/link-integrity.ts`)
parses the ACTUAL HTML on disk with a regex over every `href="..."` and
`src="..."` attribute, skips anything that is not a bundle-relative file
reference (an absolute URL, `mailto:`/`tel:`, a `data:` URI, or a bare
`#fragment`), and resolves everything else against the bundle directory
with `existsSync`. `buildShareBundle` runs this immediately after writing
`index.html` and throws `BundleLinkIntegrityError` (which the CLI maps to
`ExitCode.BUNDLE_LINK_INTEGRITY_FAILED`) if anything is missing, so a
broken bundle can never be reported as a success. `test/link-integrity.test.ts`
exercises the checker directly (pass, fail, and every kind of link it must
ignore); `test/build-bundle-e2e.test.ts` runs it again against a bundle
built from a REAL ffmpeg render, with and without narration present, which
is the proof that the template this package actually emits is
self-contained and internally consistent, not just that the checker
function works in isolation.

## AC3: the optional R2 uploader

Cloudflare R2's S3-compatible API accepts AWS SigV4 with region `auto` and
service `s3` (Cloudflare's own documented values). `src/r2/sigv4.ts`
hand-rolls that signing algorithm rather than pulling in an AWS SDK, for
the same reason `@waggle/narrate`'s TTS adapters hand-roll their HTTP
clients: this workspace has exactly one caller of the algorithm, and a
full SDK's credential-provider chain would be a large, mostly-unused
dependency for one signed PUT. `src/r2/client.ts`'s `R2Client` takes its
transport as an injectable `fetchImpl` (defaulting to the real global
`fetch`), exactly like every TTS adapter in `@waggle/narrate`.

Env configuration (`src/r2/env.ts`), all five required together:

| Variable | What it is |
|---|---|
| `WAGGLE_R2_ACCOUNT_ID` | Cloudflare account id; the API endpoint is `https://<account id>.r2.cloudflarestorage.com` |
| `WAGGLE_R2_ACCESS_KEY_ID` | R2 API token access key id |
| `WAGGLE_R2_SECRET_ACCESS_KEY` | R2 API token secret access key |
| `WAGGLE_R2_BUCKET` | the bucket to upload the share bundle into |
| `WAGGLE_R2_PUBLIC_BASE_URL` | the base URL the bucket is served from (a connected custom domain, or its r2.dev URL), so a public link can be printed |

`readR2ConfigFromEnv` never throws: it reports either a complete config or
the exact list of missing variables, and `describeR2EnvRequirements`
turns that list into the guidance text `waggle export --upload` prints
verbatim (AC3: "explain exactly which variables to set. Do not fail
obscurely").

**What needs a live R2 bucket to fully verify.** Every assertion this
package's test suite makes about the uploader runs against a mocked
`fetchImpl`: request URL and method, the signed `Authorization` header's
shape, per-file `Content-Type` selection, the public URL layout, and error
translation on a non-2xx response (`test/r2-client.test.ts`,
`test/upload-bundle.test.ts`). The one thing that cannot be asserted
without live credentials is that a REAL R2 bucket accepts a request signed
this way and returns 200 for a correctly-formed PUT: this environment has
no R2 credentials, and none should ever be committed here. Everything
about request construction is otherwise fully implemented and exercised,
including the SigV4 primitives themselves (`test/sigv4.test.ts`) against
the published RFC 4231 HMAC-SHA-256 test vector, independent of this
package's own code.

## AC4: `waggle clean`

`src/clean/plan.ts` splits planning from deletion on purpose:
`planClean` never touches disk; `deleteCleanCandidates` is the only
function that does, and only when a caller explicitly calls it (the CLI
gates that call behind `--force`). Two independent staleness rules mark a
render output a removal candidate:

- **version**: per (brand kit, preset), only the `keepVersions` most
  recent IR versions are kept (default 1); everything older is
  `stale-version`.
- **age**: only when `olderThanDays` is passed, a render whose file
  modification time is past that threshold is `age`, regardless of
  version. Off by default: unprompted age-based deletion is exactly what a
  dry-run default exists to prevent from ever reaching disk unreviewed.

`renders/.work/` (compose's own scratch space) is always a cleanup
candidate as pure cache. `renders/share/` is deliberately never touched:
a bundle may already be distributed, and pruning a render must never
silently break a link someone else is holding.
