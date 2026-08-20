# prd-004: Ingest pipeline

Status: backlog | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-002 (IR), prd-003 (recording inputs). Governing ADRs: ADR-001, ADR-015. Corpus: capture-layer.md, walkthrough-ir-and-project-format.md.

## Goal

Turn a finished recording (video.webm + events.jsonl + meta.json) into IR v1 plus storyboard assets inside the project dir: step segmentation, keyframe extraction, AI pre-draft descriptions.

## Non-goals

Editing UI (prd-005), narration (prd-006).

## Acceptance criteria

Wave 1:
- AC1: Step segmenter groups raw events into IR steps (click/input/scroll grouping, route boundaries, settle attachment) with deterministic output on the fixture recordings.
- AC2: ffmpeg keyframe extractor: for each step, frames at t-5s..t+5s at 1 fps plus exact click frame and settled frame, filed under steps/ by IR version.

Wave 2:
- AC3: Heatmap data: normalized click coordinates aggregated per route, stored alongside the IR for the studio overlay.
- AC4: AI pre-draft: per-step description drafted from before/after frames + element metadata (provider-agnostic LLM call, key from env); marked machine-drafted until author edits.
- AC5: `waggle record` end-to-end: extension session lands as a valid IR v1 project state; ingest is idempotent (re-run produces byte-identical IR given same inputs).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Event stream parser + validation against prd-002 types | AC1 | typescript-node-worker-bee |
| 2 | Segmentation rules (click grouping, route boundaries) | AC1 | typescript-node-worker-bee |
| 3 | Settle-marker attachment + step classification pass-through | AC1 | typescript-node-worker-bee |
| 4 | ffmpeg frame extraction wrapper + naming convention | AC2 | typescript-node-worker-bee |
| 5 | Click/settled exact-frame picker from timestamps | AC2 | typescript-node-worker-bee |
| 6 | Heatmap aggregation | AC3 | typescript-node-worker-bee |
| 7 | Pre-draft prompt + adapter call + machine-drafted flag | AC4 | mind-worker-bee |
| 8 | Wire into `waggle record` finalization | AC5 | typescript-node-worker-bee |
| 9 | Idempotency test (hash IR across re-runs) | AC5 | quality-worker-bee |

## QA evidence

qa/ receives segmentation fixtures diff and extraction timing notes.
