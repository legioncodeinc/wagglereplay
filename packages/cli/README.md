# @waggle/cli

The `waggle` command-line entry point: scaffolds and operates on filesystem
Waggle project directories (ADR-015). Built in prd-001; most subcommands are
stubs until the PRD that owns them lands.

There is no published/global `waggle` binary yet (npm publishing is a
non-goal of prd-001). Run it through the workspace instead:

```bash
pnpm --filter @waggle/cli start <command> [...args]
```

## Commands

| Command | Status | Owning PRD |
|---|---|---|
| `waggle init <name>` | Implemented | prd-001 |
| `waggle record` | Stub | prd-004 |
| `waggle narrate` | Implemented | prd-006 |
| `waggle render` | Implemented | prd-007 |
| `waggle regen` | Stub | prd-009 |
| `waggle export` | Stub | prd-008 |
| `waggle studio` | Stub | prd-005 |
| `waggle creds` | Stub | prd-010 |
| `waggle clean` | Stub | prd-008 |

Every stub resolves the project directory (`--project <dir>`, default cwd),
loads and validates `waggle.json`, and then exits with `ExitCode.NOT_IMPLEMENTED`
and a message of the form `waggle <command>: not implemented (prd-00X)`. This
means a stub still surfaces a missing project or a broken manifest exactly
like the real command eventually will; only the command's own behavior is
unbuilt.

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
| 10 | `INGEST_SESSION_REQUIRED` | `waggle record` needs `--session <dir>`. Interactive capture (launching Studio, driving the extension) is prd-005 work and does not exist yet in this PRD wave. Point `--session` at a finished capture session, meaning the exact output of the extension finalizer: `events.jsonl`, `meta.json`, and the video file. |
| 11 | `INGEST_INVALID_SESSION` | `waggle record --session <dir>` pointed at a directory missing `events.jsonl` or `meta.json`, failing those schemas, not seq-ordered, or naming a video file that does not exist. The message names the exact file and problem. |
| 12 | `RENDER_INPUT_MISSING` | `waggle render` could not assemble its inputs: no recorded IR, a missing source recording, or narration audio and `words.json` disagreeing about whether the project has been narrated. The message names the file. |
| 13 | `FFMPEG_FAILED` | `waggle render` could not launch the compositor backend (ffmpeg is not installed and `WAGGLE_FFMPEG_PATH` is unset), or it exited non-zero. The tail of its stderr is included. |
| 14 | `BRAND_KIT_INVALID` | `waggle render --brand-kit <id>` named a kit that does not exist under `brand/`, or the kit file is not valid JSON or fails the brand kit schema. |
| 15 | `PRESET_UNKNOWN` | `waggle render --preset <id>` named a preset that is neither built in nor declared in `waggle.json`, or the manifest entry for it is malformed. The message lists the known ids. |

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
