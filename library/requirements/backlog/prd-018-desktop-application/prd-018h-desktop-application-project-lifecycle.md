# PRD-018h: Zero-terminal project lifecycle (create, select, switch)

> **Waggle** - sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft (authored 2026-08-21, HANDOFF-4 Wave 0: this sub-PRD owns the AC8 prerequisite the original seven left unowned)
> **Priority:** P0 (module AC8 prerequisite)
> **Effort:** M

## Phase Overview

### Goals

Remove the terminal-shaped boot contract from the desktop path: today Studio resolves its project directory once per process from `WAGGLE_PROJECT_DIR` (`apps/studio/src/lib/server/project-context.ts:40-57`), which `waggle studio --project` sets at launch. A desktop user never runs that command, so the app itself must own project creation, selection, and switching: a first-run flow that creates or opens a project, a project switcher in the UI, and a main-process-supplied, switchable project context that replaces the env-var-at-boot contract on the desktop path without changing the CLI path.

### Scope

- First-run experience: if no default project location is configured, the app offers "create a walkthrough project" (name plus parent directory picker via native dialog) or "open an existing project directory".
- Default projects location in app-data (for example `~/Waggle Projects` offered as the default parent); new projects are created with the existing `@waggle/ir` scaffold layout (`waggle init`'s writer, reused as a library call - no CLI spawn, no new CLI surface per ADR-019).
- Project switcher in Studio: list known projects (recent list in app-data), switch at runtime, create new, open existing.
- Server-side project context becomes an injectable, switchable provider: a request-scoped resolution (selected project id supplied by the authenticated client and validated against the known-projects registry) instead of the process-cached env lookup. The desktop main seeds the registry; the CLI path keeps exactly its current behavior (`WAGGLE_PROJECT_DIR` resolved once at boot - asserted by a regression test).
- Switching closes open file handles belonging to the previous project before the next request runs (single-user tool; a switch is a barrier, not a race - documented and asserted).

### Out of scope

- Multi-project concurrent sessions (one active project at a time; ADR-015's single-user scope).
- Project deletion (dangerous, separate review; recordings deletion is sub-PRD d).
- Any CLI command for listing or switching projects (ADR-019).

### Dependencies

- **Blocks:** module AC8 (clean-machine pass starts with creating a project in-app).
- **Blocked by:** sub-PRD a (shell, native dialogs, main process), sub-PRD b (the switcher's client-to-server project selection must ride authenticated routes).
- **External:** none.

## User Stories

### US-18h.1 - First run creates a project with zero terminal

**As a** new desktop user, **I want** the app to offer to create my first project, **so that** I never learn what `waggle init` is.

**Acceptance criteria:**
- AC-18h.1.1 Given a first run with no configured project, when the app opens, then it offers create-or-open; create asks only for a name and parent directory (native dialog, default parent pre-filled) and scaffolds a valid project (manifest present, ADR-015 layout, `recordings/` gitignored).
- AC-18h.1.2 Given project creation, when it completes, then Studio opens the new project's storyboard with no terminal spawned and no env var set by the user.
- AC-18h.1.3 Given "open existing", when a directory with a valid `waggle.json` is chosen, then it is registered and opened; an invalid directory is rejected with a plain-language error naming what is missing.

### US-18h.2 - Switch projects without restarting

**As a** multi-project user, **I want** to switch projects from the UI, **so that** the app is one long-running tool, not one process per project.

**Acceptance criteria:**
- AC-18h.2.1 Given two registered projects, when the switcher selects the other, then subsequent reads and writes (storyboard, recordings, renders) resolve against the new project directory, asserted end to end by an e2e that writes a step in project A, switches, and reads project B's storyboard.
- AC-18h.2.2 Given a switch, when a recording upload is in flight for the previous project, then the switch is refused with a clear "recording in progress" state (no interleaving of a capture into the wrong project).
- AC-18h.2.3 Given the recent-projects list, when the same directory is opened twice, then it appears once and its recency updates.

### US-18h.3 - The CLI path is byte-for-byte unchanged

**As a** CI operator, **I want** `waggle studio` and every other command to behave exactly as before, **so that** sub-PRD h regresses nothing on the frozen surface.

**Acceptance criteria:**
- AC-18h.3.1 Given `waggle studio --project <dir>` on the CLI, when the server boots, then the project resolves from `WAGGLE_PROJECT_DIR` exactly as today; the existing studio smoke e2e passes unmodified.
- AC-18h.3.2 Given the desktop registry exists in app-data, when the CLI path runs, then it ignores it entirely.

## Technical Considerations

- **Injection over rewrite:** `project-context.ts`'s cached lookup becomes one implementation of a `ProjectContext` interface; the desktop supplies a switchable registry-backed one. Both paths flow through the same validation (manifest exists, confinement checks) so no new trust boundary appears.
- **Scaffold reuse:** `waggle init`'s project writer is already a library function in `packages/ir`; the main process calls it directly. The CLI command remains a thin wrapper - no duplication.
- **Switch barrier:** an app-level mutex around project switch plus the in-flight recording guard (AC-18h.2.2); document that renders in progress also block switching (their file writes are project-scoped).
- **App-data registry shape:** `{ recent: [{ id, name, path, lastOpenedAt }], defaultParent }` in the ADR-017 namespace directory, outside every project (never project state).

## Files Touched

### New files
- `apps/desktop/src/main/project-registry.ts` - recent projects, default parent, native open/save dialogs
- `apps/studio/src/lib/server/project-context.ts` - extended to the `ProjectContext` interface plus the desktop switchable implementation
- `apps/studio/src/lib/server/` project selection route (authenticated; sets the active project for the session)
- Studio UI: first-run dialog, project switcher menu, "new project" and "open project" flows
- Tests mirroring each, plus the A/B switch e2e (AC-18h.2.1)

### Modified files
- `apps/desktop/src/main/index.ts` - first-run detection, registry seeding
- Sub-PRD b's auth middleware - the selection route rides the token

## Test Plan

- Unit: registry add/dedupe/recency (AC-18h.2.3); scaffold call produces a valid manifest (AC-18h.1.1); invalid-dir rejection copy (AC-18h.1.3).
- Unit: `ProjectContext` CLI implementation is unchanged behavior (AC-18h.3.1) - golden test over the existing error strings.
- E2E (packaged app): first-run create flow; A/B switch with writes; switch refusal during upload (AC-18h.2.2).
- Regression: existing studio smoke e2e and the full CLI suite pass unmodified.

## Risks and Open Questions

- **Risk:** request-scoped project resolution touches every server route's data access. **Mitigation:** one `ProjectContext` choke point, not per-route plumbing; the e2e matrix covers both paths.
- **Risk:** path-confusion bugs writing project A state into project B. **Mitigation:** the switch barrier plus confinement assertions reused from PRD-010 (canonical paths checked per write).
- **Open question:** whether the default parent should be `~/Waggle Projects` or the OS documents dir. Decide in implementation review; store whichever is chosen in the registry, not in code.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-015 - filesystem project dirs](../../../knowledge/private/architecture/ADR-015-filesystem-project-dirs-no-database.md)
- [ADR-019 - the CLI boot contract that must not change](../../../knowledge/private/architecture/ADR-019-cli-frozen-gui-primary.md)
