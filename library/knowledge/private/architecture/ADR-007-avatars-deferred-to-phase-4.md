# ADR-007: PiP avatars are deferred to phase 4

Status: Accepted (2026-08-20)

## Context

Avatar generation is the dominant cost in comparable pipelines ($1 to $4 per minute at HeyGen; ~$1/min at Tavus) and adds a provider dependency with alpha-channel compositing complexity (VP9 WebM alpha; MP4 carries none). The core value (record, narrate, replay, regenerate) does not require a talking head.

## Decision

No avatar work before phase 4. The compositor interface reserves a PiP layer slot now (position, size, alpha-video input) so a future plugins/avatar backend (HeyGen or Tavus adapter, cached per script+voice+avatar combo) composites without rework. prd-017 holds the deferred scope.

## Consequences

Early renders stay near-zero marginal cost; one fewer API key to configure; the slot reservation costs a page of interface design now and saves a compositor refactor later.

## Alternatives Considered

HeyGen default now (quality breadth, immediate $1+/min COGS). Tavus default now (white-label posture that no longer matters post ADR-013).
