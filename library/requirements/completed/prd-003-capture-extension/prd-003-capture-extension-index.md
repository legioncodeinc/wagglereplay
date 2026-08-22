# prd-003: Capture extension (Chrome MV3)

Status: completed (merged via PRs #1 and #2) | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-002 (IR types for the event payloads). Governing ADRs: ADR-010 (permissions), ADR-001, ADR-008 (masking posture). Corpus: capture-layer.md.

## Goal

apps/extension records a walkthrough: tab video via tabCapture in an offscreen document, plus epoch-aligned telemetry (clicks with element sampling, pointer trail, scrolls, masked inputs, route and state changes, settle markers), streamed to the local studio server. Sideload distribution.

## Non-goals

Chrome Web Store listing (later hardening), viewport forcing (never at capture, ADR-010 context), storyboard UI (prd-005).

## Acceptance criteria

Wave 1 (parallel):
- AC1: MV3 manifest with tabCapture, offscreen, webNavigation, storage, scripting, webRequest + host permissions; action click starts/stops capture on the active tab.
- AC2: Offscreen recorder: MediaRecorder WebM chunks with timeslice, epoch anchor at onstart, chunked upload to localhost studio endpoint; tab audio re-routed so playback stays audible.
- AC3: Content script telemetry: click/pointermove(30 Hz)/scroll/input(masked) with performance.timeOrigin epoch conversion.

Wave 2 (parallel after wave 1):
- AC4: Element sampler per click: fallback selectors (css, aria, text, xpath, pierce; data-testid preferred), rect, role+name, innerText, viewport, DPR, scroll offsets.
- AC5: Route detection: webNavigation events + MAIN-world history/Navigation patches; state-change classification via MutationObserver window with DOM delta summary.
- AC6: Settle markers: per-tab webRequest in-flight counter (websocket/SSE/beacon exclusions) emitting networkidle2-style markers with source labels.

Wave 3:
- AC7: Session finalizer emits events.jsonl + meta.json matching packages/ir ingest contract; live click ripple overlay toggleable.
- AC8: E2E on a fixture app: record a 6-step flow; telemetry aligns to video within 50 ms at each click (verified against ripple frames).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Manifest + action wiring + permission justifications doc | AC1 | typescript-node-worker-bee |
| 2 | getMediaStreamId to offscreen handoff | AC2 | typescript-node-worker-bee |
| 3 | MediaRecorder chunking + epoch anchor + localhost upload | AC2 | typescript-node-worker-bee |
| 4 | AudioContext re-route | AC2 | typescript-node-worker-bee |
| 5 | Telemetry listeners + epoch conversion util | AC3 | typescript-node-worker-bee |
| 6 | Input masking (values to {length, masked}) | AC3 | security-worker-bee |
| 7 | Selector generator (Recorder-style fallbacks) | AC4 | typescript-node-worker-bee |
| 8 | Element sampler payload builder | AC4 | typescript-node-worker-bee |
| 9 | webNavigation listeners + MAIN-world route patch | AC5 | typescript-node-worker-bee |
| 10 | Mutation-window state-change classifier | AC5 | typescript-node-worker-bee |
| 11 | webRequest in-flight counter + exclusions | AC6 | typescript-node-worker-bee |
| 12 | Finalizer (events.jsonl + meta.json) | AC7 | typescript-node-worker-bee |
| 13 | Ripple overlay content script | AC7 | ux-ui-svelte-worker-bee |
| 14 | Fixture-app e2e + alignment assertion | AC8 | quality-worker-bee |

## QA evidence

qa/ receives the alignment measurement table and permission audit.
