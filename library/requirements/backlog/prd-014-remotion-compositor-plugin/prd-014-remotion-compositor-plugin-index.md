# prd-014: Remotion compositor plugin

Status: backlog | Phase: 3 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-007 (compositor interface + brand kits). Governing ADRs: ADR-003. Corpus: composition.md.

## Goal

plugins/remotion: an optional compositor backend for users who accept Remotion's license: React compositions consuming the same IR/narration/brand inputs, word-karaoke captions via createTikTokStyleCaptions, calculateMetadata per preset, local SSR rendering.

## Non-goals

Remotion Lambda/cloud rendering, becoming the default (ADR-003), avatar work (prd-017).

## Acceptance criteria

Wave 1:
- AC1: Plugin implements the prd-007 interface; selecting backend=remotion renders the fixture project to output visually equivalent to the ffmpeg backend (same layers present, timings within one frame).
- AC2: License gate: plugin startup prints the Remotion license summary and requires an explicit acknowledged-license config flag; docs cover the 4-person cliff.

Wave 2:
- AC3: Brand kits map to inputProps with no plugin-specific kit fields; kit swap re-renders without code changes.
- AC4: PiP slot and reframe focus track honored identically to the ffmpeg backend (shared conformance test suite runs against both backends).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Plugin scaffold + interface conformance | AC1 | typescript-node-worker-bee |
| 2 | Composition: video + cursor + ripple layers | AC1 | react-worker-bee |
| 3 | Karaoke captions from words.json | AC1 | react-worker-bee |
| 4 | License gate + docs | AC2 | typescript-node-worker-bee |
| 5 | inputProps mapping from brand kits | AC3 | react-worker-bee |
| 6 | Backend conformance suite (shared with ffmpeg) | AC4 | quality-worker-bee |

## QA evidence

qa/ receives the cross-backend conformance report.
