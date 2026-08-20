# ADR-005: Visual regression baselines are built in-house on odiff

Status: Accepted (2026-08-20)

## Context

Regeneration only pays off if a re-render that silently looks wrong gets caught. Argos CI's model (per-step screenshots diffed against a baseline build chosen from git history, odiff engine) is the right shape, but a hosted per-screenshot fee (Argos Pro from $100/mo) sits poorly in a free local tool.

## Decision

Per-step screenshots per preset are stored inside the Waggle project directory; odiff compares against the accepted baseline set; diffs over threshold annotate the step in the studio and fail `waggle regen --check`. Baselines version alongside the IR in git.

## Consequences

No vendor, no fee, baselines travel with the repo. Waggle owns a minimal review surface (accept/reject per step) instead of Argos's mature UI. Argos remains documented as an integration option for teams already on it.

## Alternatives Considered

Argos Pro early (mature review UI, recurring cost, wrong fit for OSS local-first). Defer to phase 3 (leaves regeneration unguarded, undermining the core promise).
