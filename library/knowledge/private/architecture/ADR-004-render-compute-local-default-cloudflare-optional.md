# ADR-004: Renders run locally by default; Cloudflare Containers is the optional cloud runner

Status: Accepted (2026-08-20). Scoped by ADR-014 (local-first); the original interrogation answer (Cloudflare Containers primary) survives as the cloud profile.

## Context

Cloudflare Browser Run cannot produce video (recordVideo unsupported; session recording is rrweb JSON). Cloudflare Containers (GA 2026-04, up to 4 vCPU / 12 GiB) can run Playwright + ffmpeg, orchestrated by Workflows, next to R2's zero-egress storage. But a personal-first local tool needs none of that to render.

## Decision

The render engine targets the local machine first: local Chromium via Playwright plus local ffmpeg, concurrency capped by WAGGLE_RENDER_CONCURRENCY. The same job code ships a runner profile for Cloudflare Containers (Workflows orchestrated, R2 artifacts) used only for scheduled or CI regeneration at scale (prd-012).

## Consequences

Zero cloud cost and zero accounts required for the core loop; CI regeneration on GitHub Actions runners works out of the box for small projects; the Cloudflare profile exists behind the same interface when volume demands it.

## Alternatives Considered

Cloudflare-first (as originally answered pre-pivot; wrong center of gravity for a personal tool). Remotion Lambda primary (second cloud, tied to the now-optional Remotion backend).
