# PRD-018i: GUI narrate/render/regen triggers with live progress

> **Waggle** - sub-feature PRD of [PRD-018](./prd-018-desktop-application-index.md)
>
> **Status:** Draft (authored 2026-08-21, HANDOFF-4 Wave 0: this sub-PRD owns the AC8 prerequisite the original seven left unowned)
> **Priority:** P0 (module AC8 prerequisite)
> **Effort:** M

## Phase Overview

### Goals

Make narration, rendering, and regeneration in-app actions so the zero-terminal promise survives the last mile: today those runs are CLI commands (`waggle narrate`, `waggle render`, `waggle regen`), so a desktop user's flow dead-ends at a terminal. This sub-PRD adds authenticated Studio routes that invoke `@waggle/narrate`, `@waggle/compose`, and `@waggle/replay`'s `runRegen` as library calls in the server process, with live progress and structured failure surfaced in the UI. This adds Studio surface, not CLI surface; ADR-019 is untouched (its consequence text names exactly this pattern: new capability ships through the GUI).

### Scope

- Three authenticated Studio actions: narrate (draft script is already Studio-editable per prd-005 AC4; this adds the synthesize run), render (preset multi-select from the same registry the CLI uses), regen (all configured presets, or a selected subset).
- Job orchestration in the server: one job at a time per kind (the pipelines are already concurrency-disciplined via `WAGGLE_RENDER_CONCURRENCY`), cancellable, with the existing structured outcome types (narrate approval gating, render input errors, regen step failures) mapped to UI states, never to stack traces.
- Live progress over the existing `api/watch` SSE surface (the natural home; it already streams session-watch events to the Studio UI): stage transitions (script, synthesize, replay per preset, compose per preset), per-step replay events from the run, and render completion with artifact paths.
- Run provenance: the same run reports the CLI writes (`renders/regen/latest-run.json` and render sidecars) are the source of truth; the UI reads them, it does not invent a second report format.
- Provider keys: narration runs inside the desktop resolve the ElevenLabs key through sub-PRD c's `KeySource` seam, exactly as the adapter contract specifies.

### Out of scope

- Any new CLI command or flag (ADR-019).
- prd-011's verdict review surface (that PRD builds on these routes when it lands; it inherits authenticated routes, per the sequencing note in the index).
- Scheduling, queuing of multiple projects, or batch operations across projects.
- Cloud runner profiles (ADR-004's optional profile is out of the desktop app).

### Dependencies

- **Blocks:** module AC8 (the clean-machine pass ends with a GUI-triggered narrate and render).
- **Blocked by:** sub-PRD a (shell), sub-PRD b (authenticated routes), sub-PRD h (the active project the jobs run against), sub-PRD c (KeySource for narration).
- **External:** none (all invoked packages exist on `main`).

## User Stories

### US-18i.1 - Narrate without a terminal

**As a** desktop author, **I want** an "Generate voice" action on the storyboard, **so that** approving the script and hearing it never opens a terminal.

**Acceptance criteria:**
- AC-18i.1.1 Given an approved script, when the narrate action runs, then synthesis proceeds through `@waggle/narrate` in-process and progress (per-segment synthesis, stitching) streams to the UI.
- AC-18i.1.2 Given an unapproved script, when narrate is attempted, then the UI shows the same approval-gating state the CLI's `NARRATION_NOT_APPROVED` exit encodes; nothing is sent to the provider.
- AC-18i.1.3 Given narration completes, then `narration/audio.mp3`, `words.json`, and caption files exist in the project and are surfaced in the UI.

### US-18i.2 - Render from the UI

**As a** desktop author, **I want** to pick presets and render, **so that** outputs appear without commands.

**Acceptance criteria:**
- AC-18i.2.1 Given a narrated project, when render is triggered with selected presets, then each preset composites through `@waggle/compose` with progress per preset and the finished MP4 paths shown.
- AC-18i.2.2 Given a render input problem (missing source recording, narration disagreement), when the run fails, then the UI shows the structured error the CLI's `RENDER_INPUT_MISSING` path produces; no stack trace is displayed.

### US-18i.3 - Regenerate when the app changed

**As a** desktop author, **I want** a "Regenerate" action, **so that** the moat (replay from IR) is a button, not a command.

**Acceptance criteria:**
- AC-18i.3.1 Given a project whose target app changed, when regen runs, then the UI streams the replay per preset (per-step settle and failure events from the run report contract) and then compose progress.
- AC-18i.3.2 Given a step failure, when the run reports it, then the UI shows the structured `StepFailureDetail` (selectors tried, drift notes) - the same data the CLI prints.
- AC-18i.3.3 Given any job in progress, when cancel is clicked, then the run stops at the next safe boundary, partial artifacts are left in a consistent state, and the job can be re-run.

### US-18i.4 - The CLI path is unchanged

**As a** CI operator, **I want** `waggle narrate/render/regen` to behave exactly as before, **so that** no GUI work regresses the frozen surface.

**Acceptance criteria:**
- AC-18i.4.1 Given the CLI commands, when run, then behavior, exit codes, and artifacts are byte-identical to today (existing suites pass unmodified).

## Technical Considerations

- **Library calls, not child processes:** the routes import `runNarrate`/`renderProject`/`runRegen` the way the CLI commands do; no `spawn('waggle')` (that would re-enter the CLI surface and double the runtime).
- **Progress channel owner:** this sub-PRD owns extending `api/watch` SSE with job events; prd-018f's auto-processing progress rides the same channel (the index's f amendment names this seam). One event schema, one owner, two producers.
- **Cancellation:** the replay package's job structure supports bounded cancellation at preset and step boundaries; compose cancels between filter-graph runs, never mid-encode (documented limitation, shown in UI copy).
- **Failure mapping:** a single table from each package's structured error type to UI state; unknown errors are shown as "unexpected failure, see run report" with the report path, never raw stack.
- **Concurrency:** GUI-triggered jobs respect `WAGGLE_RENDER_CONCURRENCY` exactly like the CLI; the desktop does not invent its own limit.

## Files Touched

### New files
- `apps/studio/src/lib/server/jobs/` - job runner (start/cancel/status), one module per kind (narrate, render, regen)
- `apps/studio/src/routes/api/watch` extension - job event stream (schema versioned)
- Studio UI: action buttons, progress panel, structured-failure display, cancel
- Tests mirroring each; one e2e per kind against the packaged app with mocked provider transport (no key needed) plus the fixture app for regen

### Modified files
- None in `packages/cli`, `packages/narrate`, `packages/compose`, `packages/replay` beyond what sub-PRD c's KeySource seam already requires.

## Test Plan

- Unit: job state machine (start, progress, cancel-at-boundary, structured failure mapping).
- Unit: SSE event schema serialization (version field, backward compatibility with the existing watch client).
- E2E (packaged app): narrate with mocked transport writes artifacts (AC-18i.1.1/3); render fixture project produces MP4s (AC-18i.2.1); regen against the moved-button fixture streams step events and succeeds (AC-18i.3.1); a seeded failure shows its structured reason (AC-18i.2.2).
- Regression: full CLI suites pass unmodified (AC-18i.4.1).

## Risks and Open Questions

- **Risk:** long-running in-process jobs interacting with server request lifecycle. **Mitigation:** jobs run detached from the request that starts them (the request returns a job id); progress and cancellation ride SSE and routes.
- **Risk:** GUI job orchestration drifting from CLI behavior over time. **Mitigation:** both are thin wrappers over the same library entry points; the conformance check is that CLI suites stay green with zero source changes (AC-18i.4.1).
- **Open question:** whether regen in the GUI should expose prd-011's `--check` mode when it lands. Out of scope here; PRD-011's Studio review surface owns verdict UX.

## Related

- [PRD-018 index](./prd-018-desktop-application-index.md)
- [ADR-019 - why this ships as Studio surface](../../../knowledge/private/architecture/ADR-019-cli-frozen-gui-primary.md)
- [ADR-017 - KeySource seam narration rides](../../../knowledge/private/architecture/ADR-017-provider-api-keys-encrypted-local-config.md)
