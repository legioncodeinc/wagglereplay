# ADR-011: Non-responsive apps get vertical and square renders via IR-focus smart reframe

Status: Accepted (2026-08-20)

## Context

A true 9:16 or 1:1 render only exists when the target app reflows at that viewport. Many B2B apps do not. Competitors ship dumb center crops. The IR already knows where attention belongs at every moment: the click coordinates and element rects.

## Decision

When a preset's replay viewport is unusable (no reflow, horizontal scroll, or user override), the render engine replays at the 16:9 master viewport and the compositor drives an animated crop window whose focus point follows IR click coordinates and element centers, eased between steps. Deterministic, no model in the loop. Presets are marked in output metadata as native or reframed.

## Consequences

Every walkthrough gets social cuts regardless of app responsiveness; reframed output honestly labeled; ships inside prd-009/prd-007 with zero added per-render cost.

## Alternatives Considered

Vision-assisted framing (better shots on click-less narration segments; cost and latency per render; revisit in phase 4). Responsive-only honesty (gives up social cuts for most targets).
