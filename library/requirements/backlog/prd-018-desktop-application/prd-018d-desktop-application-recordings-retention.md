# PRD-018d: Recordings list with raw-capture warning and delete controls

> **Waggle** — sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft
> **Priority:** P2
> **Effort:** S

## Phase Overview

### Goals

Give the desktop-hosted recordings page (the surface ADR-016 names) three capabilities: list every recorded session with its capture metadata, warn plainly that the raw capture master is unmasked sensitive material, and delete a recording's master and derived artifacts from disk. This is the in-app half of the retention boundary HANDOFF-3 flags; the formal retention policy document remains a release gate outside this PRD.

### Scope

- Recordings list in Studio fed by the existing project/session model on disk (ADR-015 filesystem layout), one row per captured session: date, duration, project, and presence of master/derived artifacts.
- Per-recording sensitivity notice plus a first-visit global notice: raw capture masters are unmasked screen recordings and stay local.
- Delete flow: explicit confirm → remove the session's capture master and derived artifacts (renders, extracted frames) from disk, canonically confined to the project directory.

### Out of scope

- Automatic or scheduled deletion (that is the retention policy, a release gate).
- Deleting whole projects or any file outside one session's artifacts.
- Cloud backup of masters (ADR-014 excludes the cloud from this entirely).

### Dependencies

- **Blocks:** module AC8 (the zero-terminal pass ends with a managed recording).
- **Blocked by:** sub-PRD a (shell), sub-PRD b (authenticated routes).
- **External:** none; reuses the confinement helpers proven in PRD-010.

## User Stories

### US-18d.1 — See what was recorded

**As a** user, **I want** my recordings listed with what exists on disk, **so that** I can manage capture material without a file explorer.

**Acceptance criteria:**
- AC-18d.1.1 Given projects with captured sessions, when the recordings page opens, then every session with a master present is listed with date, duration, and project name.
- AC-18d.1.2 Given a session whose master was already deleted, when the list renders, then the row shows its derived artifacts without offering playback of a master that does not exist.

### US-18d.2 — Understand the sensitivity

**As a** user, **I want** an unmissable statement that raw captures are unmasked, **so that** I treat masters accordingly when I share or copy files.

**Acceptance criteria:**
- AC-18d.2.1 Given the first visit to the recordings page, when it opens, then a global notice states that raw capture masters are unmasked screen recordings kept locally, acknowledged before dismissal.
- AC-18d.2.2 Given each row, when it renders, then a per-recording sensitivity marker is present whenever the master exists.

### US-18d.3 — Delete a recording's material

**As a** user, **I want** to delete a recording and everything derived from it, **so that** sensitive material leaves my machine on my schedule.

**Acceptance criteria:**
- AC-18d.3.1 Given a recording, when delete is confirmed, then the master and all derived artifacts for that session are removed from disk and the list updates.
- AC-18d.3.2 Given the confirm dialog, when cancel is chosen, then nothing is deleted.
- AC-18d.3.3 Given any candidate path for deletion, when it resolves outside the project directory (traversal or symlink escape), then deletion fails closed and logs the rejection — no partial deletes.
- AC-18d.3.4 Given a delete operation, then only that session's artifacts are touched; other sessions and project files (IR, credentials.json) are untouched.

## Technical Considerations

- **Confinement:** deletion path resolution reuses PRD-010's extractor-attested confinement approach (canonicalize, verify containment, reject symlinks escaping the project). Deletion is the most destructive file operation in the app; fail-closed is the only acceptable mode.
- **Derived-artifact enumeration:** derive from the session's manifest/run reports rather than globbing, so the delete set is exactly what the pipeline recorded producing.
- **No bulk API:** one session per request; the UI prevents multi-select delete in v1.
- **Notice persistence:** first-visit acknowledgment stored in app-data (not in any project file).

## Files Touched

### New files
- `apps/studio/src/routes` recordings page sections for list, notice, and delete confirm
- `apps/studio/src/lib/server/` session-artifact deletion endpoint (path resolution + confinement)
- Unit/e2e tests mirroring both

### Modified files
- `apps/studio/src/lib/` — session listing query extended with artifact presence (if not already exposed)

## Test Plan

- Unit: deletion set enumeration from a fixture session manifest (AC-18d.3.1/3.4); confinement matrix — traversal attempt, symlink escape, in-bounds ok (AC-18d.3.3), mirroring PRD-010's fail-closed tests.
- E2E (packaged app): record fixture session → list shows warning markers → delete → assert files gone and neighbors untouched; cancel path leaves everything (AC-18d.3.2).
- UI: first-visit notice acknowledgment flow (AC-18d.2.1).

## Risks and Open Questions

- **Risk:** deletion enumerated from manifests misses artifacts whose manifests were never written (crashed runs). **Mitigation:** fall back to the session's own directory subtree within the project, still confinement-checked; never fall back to project-wide globs.
- **Open question:** whether the delete confirm should require typing the session name for masters specifically. Recommend plain confirm in v1 (single-session scope, undo impossible but narrow); revisit with the retention-policy release gate.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [HANDOFF-3 — raw-capture retention boundary](../../../HANDOFF-3.md)
- [ADR-015 — filesystem project dirs](../../../knowledge/private/architecture/ADR-015-filesystem-project-dirs-no-database.md)
