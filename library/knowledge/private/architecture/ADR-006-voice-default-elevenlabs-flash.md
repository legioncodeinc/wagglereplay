# ADR-006: ElevenLabs Flash is the default voice; v3 premium; Deepgram budget; xAI watch list

Status: Accepted (2026-08-20)

## Context

Narration must carry word timestamps for captions and pacing. ElevenLabs is the only candidate returning native TTS alignment (character-level via the with-timestamps endpoints; v3 via the dialogue endpoint) and also ships a true forced-alignment API for user-uploaded audio at $0.22/hr. Deepgram Aura-2 is 40 to 70 percent cheaper ($0.030/1k chars) but returns no timestamps and caps requests at 2k chars. xAI's voice API ($0.015/1k) is weeks old with no timestamp story.

## Decision

packages/narrate defines a TTS adapter. Default: ElevenLabs Flash ($0.05/1k chars). Premium toggle: eleven_v3 ($0.10/1k, dialogue endpoint for timestamps). Budget adapter: Deepgram Aura-2 plus an alignment pass (ElevenLabs forced alignment or WhisperX). xAI slots behind the same interface when it matures. Timing uses normalized_alignment; captions map back to original text. Chunk stitching respects per-model char caps (v3 5k, MLv2 10k, Flash 40k, Aura-2 2k) with cumulative offsets.

## Consequences

One vendor covers TTS, timestamps, cloning, and forced alignment; commercial license rides paid plans (never render customer-facing audio on free tier or beta models). Costs land near $0.05 per narrated minute default.

## Alternatives Considered

v3 everywhere (double cost, tighter chunking). Deepgram-first (cheapest COGS, mandatory extra alignment step, flatter voices).
