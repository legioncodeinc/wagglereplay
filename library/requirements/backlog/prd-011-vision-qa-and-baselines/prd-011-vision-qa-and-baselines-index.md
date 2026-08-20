# prd-011: Vision QA and visual baselines

Status: backlog | Phase: 2 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-009 (per-step screenshots from replay). Governing ADRs: ADR-005 (odiff in-house), ADR-008 (scrubbed prompts). Corpus: replay-and-render.md.

## Goal

Two guards on every regen: a fast vision model verdict per step (does the settled screen match the step's intent, any visible errors) and odiff pixel baselines per step per preset, both surfaced in the studio and in `waggle regen --check` exit codes. Plus the self-heal proposal path for selector drift.

## Non-goals

Autonomous exploration (prd-015), fixing the target app.

## Acceptance criteria

Wave 1 (parallel):
- AC1: Verdict adapter (provider-agnostic, Gemini Flash-Lite default via env): screenshot + scrubbed step intent to strict schema {matches_intent, anomalies[], confidence}; malformed responses retry once then mark unavailable, never crash a render.
- AC2: odiff baseline store in baselines/: accept/update/compare per step per preset; diffs over threshold produce annotated artifacts.

Wave 2:
- AC3: `waggle regen --check` exit codes distinguish clean, visual-diff, intent-fail, step-fail; run report includes per-step verdicts and diff refs.
- AC4: Studio review surface: flagged steps render verdict, diff overlay, accept/reject baseline buttons writing to baselines/.
- AC5: Self-heal: on locate failure, an observe pass proposes candidate selectors as an IR patch draft requiring author approval in the studio (never auto-applied).
- AC6: Cost guard: per-run QA spend estimate printed; QA skippable per run; total tokens logged.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Verdict schema + adapter + retry policy | AC1 | mind-worker-bee |
| 2 | Gemini client + image sizing (cap DPR upload cost) | AC1 | typescript-node-worker-bee |
| 3 | odiff wrapper + baseline store layout | AC2 | typescript-node-worker-bee |
| 4 | Threshold config + annotated diff artifacts | AC2 | typescript-node-worker-bee |
| 5 | Exit-code contract + run-report merge | AC3 | typescript-node-worker-bee |
| 6 | Studio flagged-step review UI | AC4 | ux-ui-svelte-worker-bee |
| 7 | Accept/reject baseline actions | AC4 | svelte-worker-bee |
| 8 | Observe-based selector proposal + IR patch draft | AC5 | mind-worker-bee |
| 9 | Approval flow in studio | AC5 | svelte-worker-bee |
| 10 | Cost estimator + skip flag | AC6 | typescript-node-worker-bee |

## QA evidence

qa/ receives a seeded-defect run (intentionally broken fixture) showing catch rates.
