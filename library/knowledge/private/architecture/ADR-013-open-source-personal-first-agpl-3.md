# ADR-013: Waggle is open source, personal-first, licensed AGPL-3.0

Status: Accepted (2026-08-20)

## Context

Mid-planning, the owner reframed the goal: the big reason for wanting the tool is personal use, and an open repo feeds his public teaching. The SaaS plan carried auth, billing, tenancy, white-label, and compliance surface that serves no personal use case. License choice determines whether the verified market gap remains exploitable later: MIT invites closed-SaaS wrappers; AGPL section 13 obliges network operators of modified versions to publish their source (the exact model Cap uses).

## Decision

Build Waggle as the owner's own tool, published openly at github.com/legioncodeinc/wagglereplay under AGPL-3.0, accepting issues and PRs. No revenue motion. Copyright retained by Legion Code Inc so dual-licensing or a hosted offering stays possible.

## Consequences

ADR-003, ADR-004, ADR-008, ADR-009, and ADR-012 were revised or scoped the same day to match; the PRD map dropped platform-shell and white-label-api in favor of cli-and-project-format and ci-regeneration. Any future contributor agreement question is deferred until outside contributions arrive.

## Alternatives Considered

Open core (structure now for optionality that may never be exercised). Stay closed SaaS (the original spec; wrong goal). Source-available BSL/FSL (community-hostile for a personal tool).
