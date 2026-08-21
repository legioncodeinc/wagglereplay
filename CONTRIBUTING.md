# Contributing to Waggle

Thanks for putting in the work to improve this project. Pre-alpha caveat: the repo is a seeded planning library until phase 1 implementation lands; the most useful contributions right now are issues against the PRDs and ADRs in `library/`.

## Before you start

- Search open issues and pull requests before starting substantial work.
- Architecture decisions live in `library/knowledge/private/architecture/` as ADRs. PRs that contradict an accepted ADR need a superseding ADR proposal first.

## Development setup

```bash
git clone https://github.com/legioncodeinc/wagglereplay.git
cd wagglereplay
corepack enable && pnpm install   # once prd-001 lands
```

## Branching and commits

- Branch off `main`. Name branches `<type>/<short-description>` (e.g. `feat/capture-extension-telemetry`).
- Write commit messages in [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format. Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`.
- Mark breaking changes with `!` or a `BREAKING CHANGE:` footer.

## Before opening a pull request

```bash
pnpm build
pnpm run --if-present lint
pnpm run --if-present typecheck
pnpm run --if-present test
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

Pre-1.0: releases are cut from `main` by the maintainer; `CHANGELOG.md` follows Keep a Changelog with SemVer.

## Questions

Open a GitHub Discussion or issue.
