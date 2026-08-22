# Contributing to Waggle

Thanks for putting in the work to improve this project. The codebase is live: PRDs 001 through 010 (the capture-to-render pipeline plus replay regeneration and credential masking) are implemented and merged, and the remaining PRDs (011 through 018) are queued in `library/requirements/backlog/`. The most useful contributions map to a PRD acceptance criterion or fix a defect in shipped code; open an issue first for anything architectural.

## Before you start

- Search open issues and pull requests before starting substantial work.
- Architecture decisions live in `library/knowledge/private/architecture/` as ADRs (20 accepted). PRs that contradict an accepted ADR need a superseding ADR proposal first; accepted ADRs are never edited in a feature PR except for clearly labeled amendment notes.
- Per ADR-019, the CLI surface is frozen: every new user-facing capability ships through the extension or Studio, never as a new CLI command or flag.
- Provider and demo credentials never enter walkthrough project files, IR, logs, or prompts (ADR-008, ADR-017). Environment references only.

## Development setup

```bash
git clone https://github.com/legioncodeinc/wagglereplay.git
cd wagglereplay
corepack enable && pnpm install
pnpm build
```

You need ffmpeg 7+ on PATH (or `WAGGLE_FFMPEG_PATH`) for the compositor tests; they deliberately do not skip when ffmpeg is absent.

## Branching and commits

- Branch off `main`. Name branches `<type>/<short-description>` (e.g. `feat/capture-extension-telemetry`).
- Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format. Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`.
- Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

## Before opening a pull request

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm build` first. `packages/cli`'s studio-command tests boot the real
`@waggle/studio` server from its built output (`apps/studio/build/index.js`,
gitignored), so `pnpm test` fails on a fresh clone that has never been
built. CI builds automatically before its own Test job.

All must pass. House style: no em dashes or en dashes in any authored file.

## Pull requests

- Fill out every section of the PR template.
- Keep PRs small and single-purpose.
- Link the issue or PRD acceptance criterion the change satisfies.

## Reporting bugs and requesting features

Use the issue templates. Security vulnerabilities go through [SECURITY.md](./SECURITY.md), never public issues.

## Release process

Pre-1.0: releases are cut from `main` by the maintainer; `CHANGELOG.md` follows Keep a Changelog with SemVer. The first tagged release and the unsigned installer pipeline are planned with prd-018.

## Questions

Open a GitHub Discussion or issue.
