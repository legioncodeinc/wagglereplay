# ADR-002: Replay video capture is CDP screencast piped to ffmpeg

Status: Accepted (2026-08-20)

## Context

Playwright's built-in recordVideo is debug-grade: hardcoded 25 fps VP8 built from JPEG screencast frames, single-threaded encoder, no quality API (playwright-core videoRecorder.ts). Fully deterministic frame stepping (Emulation.setVirtualTimePolicy plus HeadlessExperimental.beginFrame, or a JS clock shim per the Replit render engine and WebVideoCreator) yields perfect pacing but rides experimental CDP surface.

## Decision

MVP replay capture uses Page.startScreencast (JPEG, quality ~90, target-size frames, acked per frame) piped to ffmpeg encoding H.264 at the preset fps. Cursor, ripples, zooms, and captions are composited later from the IR, not captured, so screencast quality is sufficient. Virtual-time deterministic capture is a planned upgrade inside prd-009, not a blocker.

## Consequences

Good-enough pixels immediately; no dependency on experimental beginFrame; capture code stays small. Frame pacing is damage-driven, so ffmpeg fills gaps to constant fps. Upgrade path documented in the replay corpus doc.

## Alternatives Considered

Virtual-time first (higher fidelity, higher build risk up front). Playwright recordVideo throwaway (fastest hour one, guaranteed rework, quality ceiling too low even for MVP).
