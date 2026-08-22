# prd-005: Storyboard studio

Status: completed (merged via PRs #1 and #2) | Phase: 1 | Created: 2026-08-20

## 0. Dependencies

Blocking PRDs: prd-004 (ingested projects to edit). Governing ADRs: ADR-014 (local app), ADR-015 (files are the store). Corpus: walkthrough-ir-and-project-format.md.

## Goal

apps/studio: a local SvelteKit 5 app (launched by `waggle record` / `waggle studio`) for authoring: step film strip, frame scrubber over the +/- 5s window, element and route detail, heatmap overlay, per-step description editing, brand/voice/preset pickers. Receives live capture uploads from the extension.

## Non-goals

Narration generation UI beyond triggering prd-006, render controls beyond triggering prd-007/009, multi-user anything.

## Acceptance criteria

Wave 1:
- AC1: Studio server boots on localhost with a project dir argument; extension upload endpoints (chunks, events, finalize) write the recording inputs prd-004 expects.
- AC2: Film strip renders steps from the current IR version: settled frame, ripple marker, classification badge, route delta.

Wave 2 (parallel):
- AC3: Step detail: frame scrubber across extracted keyframes, element card (selectors, role, name, rect), DOM delta summary for state-change steps.
- AC4: Description editor: edits write narration segment drafts back to the project files; machine-drafted flag clears on human edit; autosave with debounce.
- AC5: Heatmap overlay toggle per route using prd-004 aggregation.

Wave 3:
- AC6: Project settings panel: brand kit picker, voice picker, preset checklist, credential set binding (refs only, values never displayed).
- AC7: Keyboard-first review flow: j/k step navigation, e to edit description, documented in-app.

## Task decomposition (each task 10 minutes or less)

| # | Task | AC | Bee |
|---|---|---|---|
| 1 | SvelteKit scaffold in apps/studio + launch from CLI | AC1 | svelte-worker-bee |
| 2 | Upload endpoints (chunk, events, finalize) | AC1 | typescript-node-worker-bee |
| 3 | Project file watcher + IR load into runes state | AC2 | svelte-worker-bee |
| 4 | Film strip component | AC2 | ux-ui-svelte-worker-bee |
| 5 | Frame scrubber component | AC3 | ux-ui-svelte-worker-bee |
| 6 | Element/route detail card | AC3 | ux-ui-svelte-worker-bee |
| 7 | Description editor + autosave + flag clearing | AC4 | svelte-worker-bee |
| 8 | Heatmap canvas overlay | AC5 | ux-ui-svelte-worker-bee |
| 9 | Settings panel (kits, voice, presets, cred binding) | AC6 | svelte-worker-bee |
| 10 | Keyboard shortcuts + help sheet | AC7 | svelte-worker-bee |
| 11 | Playwright smoke: load fixture project, edit a step, verify file write | AC4 | quality-worker-bee |

## QA evidence

qa/ receives the studio smoke run and a11y quick pass notes.
