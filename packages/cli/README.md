# @waggle/cli

The `waggle` command-line entry point: scaffolds and operates on filesystem
Waggle project directories (ADR-015). Built in prd-001 and extended by each
package PRD as its command became operational.

There is no published/global `waggle` binary yet (npm publishing is a
non-goal of prd-001). Run it through the workspace instead:

```bash
pnpm --filter @waggle/cli start <command> [...args]
```

## Commands

| Command | Status | Owning PRD |
|---|---|---|
| `waggle init <name>` | Implemented | prd-001 |
| `waggle record` | Implemented | prd-004 |
| `waggle narrate` | Implemented | prd-006 |
| `waggle render` | Implemented | prd-007 |
| `waggle regen` | Implemented | prd-009 |
| `waggle export` | Implemented | prd-008 |
| `waggle studio` | Implemented | prd-005 |
| `waggle creds check` | Implemented | prd-010 |
| `waggle clean` | Implemented | prd-008 |

Every project command resolves the project directory (`--project <dir>`,
default cwd) and validates `waggle.json` before performing command-specific
work. Missing and malformed projects therefore use the same documented exit
codes across the command surface.

## Exit codes

Canonical source: [`src/exit-codes.ts`](./src/exit-codes.ts). This table is a
rendered copy; keep both in sync.

| Code | Name | Meaning |
|---|---|---|
| 0 | `SUCCESS` | The command completed successfully. |
| 1 | `GENERIC_ERROR` | An unexpected error, or a CLI usage error from commander itself (unknown command, unknown option, missing required argument). |
| 3 | `PROJECT_ALREADY_EXISTS` | `waggle init` refused to run: a `waggle.json` already exists at the target directory. Nothing was modified. |
| 4 | `PROJECT_NOT_FOUND` | The resolved project directory has no `waggle.json`. Run `waggle init <name>` first. |
| 5 | `MANIFEST_INVALID` | `waggle.json` exists but is not valid JSON, or fails the manifest schema. The error message names the file and either the offending JSON path or a line/column. |
| 6 | `NOT_IMPLEMENTED` | The command's project/manifest resolution succeeded, but its own behavior is not implemented yet in this PRD wave. The message names the owning PRD. |
| 7 | `NARRATION_NOT_APPROVED` | `waggle narrate` drafted (or re-drafted) `narration/script.json` and is waiting on author approval, or a saved script still has unapproved segments. Nothing was sent to a TTS provider. |
| 8 | `TTS_CONFIG_INVALID` | `waggle narrate` could not construct a TTS adapter from the environment (unknown `WAGGLE_TTS_PROVIDER`, or a required provider variable such as `ELEVENLABS_API_KEY` is missing). The message names the exact variable. |
| 9 | `SHAREABLE_AUDIO_REFUSED` | `waggle narrate` refused to render shareable audio: the ElevenLabs plan is free tier, or the selected model is flagged beta (ADR-006). Set `WAGGLE_ALLOW_UNLICENSED_AUDIO=1` to override. |
| 10 | `INGEST_SESSION_REQUIRED` | `waggle record` needs `--session <dir>`: the recommended human path for interactive capture is the extension flow (Studio, per ADR-019); this command is the scripted ingestion path. Point `--session` at a finished capture session, meaning the exact output of the extension finalizer: `events.jsonl`, `meta.json`, and the video file. |
| 11 | `INGEST_INVALID_SESSION` | `waggle record --session <dir>` pointed at a directory missing `events.jsonl` or `meta.json`, failing those schemas, not seq-ordered, or naming a video file that does not exist. The message names the exact file and problem. |
| 12 | `RENDER_INPUT_MISSING` | `waggle render` or `waggle regen` could not assemble its inputs: no recorded IR, a missing source recording, or narration audio and `words.json` disagreeing about whether the project has been narrated. The message names the file. |
| 13 | `FFMPEG_FAILED` | A render could not launch the compositor backend (ffmpeg is not installed and `WAGGLE_FFMPEG_PATH` is unset), or it exited non-zero. The tail of its stderr is included. |
| 14 | `BRAND_KIT_INVALID` | `waggle render --brand-kit <id>` named a kit that does not exist under `brand/`, or the kit file is not valid JSON or fails the brand kit schema. |
| 15 | `PRESET_UNKNOWN` | `waggle render --preset <id>` or `waggle regen --preset <id>` named an unknown or malformed preset. The message lists the known ids. |
| 16 | `STUDIO_BUILD_MISSING` | `waggle studio` could not find `@waggle/studio`'s built adapter-node server (`build/index.js`). Run `pnpm --filter @waggle/studio build` (or the workspace `pnpm build`) first. |
| 17 | `STUDIO_PORT_UNAVAILABLE` | `waggle studio` could not bind its host:port (default `127.0.0.1:4310`): something else is already listening there. Pass `--port <port>` to use a different one. |
| 20 | `EXPORT_NO_RENDERS` | `waggle export` found no rendered outputs for the project's current IR version. Run `waggle render` first. |
| 21 | `BUNDLE_LINK_INTEGRITY_FAILED` | `waggle export` built a share bundle whose HTML page references a file that does not exist inside the bundle directory (prd-008 AC2's link-integrity check). The message names every missing reference. |
| 22 | `R2_CONFIG_INVALID` | `waggle export --upload` was passed but one or more `WAGGLE_R2_*` environment variables are not set. The message names every missing variable and what it is for. |
| 23 | `R2_UPLOAD_FAILED` | `waggle export --upload` was fully configured but the R2 API rejected an upload (a non-2xx response). The message includes the HTTP status and a snippet of R2's own error body. |
| 24 | `CREDS_INVALID` | `waggle creds check` found a `credentials.json` that is invalid JSON or does not satisfy the canonical reference-only schema. |
| 25 | `CREDS_UNRESOLVED` | `waggle creds check` found one or more declared environment-variable names that are unset or empty on this machine. Names are reported; values are never printed. |

## `waggle narrate` (prd-006)

Drafts `narration/script.json` from the current Walkthrough IR (one segment
per step, deterministically, from the step's own classification, element,
and DOM-delta metadata; see `@waggle/narrate`'s README for why this is not
an LLM call), then refuses to synthesize anything until every segment is
author-approved (`approved: true`, non-null `approvedText`). Once approved,
selects a TTS provider from the environment (`WAGGLE_TTS_PROVIDER`, default
`elevenlabs` per ADR-006) and writes `narration/audio.mp3` and
`narration/transcript.txt`, plus, for a provider that returns timestamps,
`narration/words.json`, `narration/captions.srt`, and
`narration/captions.vtt`. See `packages/narrate/README.md` for the full
environment variable list, the `words.json` shared contract, and the AC7
shareable-audio guardrail.

## `waggle regen` (prd-009)

Replays the current Walkthrough IR against the live target, captures fresh
video for every configured replay preset, recomposites each result, and writes
the latest run report under `renders/regen/latest-run.json`.

```bash
pnpm --filter @waggle/cli start regen --project ./my-walkthrough
pnpm --filter @waggle/cli start regen --project ./my-walkthrough \
  --preset 16x9 --preset mobile
```

`--preset` is repeatable. Without it, replay uses the project configuration
and then the built-in default. A run that reaches the reporting stage but has
failed steps or renders still writes the report and exits nonzero.

Local replay requires Chromium and ffmpeg. `WAGGLE_RENDER_CONCURRENCY` controls
the maximum number of replay-plus-render jobs in flight; its default is 2.

## `waggle creds check` (prd-010, ADR-008)

Validates the project's reference-only `credentials.json` and reports whether
each named environment variable resolves on the current machine. It prints
environment-variable names and status words only, never resolved values.

```bash
pnpm --filter @waggle/cli start creds check --project ./my-walkthrough
```

A credential set names variables such as `DEMO_USER`, `DEMO_PASSWORD`, and
`DEMO_TOTP_SEED`. The committed `credentials.json` stores those names. The
corresponding values belong only in the process environment or a local,
gitignored environment file that you load into the Waggle process.
`.env.example` documents the names with blank values; never place a real
username, password, or TOTP seed in that file.

## `waggle export` (prd-008, ADR-009)

Builds the static share bundle for the project's current Walkthrough IR
version: a self-contained `index.html` (no CDN, no external font, no
external script) plus, alongside it in `renders/share/v<n>/`, the rendered
MP4 (and every other preset rendered for that version, offered as
additional downloads), a poster JPEG, a WebVTT captions track and plain-
text transcript (when the project has been narrated), and each render's
`.manifest.json` sidecar (see prd-008 AC1 below). Every href/src the page
emits is checked against the files actually on disk before the command
reports success (`ExitCode.BUNDLE_LINK_INTEGRITY_FAILED` otherwise). See
`@waggle/share`'s README for the bundle layout and the sidecar shape in
full.

`--upload` additionally pushes the bundle to the user's own Cloudflare R2
bucket over R2's S3-compatible API (ADR-009: "zero egress... when
configured") and prints the public URL layout. It requires five
environment variables (`WAGGLE_R2_ACCOUNT_ID`, `WAGGLE_R2_ACCESS_KEY_ID`,
`WAGGLE_R2_SECRET_ACCESS_KEY`, `WAGGLE_R2_BUCKET`,
`WAGGLE_R2_PUBLIC_BASE_URL`); without `--upload`, none of this runs and no
R2 variable is ever read. There are no live R2 credentials in this
environment: `@waggle/share`'s README states precisely which one assertion
about the uploader still needs a real bucket to fully verify.

## `waggle clean` (prd-008)

Prunes stale render outputs: per (brand kit, preset) pair, everything
older than the `--keep-versions` most recent IR versions (default 1), plus
(only when `--older-than-days <n>` is passed) anything older than that
many days regardless of version. `renders/.work/` (the compositor's own
scratch space) is always offered for removal as pure cache.
`renders/share/` (bundles `waggle export` built, which may already be
distributed) is never touched by this command.

**Dry run is the default.** `waggle clean` always prints what it would
remove and never deletes anything unless `--force` is passed.

## `waggle studio` (prd-005)

Boots `@waggle/studio`'s built adapter-node server (`apps/studio/build/index.js`
- run `pnpm --filter @waggle/studio build`, or the workspace `pnpm build`,
before the first launch) as a child process bound to `--host`/`--port`
(default `127.0.0.1:4310`, matching `apps/extension`'s own
`DEFAULT_STUDIO_ORIGIN`), with the resolved project directory passed as the
`WAGGLE_PROJECT_DIR` environment variable and `BODY_SIZE_LIMIT=Infinity`
(adapter-node's default 512kB request cap would otherwise reject the
extension's binary video-chunk uploads). Blocks in the foreground like any
other dev server; Ctrl+C (SIGINT) is forwarded to the child.

Studio serves:

- The extension's exact upload contract
  (`apps/extension/src/lib/upload-client.ts`): `POST /waggle/sessions/:id/video/chunks/:index`,
  `POST /waggle/sessions/:id/events`, `POST /waggle/sessions/:id/meta`. The
  `meta` upload is the session's finalize signal - Studio assembles the
  uploaded chunks and runs `@waggle/ingest`'s full pipeline against them
  automatically, the same as `waggle record --session <dir>` does by hand.
- The film strip, step detail, description editor, heatmap overlay, and
  project settings UI at `/`.
- `j`/`k` step navigation, `e` to jump into the selected step's description
  editor, `h` to toggle the heatmap, and `?` for the in-app shortcut sheet.

## Project manifest (waggle.json)

Validated with zod against `src/manifest/schema.ts`. Any load failure
(missing file, malformed JSON, schema violation, or an unknown key, since the
schema is `.strict()`) throws a `CliExitError` that names the manifest's
absolute path plus the offending JSON path or line/column, never a bare
"invalid input".

## Development

```bash
pnpm --filter @waggle/cli test        # vitest, including the e2e suite
pnpm --filter @waggle/cli typecheck   # tsc --noEmit
```

`test/e2e-init-and-stubs.test.ts` calls `runCli()` in-process against real
temp directories on disk (no mocked filesystem), then cleans up in
`afterEach`. It runs identically on Windows and POSIX because it only uses
`node:path` and `node:os.tmpdir()`, never a hardcoded separator.
