# prd-017: Avatar PiP plugin

Status: backlog | Phase: 4 | Created: 2026-08-20 | Amended: 2026-08-21 (Wave 0: ADR-019 conflict rewrite)

## 0. Dependencies

Blocking PRDs: prd-007 (reserved PiP slot), prd-014 optional (Remotion parity). Governing ADRs: ADR-007 (deferral + slot), ADR-003, ADR-017 (provider keys: HeyGen and Tavus keys are provider keys, GUI entry via the encrypted store, env refs on the CLI/CI path), ADR-019 (CLI freeze: AC4 originally specified a confirm flag, which predates ADR-019 and violates it; the 2026-08-21 ruling rewrites the guard as an env var, the shipped `WAGGLE_ALLOW_UNLICENSED_AUDIO` pattern). Corpus: composition.md.

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
- AC4: Cost guard: per-run avatar cost estimate printed before generation; non-interactive runs require the `WAGGLE_ALLOW_AVATAR_SPEND=1` env-var guardrail (the shipped `WAGGLE_ALLOW_UNLICENSED_AUDIO` pattern, loud in output; no CLI flag, per ADR-019).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | HeyGen adapter (audio-driven, webm alpha) | AC1 | typescript-node-worker-bee |
| 2 | Tavus adapter | AC1 | typescript-node-worker-bee |
| 3 | Alpha probe + chroma-key fallback | AC1 | typescript-node-worker-bee |
| 4 | Content-addressed cache | AC2 | typescript-node-worker-bee |
| 5 | ffmpeg PiP compositing path | AC3 | typescript-node-worker-bee |
| 6 | Remotion PiP parity + conformance test | AC3 | react-worker-bee |
| 7 | Cost estimator + env spend guard | AC4 | typescript-node-worker-bee |

## QA evidence

qa/ receives a cached-vs-fresh render timing comparison and an alpha-integrity check.
