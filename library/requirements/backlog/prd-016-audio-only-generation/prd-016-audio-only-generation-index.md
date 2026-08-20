# prd-016: Audio-only video generation

Status: backlog | Phase: 4 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-013 (alignment), prd-015 (agent execution). Governing ADRs: ADR-006, ADR-008. Corpus: voice-and-narration.md, replay-and-render.md.

## Goal

The wild flow: user supplies only narration audio ("I click Sign in, choose email...") and a target URL; Waggle transcribes with word timestamps, parses intended steps, has the explorer execute them into an IR, and renders the video paced to the original audio. Experimental by design; every stage produces reviewable intermediates.

## Non-goals

Guaranteeing success on arbitrary apps (this is a draft generator with human checkpoints, not magic).

## Acceptance criteria

Wave 1:
- AC1: STT pass (word timestamps) + LLM intent parser produce an intended-step list with per-step confidence, saved for review; ambiguous verbs flag rather than guess.
- AC2: Studio checkpoint: author confirms/edits the intended-step list before any browser runs (skippable via explicit yolo flag that is loud in output).

Wave 2:
- AC3: Explorer executes the confirmed list into a draft IR; unresolvable steps fail soft with screenshots and the run continues where safe.
- AC4: Render paced to the source audio via the prd-013 pipeline; fixture case (scripted narration against the fixture app) produces a watchable video end to end.
- AC5: Full-run provenance: transcript, intent list, execution log, and IR linked from one run report.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | STT adapter reuse + transcript store | AC1 | typescript-node-worker-bee |
| 2 | Intent parser prompt + confidence + flagging | AC1 | mind-worker-bee |
| 3 | Studio intent review checkpoint | AC2 | svelte-worker-bee |
| 4 | Executor bridge to prd-015 session | AC3 | typescript-node-worker-bee |
| 5 | Soft-fail semantics + screenshots | AC3 | typescript-node-worker-bee |
| 6 | Pacing integration + fixture e2e | AC4 | quality-worker-bee |
| 7 | Provenance report writer | AC5 | typescript-node-worker-bee |

## QA evidence

qa/ receives the fixture end-to-end artifacts chain.
