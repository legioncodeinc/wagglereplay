# ADR-008: Demo credentials are env refs resolved at replay; secrets never enter project files

Status: Accepted (2026-08-20). Simplifies the interrogation answer (per-org KEK envelope via Doppler), which assumed the multi-tenant SaaS scrapped by ADR-013.

## Context

Walkthrough projects are git-committable by design (ADR-015), so any secret written into IR, assets, logs, or narration prompts would eventually be committed. Replays of authenticated apps still need credentials, sometimes with TOTP.

## Decision

A walkthrough's credential set stores only references: {label, username_env, secret_env, totp_seed_env}. Values resolve from the environment at replay time (locally via .env or Doppler run) inside packages/replay only. Capture masks credential-marked inputs as placeholder events; QA screenshots of credential steps get redaction boxes; prompts never receive secret values. TOTP codes generate in-process from the seed env ref.

## Consequences

Nothing secret can leak through a committed project or a shared render; rotation is an env change plus regen. Multi-machine use means each machine needs the env populated (documented in .env.example). If a hosted service ever exists, the shelved envelope-encryption design in the corpus becomes relevant again.

## Alternatives Considered

Per-org KEK envelope in a database (SaaS-shaped, no tenants exist). Encrypted secrets inside project files (invites offline attacks on public repos and git history mistakes).
