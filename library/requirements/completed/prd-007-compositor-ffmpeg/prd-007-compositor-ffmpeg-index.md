# prd-007: Compositor (ffmpeg default backend)

Status: completed (merged via PRs #1 and #2) | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-002 (IR), prd-006 (audio + words.json). Governing ADRs: ADR-003 (ffmpeg default, interface for plugins), ADR-007 (reserved PiP slot), ADR-011 (reframe consumer). Corpus: composition.md.

## Goal

packages/compose: a compositor interface plus the ffmpeg backend that turns (source video, IR, narration, brand kit, preset) into a final MP4: synthetic spring-smoothed cursor, click ripples, karaoke captions, watermark/logo, intro/outro, narration audio. Phase 1 composites over the ORIGINAL recording; replay-sourced video swaps in transparently when prd-009 lands.

## Non-goals

Replay (prd-009), Remotion backend (prd-014), avatars (prd-017; only the PiP input slot is defined here).

## Acceptance criteria

Wave 1 (parallel):
- AC1: Compositor interface: composite(inputs) with declared capabilities; brand kit config schema in brand/ (palette, logo, watermark, caption style, cursor style, intro/outro) validated with zod.
- AC2: ASS generator: words.json to karaoke k-tag lines styled from the brand kit; burned via subtitles filter with fontsdir; golden-file tested.
- AC3: Cursor synthesizer: spring-damped path through the IR cursor trail rendered as an overlay track; click ripple sprite overlays with per-click enable windows.

Wave 2:
- AC4: Filter-graph builder assembles layers (video, cursor, ripples, captions, watermark, logo, intro/outro, reserved PiP slot) and encodes H.264 at preset dimensions/fps; graph text is deterministic for identical inputs.
- AC5: Auto-zoom: click-driven zoom segments via crop+scale expressions on an upscaled canvas (no zoompan), eased in/out.
- AC6: Narration audio muxed with configurable ducking of source audio.

Wave 3:
- AC7: `waggle render --preset 16x9` produces a watchable MP4 from the fixture project; render is idempotent (same inputs, same md5 of demuxed streams).
- AC8: A second brand kit re-render changes only branded elements (verified by frame sampling), touching no IR or narration files.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Interface + capability declaration | AC1 | typescript-node-worker-bee |
| 2 | Brand kit zod schema + fixture kits | AC1 | typescript-node-worker-bee |
| 3 | ASS style block from kit | AC2 | typescript-node-worker-bee |
| 4 | Karaoke k-tag line generator + golden tests | AC2 | typescript-node-worker-bee |
| 5 | Spring interpolation for cursor trail | AC3 | typescript-node-worker-bee |
| 6 | Cursor/ripple overlay track renderer | AC3 | typescript-node-worker-bee |
| 7 | Filter-graph builder core | AC4 | typescript-node-worker-bee |
| 8 | Watermark/logo/intro/outro/PiP-slot layers | AC4 | typescript-node-worker-bee |
| 9 | Crop+scale zoom expression generator | AC5 | typescript-node-worker-bee |
| 10 | Audio mux + ducking | AC6 | typescript-node-worker-bee |
| 11 | CLI wiring + idempotency test | AC7 | quality-worker-bee |
| 12 | Kit-swap diff test | AC8 | quality-worker-bee |

## QA evidence

qa/ receives sample renders (linked, not committed) and the golden-file inventory.
