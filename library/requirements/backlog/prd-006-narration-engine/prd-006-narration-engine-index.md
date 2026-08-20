# prd-006: Narration engine

Status: backlog | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-002 (IR segments), prd-005 (author descriptions exist). Governing ADRs: ADR-006 (voice adapter), ADR-008 (no secrets in prompts). Corpus: voice-and-narration.md.

## Goal

packages/narrate: script generation from step descriptions + IR context, TTS adapter (ElevenLabs Flash default, v3 premium, Deepgram budget, xAI stub), word timestamps, SRT/VTT/transcript emission into narration/.

## Non-goals

Uploaded-audio alignment (prd-013), pacing replay to audio (prd-009/013).

## Acceptance criteria

Wave 1 (parallel):
- AC1: Script generator drafts per-step segments (target ~150 wpm, duration hints from settle times); author-approved text is the only input to TTS.
- AC2: TTS adapter interface (synthesize, capabilities, cost estimate) with env-based provider selection per ADR-006 defaults.

Wave 2:
- AC3: ElevenLabs adapter: with-timestamps endpoints (dialogue endpoint when model is v3); normalized_alignment drives timing, original text drives captions; chunk-stitching with cumulative offsets under each model's char cap, seam-tested.
- AC4: Char-to-word aggregation produces words.json (ms precision); SRT (comma) and VTT (period) and transcript.txt emitted; caption cues capped at 42 chars x 2 lines.
- AC5: Deepgram Aura-2 adapter behind the same interface, marked timestamps:none (alignment pass deferred to prd-013's shared module); xAI adapter stubbed with capabilities declared.

Wave 3:
- AC6: `waggle narrate` wires it: fixture project produces audio + words.json + captions whose word timings monotonically increase and cover the full audio duration (tested).
- AC7: Guardrails: refuse to render shareable audio when the ElevenLabs plan is free tier or the model is flagged beta (env override with explicit warning).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Script prompt + segmenter + duration hints | AC1 | mind-worker-bee |
| 2 | Adapter interface + provider selection | AC2 | typescript-node-worker-bee |
| 3 | ElevenLabs client + with-timestamps parsing | AC3 | typescript-node-worker-bee |
| 4 | Chunk-stitch offset math + seam tests | AC3 | typescript-node-worker-bee |
| 5 | normalized-vs-original text mapping | AC3 | typescript-node-worker-bee |
| 6 | words.json aggregation | AC4 | typescript-node-worker-bee |
| 7 | SRT/VTT/transcript writers + cue capping | AC4 | typescript-node-worker-bee |
| 8 | Deepgram adapter + xAI stub | AC5 | typescript-node-worker-bee |
| 9 | CLI wiring + monotonic-timing test | AC6 | quality-worker-bee |
| 10 | Free-tier/beta guardrail | AC7 | security-worker-bee |

## QA evidence

qa/ receives a timing-accuracy spot check (5 words hand-verified against audio).
