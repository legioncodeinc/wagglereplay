# prd-013: Uploaded-audio alignment

Status: backlog | Phase: 3 | Created: 2026-08-20 | Amended: 2026-08-21 (Wave 0: ADR-019 conflict rewrite, confidence sidecar ruling, WhisperX runner scope)

## 0. Dependencies

Blocking PRDs: prd-006 (narration formats), prd-009 (pacing consumer). Governing ADRs: ADR-006, ADR-017 (provider keys: the ElevenLabs FA key is a provider key, GUI entry via the encrypted store, env refs on the CLI/CI path), ADR-019 (CLI freeze: this PRD originally specified a `narrate --audio` flag, which predates ADR-019 and violates it; the 2026-08-21 ruling rewrites the trigger as Studio UI plus an env-var input, the shipped `WAGGLE_ALLOW_UNLICENSED_AUDIO` guardrail pattern). Corpus: voice-and-narration.md.

## Goal

An author records their own narration; Waggle aligns it: forced alignment against the script (ElevenLabs FA default, WhisperX fallback), words.json + captions from the user's audio, segment-to-step mapping, and replay pacing stretched so the video breathes with the voice.

## Non-goals

Voice cloning flows, audio cleanup/mastering.

## Alignment trigger and confidence home (normative)

Uploaded-audio alignment is triggered from the Studio narrate panel (upload widget, ADR-019's GUI-primary path) or, for scripted non-interactive runs, by setting `WAGGLE_NARRATE_AUDIO_PATH` to the audio file's path; no new CLI command or flag is added. Per-word confidence does not go into the shared words.json (strictObject, verified consumers, would force a version bump): it lives in a sidecar, `narration/alignment-confidence.json`, keyed by stepIndex and word index, which the Studio low-confidence flags read.

## Acceptance criteria

Wave 1:
- AC1: Forced alignment runs against the approved script from the Studio narrate panel or the `WAGGLE_NARRATE_AUDIO_PATH` env input (no CLI flag; ADR-019); word timings land in words.json; per-word confidence lands in the sidecar; low-confidence regions flagged in the studio.
- AC2: Alignment adapter has a self-hosted fallback (WhisperX) selected by env; both emit identical words.json shape. The WhisperX runner is a local Python subprocess profile scoped ADR-004-style: pinned torch/ctranslate2/faster-whisper versions recorded in the runbook, CPU-first with optional CUDA, bounded by an explicit memory cap and a wall-clock timeout, no cloud call anywhere in the fallback path; failure of the subprocess is a structured error, never a render crash.

Wave 2:
- AC3: Segment mapper assigns aligned sentences to steps (script order primary, fuzzy repair for ad-libs) with a studio review pass for flagged mappings.
- AC4: Pacing: replay step holds stretch to segment durations within configured min/max; compositor consumes the same timing manifest; end-to-end fixture proves lip-timing drift under 200 ms per step boundary.
- AC5: Captions and transcript regenerate from the user audio path identically to the TTS path (same writers, prd-006 AC4 reused).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | ElevenLabs FA client + confidence sidecar | AC1 | typescript-node-worker-bee |
| 2 | WhisperX adapter + pinned runner runbook | AC2 | typescript-node-worker-bee |
| 3 | words.json shape conformance tests | AC2 | quality-worker-bee |
| 4 | Sentence-to-step mapper + fuzzy repair | AC3 | mind-worker-bee |
| 5 | Studio mapping review UI | AC3 | svelte-worker-bee |
| 6 | Pacing stretch in replay timing manifest | AC4 | typescript-node-worker-bee |
| 7 | Drift measurement e2e | AC4 | quality-worker-bee |

## QA evidence

qa/ receives the drift table on the fixture narration.
