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

## Amendment note (2026-08-21): the file list is illustrative, not exhaustive

Ruling on the open file-list question (ledger W4, restated in HANDOFF-4 decision 7): the directory enumeration in the Decision section is illustrative of the format at the time it was written, not a closed registry. Project state grows as PRDs land; none of it requires revisiting this ADR's actual decision (filesystem project dir as the datastore, no database, immutable IR versions). Known additional project state today: `recordings/` (raw capture masters, gitignored by default), `predraft.json` (ingest pre-draft), `heatmap.json`, `studio.json` (Studio session state), `patches/` (prd-011 IR patch drafts), and `baselines/` grows subdirectories per the prd-011 store layout. Any PRD that introduces new project-dir state records it in its own Files Touched section; a new ADR is required only if state would move out of the project directory or into a database, both of which this ADR forbids.
