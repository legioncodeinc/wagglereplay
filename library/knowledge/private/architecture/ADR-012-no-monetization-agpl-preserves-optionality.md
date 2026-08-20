# ADR-012: No monetization; AGPL plus retained copyright preserves future options

Status: Accepted (2026-08-20). Supersedes the interrogation's provisional billing answer (seats plus metered render minutes), which is shelved, not deleted.

## Context

The project's reason for existing is personal use (ADR-013). The market research (corpus: market-landscape) verified real gaps and $2 to $4 per finished minute pricing norms, so the option value of a future commercial motion is nonzero.

## Decision

No billing, no plans, no meters anywhere in the codebase. The shelved model (per-creator seats with included render minutes and overage) lives in the corpus economics archive as the if-ever plan. Copyright stays with Legion Code Inc; contributions are accepted under AGPL-3.0 inbound=outbound, keeping dual-licensing or a hosted cloud possible later without rebuilding.

## Consequences

Roughly 40 percent of the original SaaS build surface (auth, tenancy, billing, metering, white-label plumbing) disappears from the PRD map. A future commercial pivot requires a CLA decision at that time if relicensing beyond AGPL is desired.

## Alternatives Considered

Seats plus metered minutes now (the pre-pivot answer; nothing to sell a customer who is yourself). Credit packs (market norm, same objection).
