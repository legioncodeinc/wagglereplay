# prd-017: Avatar PiP plugin

Status: backlog | Phase: 4 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-007 (reserved PiP slot), prd-014 optional (Remotion parity). Governing ADRs: ADR-007 (deferral + slot), ADR-003. Corpus: composition.md.

## Goal

plugins/avatar: optional talking-head PiP layer: provider adapter (HeyGen default, Tavus second), audio-driven generation from the walkthrough narration, alpha WebM handling, aggressive caching per (script hash, voice, avatar), composited into the reserved slot by either backend.

## Non-goals

Realtime avatars, avatar cloning UX, making avatars default (they stay opt-in with cost printed).

## Acceptance criteria

Wave 1:
- AC1: Provider adapter: submit narration audio, poll/webhook completion, download alpha WebM (or chroma fallback), verify alpha channel survives probe.
- AC2: Cache: content-addressed by (script hash, voice, avatar, provider); regen and kit swaps hit cache; cache stats in run report.

Wave 2:
- AC3: Compositing: alpha WebM into the PiP slot on the ffmpeg backend (forced libvpx-vp9 decode) and Remotion backend if installed; position/size/margin from brand kit.
- AC4: Cost guard: per-run avatar cost estimate printed before generation with a confirm flag for non-interactive runs.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | HeyGen adapter (audio-driven, webm alpha) | AC1 | typescript-node-worker-bee |
| 2 | Tavus adapter | AC1 | typescript-node-worker-bee |
| 3 | Alpha probe + chroma-key fallback | AC1 | typescript-node-worker-bee |
| 4 | Content-addressed cache | AC2 | typescript-node-worker-bee |
| 5 | ffmpeg PiP compositing path | AC3 | typescript-node-worker-bee |
| 6 | Remotion PiP parity + conformance test | AC3 | react-worker-bee |
| 7 | Cost estimator + confirm flag | AC4 | typescript-node-worker-bee |

## QA evidence

qa/ receives a cached-vs-fresh render timing comparison and an alpha-integrity check.
