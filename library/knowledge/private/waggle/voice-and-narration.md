# Voice and narration

Feeds prd-006 and prd-013. Governed by ADR-006.

## Adapter matrix (verified 2026-08-20)

| Provider | Cost | Timestamps | Notes |
|---|---|---|---|
| ElevenLabs Flash (default) | $0.05/1k chars | char-level native | with-timestamps endpoints; 40k char cap |
| ElevenLabs v3 (premium) | $0.10/1k chars | via text-to-dialogue/with-timestamps | 5k char cap |
| Deepgram Aura-2 (budget) | $0.030/1k chars | none | 2k char cap; needs alignment pass |
| xAI grok-voice (watch) | $0.015/1k chars | none | API weeks old; re-evaluate quarterly |

Receipts: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps , https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps , https://elevenlabs.io/pricing/api , https://deepgram.com/pricing , https://developers.deepgram.com/docs/text-to-speech , https://docs.x.ai/developers/model-capabilities/audio/voice

## Timestamp mechanics that will bite

- ElevenLabs returns alignment AND normalized_alignment; use normalized for audio timing, map back to original text for captions or numbers desync ("$13" reads "thirteen dollars").
- Char-to-word aggregation is Waggle's job (whitespace grouping); SRT uses comma decimals, VTT uses periods; provider units differ (float seconds vs ms): normalize in the adapter.
- Long scripts chunk-stitch with cumulative offsets against per-model caps (see table).
- Commercial license rides paid ElevenLabs plans; beta-model output is excluded; free-tier output requires attribution. Never render shareable audio on free tier (https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform).

## Uploaded audio (prd-013)

ElevenLabs forced alignment ($0.22/hr) aligns audio to the provided script: word plus char timestamps with per-word loss confidence (https://elevenlabs.io/docs/api-reference/forced-alignment). Fallbacks: AssemblyAI (direct SRT/VTT endpoints, $0.15/hr: https://www.assemblyai.com/docs/api-reference/transcripts/get-subtitles) and self-hosted WhisperX (BSD-2; weak on non-lexical tokens like prices: https://github.com/m-bain/whisperX). Replay pacing stretches step holds to match aligned segments.

## Script generation

LLM drafts per-step narration from: author step descriptions, element names, route names, target pace ~150 wpm, and per-step target durations derived from settle times. Author approves per segment in the studio. Deliverables per narration: audio, words.json, SRT, VTT, transcript.
