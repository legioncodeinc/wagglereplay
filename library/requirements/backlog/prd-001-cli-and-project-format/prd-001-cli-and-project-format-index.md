# prd-001: CLI and project format

Status: backlog | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: none (first buildable unit). Governing ADRs: ADR-013 (OSS/AGPL), ADR-014 (local-first), ADR-015 (filesystem project dirs). Corpus: walkthrough-ir-and-project-format.md.

## Goal

Stand up the pnpm workspace monorepo and a `waggle` CLI whose commands scaffold and operate on filesystem project directories: init, record (launches studio), narrate, render, regen, export. The project directory layout from ADR-015 becomes real, validated code.

## Non-goals

IR schema internals (prd-002), any capture/replay/render logic (they plug into stubs this PRD defines), publishing to npm.

## Acceptance criteria

Wave 1 (parallel):
- AC1: pnpm workspace boots: apps/extension, apps/studio, packages/{ir,replay,compose,narrate,cli}, plugins/remotion exist with tsconfig, lint, vitest wired; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass repo-wide (activates the seeded CI).
- AC2: `waggle init <name>` creates the ADR-015 directory layout with a valid waggle.json manifest; running it twice refuses politely.
- AC3: Project manifest loader validates waggle.json (zod), reports actionable errors with file/line.

Wave 2 (after wave 1):
- AC4: Command surface registered with help text: record, narrate, render, regen, export as stubs that resolve the project dir, load the manifest, and exit with "not implemented (prd-00X)" pointing at the owning PRD.
- AC5: renders/ and .env are gitignored inside newly scaffolded projects; credentials.json template contains env refs only.
- AC6: E2E test: init in a temp dir, manifest round-trips, stub commands exit with the documented codes.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Scaffold pnpm-workspace.yaml + root package.json + turbo-free scripts | AC1 | typescript-node-worker-bee |
| 2 | Per-package package.json + tsconfig (composite refs) | AC1 | typescript-node-worker-bee |
| 3 | Wire Biome (or ESLint) + vitest base config | AC1 | typescript-node-worker-bee |
| 4 | Define project layout constants + path helpers in packages/cli | AC2 | typescript-node-worker-bee |
| 5 | Implement `waggle init` scaffolder | AC2 | typescript-node-worker-bee |
| 6 | zod schema for waggle.json + loader with error mapping | AC3 | typescript-node-worker-bee |
| 7 | Commander (or citty) command registry + help copy | AC4 | typescript-node-worker-bee |
| 8 | Stub commands with owning-PRD exit messages | AC4 | typescript-node-worker-bee |
| 9 | Project-level .gitignore + credentials.json template emission | AC5 | security-worker-bee |
| 10 | Vitest e2e: init round-trip in tmp dir | AC6 | quality-worker-bee |

## QA evidence

qa/ receives the quality report; repo CI must be green on the PR.
