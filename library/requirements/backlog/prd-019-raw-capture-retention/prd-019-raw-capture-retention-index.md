# prd-019: Raw-capture retention policy

Status: backlog | Phase: 2 (release track) | Created: 2026-08-21 (HANDOFF-4 Wave 0 item 10: assign the previously unowned retention-policy boundary a durable home)

## 0. Dependencies

Blocking PRDs: none (ships alongside the release checklist; prd-018d's in-app controls exist independently). Governing ADRs: ADR-014 (local-first: masters never leave the machine by default), ADR-015 (project-dir layout; `recordings/` is state). Corpus: waggle-master-spec.md, HANDOFF-3's raw-capture boundary.

## Goal

One durable, user-facing policy document plus its enforcement points for how long raw capture masters live on disk and what happens before any of them travel anywhere. This is a disk-and-distribution concern only: `waggle init` already gitignores `recordings/`, so git is not a leak path; the risks are manual copying, backup-tool ingestion, and external distribution of renders or bundles.

## The user-facing sentence (normative, must appear verbatim in the policy and the in-app notice)

"A raw capture master is a video of everything on screen and can contain unmarked credentials and visible customer data; deleting it is irreversible because the Walkthrough IR cannot regenerate it."

## Acceptance criteria

- AC1: `docs/retention-policy.md` (or the release-checklist section it becomes) states: masters are local-only by default; the IR cannot reconstruct a deleted master; the recommended retention posture (delete masters once the IR version is verified and renders approved, keep until then); how to delete (prd-018d's control or manual filesystem deletion); and the verbatim sentence above.
- AC2: The policy names the leak paths it covers (manual copy, backup tools syncing the project dir, screen-sharing while a recording session is active) and the one it structurally prevents (git: `recordings/` gitignored by `waggle init`; a test asserts the scaffolded `.gitignore` contains it).
- AC3: The release checklist (HANDOFF-4 section 9's successor) carries a gate item: retention policy reviewed and published before the first external distribution of any artifact type.
- AC4: prd-018d's first-visit in-app notice references the policy document.

## Non-goals

- Automatic or scheduled deletion (remains out of scope by prd-018d's non-goal; if ever wanted, it amends this PRD, not 018d).
- Any cloud purge flow (ADR-014: masters never upload anywhere).

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | Author the policy document with the verbatim sentence | AC1, AC2 | readme-writing-worker-bee |
| 2 | Assert `recordings/` in scaffolded .gitignore (test) | AC2 | typescript-node-worker-bee |
| 3 | Wire the release-checklist gate item and the in-app notice reference | AC3, AC4 | readme-writing-worker-bee |

## QA evidence

qa/ receives the policy document link plus the gitignore test output.

## Rationale for ownership placement

HANDOFF-4 Wave 0 item 10 offered "a small PRD or release-checklist item". A PRD wins: the boundary outlives any single checklist revision, it carries testable criteria (the gitignore assertion), and prd-018d's notice needs a stable artifact to reference at build time.
