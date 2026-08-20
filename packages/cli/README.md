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
| `waggle narrate` | Stub | prd-006 |
| `waggle render` | Stub | prd-007 |
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
