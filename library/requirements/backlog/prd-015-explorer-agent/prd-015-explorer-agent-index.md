# prd-015: Explorer agent

Status: backlog | Phase: 4 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-009 (replay/act machinery), prd-011 (verdicts + baselines), prd-010 (credentials). Governing ADRs: ADR-005, ADR-008, ADR-017 (provider keys: the explorer LLM key is a provider key, GUI entry via the encrypted store, env refs on the CLI/CI path), ADR-019 (CLI freeze: every interactive capability here ships through Studio, no new CLI surface). Corpus: replay-and-render.md (agentic driving section).

## Goal

A vision-capable agent session that logs into a demo tenant, explores the app, builds a screen graph (routes, primary actions), captures baseline screenshots per route and preset, runs UX heuristics plus vision critique per screen, and drafts candidate walkthrough IRs for the top journeys: all as drafts a human approves in the studio.

## Non-goals

Autonomous publishing of anything, load testing, crawling beyond configured origins.

## Acceptance criteria

Wave 1:
- AC1: Exploration session (Stagehand-style act/observe or computer-use adapter, env-selected) bounded by origin allowlist, step budget, and time budget; every action logged with screenshot refs.
- AC2: Screen graph persisted in the project: routes as nodes, actions as edges, dedup by route + primary landmark.

Wave 2:
- AC3: Baseline sweep: per route per preset screenshots filed into baselines/ through the prd-011 store.
- AC4: UX findings report: per-screen heuristic checks (contrast flags, dead ends, empty states, console errors) plus vision critique with confidence, rendered as a markdown report in the project.

Wave 3:
- AC5: Journey drafts: top N journeys emitted as draft IRs (flagged machine-generated) that open in the studio for narration and approval; a fixture app run produces at least one draft that replays green via prd-009.
- AC6: Spend guard: per-session token/cost budget enforced with a hard stop and partial-results save.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Session bounds (origins, budgets) + action logger | AC1 | typescript-node-worker-bee |
| 2 | Act/observe adapter (model-agnostic) | AC1 | mind-worker-bee |
| 3 | Screen-graph builder + dedup | AC2 | typescript-node-worker-bee |
| 4 | Baseline sweep integration | AC3 | typescript-node-worker-bee |
| 5 | Heuristic checks battery | AC4 | quality-worker-bee |
| 6 | Vision critique prompts + report writer | AC4 | mind-worker-bee |
| 7 | Journey ranking + draft IR emission | AC5 | mind-worker-bee |
| 8 | Studio draft intake + approval flow reuse | AC5 | svelte-worker-bee |
| 9 | Spend guard + partial save | AC6 | typescript-node-worker-bee |

## QA evidence

qa/ receives an exploration run report on the fixture app with the resulting draft IR.
