# prd-009: Replay engine

Status: completed (merged via PRs #1 and #2) | Phase: 2 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-002 (IR), prd-007 (compositor consumes replay video), prd-010 recommended alongside for authenticated targets. Governing ADRs: ADR-002 (screencast capture), ADR-011 (smart reframe), ADR-014 (local-first). Corpus: replay-and-render.md.

## Goal

packages/replay: deterministically re-execute an IR in local Playwright at any preset viewport, capture clean video via CDP screencast piped to ffmpeg, take per-step screenshots, and hand the compositor a replay-sourced video that upgrades every phase 1 render. This is the moat PRD.

## Non-goals

Vision verdicts (prd-011), cloud runners (prd-012), audio pacing (prd-013).

## Acceptance criteria

Wave 1:
- AC1: Step-to-Playwright mapper: fallback-selector cascade locate, act per step type, settle (element assertion primary, quiescence heuristic with exclusions secondary, timeout tertiary), per-step screenshot; failures produce a structured StepFailure, never a crash.
- AC2: Determinism kit applied per context: reducedMotion emulation, animation-kill CSS injection toggle, fixed timezone/locale, storage-state load.

Wave 2:
- AC3: Screencast capture: Page.startScreencast frames acked and piped to ffmpeg H.264 at preset fps/dimensions; A/V-free master plus per-step timing manifest for the compositor.
- AC4: Preset matrix: 16x9, 9x16, 1x1, desktop, mobile presets with DPR/mobile flags; per-preset native-reflow probe decides native vs reframed (ADR-011) and records the label.
- AC5: Smart reframe data: focus-point track (click coords + element centers, eased) emitted for reframed presets; compositor consumes it (prd-007 AC5 path).

Wave 3:
- AC6: `waggle regen`: replays current IR, re-captures, re-composites all configured presets; a fixture app UI change (moved button) yields a successful regen via fallback selectors, with the selector drift recorded in the run report.
- AC7: Run report per regen (steps, settle sources, durations, failures, drift notes) written into the project.
- AC8: Concurrency respects WAGGLE_RENDER_CONCURRENCY across preset jobs.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Locator cascade + act mapping (click/input/scroll/navigate) | AC1 | typescript-node-worker-bee |
| 2 | Settle orchestration + StepFailure type | AC1 | typescript-node-worker-bee |
| 3 | Determinism kit context factory | AC2 | typescript-node-worker-bee |
| 4 | Screencast frame pump + ack loop | AC3 | typescript-node-worker-bee |
| 5 | ffmpeg encode pipe + timing manifest | AC3 | typescript-node-worker-bee |
| 6 | Preset registry + reflow probe | AC4 | typescript-node-worker-bee |
| 7 | Focus-point track generator | AC5 | typescript-node-worker-bee |
| 8 | regen command orchestration | AC6 | typescript-node-worker-bee |
| 9 | Moved-button fixture + drift e2e | AC6 | quality-worker-bee |
| 10 | Run report writer | AC7 | typescript-node-worker-bee |
| 11 | Concurrency limiter | AC8 | typescript-node-worker-bee |

## QA evidence

qa/ receives the drift e2e run report and a native-vs-reframed sample pair.
