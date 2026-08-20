# ADR-015: A Waggle project is a filesystem directory; there is no database

Status: Accepted (2026-08-20)

## Context

Local-first (ADR-014) plus CI regeneration (prd-012) both want walkthroughs to live where code lives: in git. A database (even SQLite) splits the source of truth and makes diffs, reviews, and CI checkouts awkward.

## Decision

A Waggle project directory is the datastore: walkthrough.json (IR, versioned), steps/ assets (frames), narration/ (script, audio, word timings, captions), brand/ (kit config files), baselines/ (odiff sets), renders/ (gitignored output). The studio app and CLI are editors and processors over these files. IR versions are immutable files; the project manifest points at the current version.

## Consequences

Demo-as-code: walkthroughs diff in PRs, regenerate in CI, and travel with the repo they document. Heavy media stays gitignored by default with documented opt-ins (or git LFS). Concurrent editing is out of scope (single-user tool); any future hosted layer would add its own store above this format, not replace it.

## Alternatives Considered

SQLite via Drizzle (better queries, worse git story). Postgres (SaaS-shaped, removed by ADR-013).
