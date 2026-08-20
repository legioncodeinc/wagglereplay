# ADR-014: Runtime is local-first; cloud is an optional runner profile

Status: Accepted (2026-08-20)

## Context

For a personal tool, every required cloud dependency is a tax: accounts, keys, bills, and failure modes. The full loop (capture, storyboard, narrate, replay, composite) runs on one machine with Chrome, Node, Playwright's Chromium, and ffmpeg. Cloud only genuinely helps for scheduled regeneration at scale and CI parallelism.

## Decision

Everything runs locally by default: the extension talks to a local studio server on localhost; replay and composition run on the user's machine; projects live on disk (ADR-015). A runner interface abstracts execution so prd-012 can add GitHub Actions and Cloudflare Containers profiles for CI regeneration without touching core logic.

## Consequences

Zero required cloud spend; offline-capable except TTS/LLM calls; the 24-hour wedge build gets materially smaller. Cloud-profile work is isolated to one package and one PRD.

## Alternatives Considered

Cloud-first as originally spec'd (right for SaaS, wrong post ADR-013). CI-first with no interactive studio (most radical cut, loses the authoring experience that makes narration good).
