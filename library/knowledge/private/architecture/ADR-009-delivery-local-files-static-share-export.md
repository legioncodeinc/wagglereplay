# ADR-009: Delivery is local render files plus a static share-page export; R2 optional

Status: Accepted (2026-08-20). Adapts the interrogation answer (R2 + signed URLs + own player) to the local-first pivot.

## Context

Renders are MP4 files in the project directory. Sharing needs nothing more than a static page: poster, player, captions track, download links. Hosted infrastructure would reintroduce exactly the surface ADR-013 removed.

## Decision

`waggle export` produces renders/ plus an optional static share bundle (self-contained HTML page per walkthrough with the MP4, VTT captions, and transcript) suitable for any static host or a GitHub Pages branch. An optional uploader pushes render artifacts to the user's own R2 bucket (zero egress) when configured.

## Consequences

Zero-cost sharing on the user's own hosting; no accounts, no signed URLs to mint. Adaptive bitrate is out of scope until someone needs long-form playback, at which point Cloudflare Stream is the documented add-on.

## Alternatives Considered

Stream ABR day one (per-minute storage fees for a personal tool). Hosted share pages (a service to run forever).
