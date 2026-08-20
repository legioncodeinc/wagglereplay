# prd-012: CI regeneration

Status: backlog | Phase: 2 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-009 (regen), prd-011 (check gates). Governing ADRs: ADR-004 (runner profiles), ADR-014. Corpus: replay-and-render.md.

## Goal

Videos that never rot: a reusable GitHub Actions workflow (and a runner interface with a documented Cloudflare Containers profile stub) that replays and re-renders walkthrough projects on release or on demand, fails the run on intent/visual regressions, and uploads render artifacts.

## Non-goals

Hosting renders (ADR-009 covers export), building the full Cloudflare profile (stub + docs only until demand).

## Acceptance criteria

Wave 1:
- AC1: Runner interface extracted so regen jobs run identically local vs CI (env-driven paths, headless enforced, no interactive prompts).
- AC2: Reusable workflow `waggle-regen.yml`: checkout, pnpm setup, Playwright browsers cached, secrets from repo secrets, `waggle regen --check` per project, artifacts uploaded, summary posted to the run.

Wave 2:
- AC3: Trigger matrix documented and tested: release published, workflow_dispatch with project filter, and cron example; regen failures fail the check with the run report attached.
- AC4: Cloudflare Containers profile: interface stub + corpus-doc runbook (image contents, Workflows sketch, R2 artifact path) marked not-implemented, with an ADR pointer for when scale demands it.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Runner interface extraction | AC1 | typescript-node-worker-bee |
| 2 | Headless/no-prompt guards | AC1 | typescript-node-worker-bee |
| 3 | Reusable workflow + caching | AC2 | ci-release-worker-bee |
| 4 | Artifact upload + run summary | AC2 | ci-release-worker-bee |
| 5 | Trigger matrix docs + dispatch test | AC3 | ci-release-worker-bee |
| 6 | Containers profile stub + runbook doc | AC4 | devops-worker-bee |

## QA evidence

qa/ receives a green and a deliberately-failing CI run link pair.
