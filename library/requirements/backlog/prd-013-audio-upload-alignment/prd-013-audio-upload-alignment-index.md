# prd-013: Uploaded-audio alignment

Status: backlog | Phase: 3 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-006 (narration formats), prd-009 (pacing consumer). Governing ADRs: ADR-006. Corpus: voice-and-narration.md.

## Goal

An author records their own narration; Waggle aligns it: forced alignment against the script (ElevenLabs FA default, WhisperX fallback), words.json + captions from the user's audio, segment-to-step mapping, and replay pacing stretched so the video breathes with the voice.

## Non-goals

Voice cloning flows, audio cleanup/mastering.

## Acceptance criteria

Wave 1:
- AC1: `waggle narrate --audio file.mp3` runs forced alignment against the approved script; word timings + per-word confidence stored; low-confidence regions flagged in the studio.
- AC2: Alignment adapter has a self-hosted fallback (WhisperX runbook + adapter) selected by env; both emit identical words.json shape.

Wave 2:
- AC3: Segment mapper assigns aligned sentences to steps (script order primary, fuzzy repair for ad-libs) with a studio review pass for flagged mappings.
- AC4: Pacing: replay step holds stretch to segment durations within configured min/max; compositor consumes the same timing manifest; end-to-end fixture proves lip-timing drift under 200 ms per step boundary.
- AC5: Captions and transcript regenerate from the user audio path identically to the TTS path (same writers, prd-006 AC4 reused).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | ElevenLabs FA client + confidence flags | AC1 | typescript-node-worker-bee |
| 2 | WhisperX adapter + runbook | AC2 | typescript-node-worker-bee |
| 3 | words.json shape conformance tests | AC2 | quality-worker-bee |
| 4 | Sentence-to-step mapper + fuzzy repair | AC3 | mind-worker-bee |
| 5 | Studio mapping review UI | AC3 | svelte-worker-bee |
| 6 | Pacing stretch in replay timing manifest | AC4 | typescript-node-worker-bee |
| 7 | Drift measurement e2e | AC4 | quality-worker-bee |

## QA evidence

qa/ receives the drift table on the fixture narration.
