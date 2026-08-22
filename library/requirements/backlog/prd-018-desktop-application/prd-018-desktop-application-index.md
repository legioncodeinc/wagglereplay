# PRD-018: Desktop application and zero-terminal flow

> **Status:** Backlog
> **Priority:** P0
> **Effort:** XL
> Amended 2026-08-21 (HANDOFF-4 Wave 0): added sub-PRDs h and i, module Dependencies section, AC9, the revised wave order, extension-delivery ownership, the Electron major pin, and the ADR-018 pause-deferral ADR note.

## 0. Dependencies

Blocking PRDs: none (consumes the shipped prd-005 Studio loopback app and prd-003 extension as they exist on `main`). Governing ADRs: ADR-014, ADR-016, ADR-017, ADR-018, ADR-019, ADR-020; ADR-008's demo-credential contract is unchanged. ADR-015's illustrative file-list ruling (2026-08-21 amendment note) covers any new project-dir state this PRD's sub-PRDs introduce. Corpus: `library/knowledge/private/waggle/waggle-master-spec.md`.

External dependencies (Mario's queue, not build-blockers for a through g): the Chrome Web Store listing decision (extension delivery, sub-PRD g and the handshake origin allowlist in b), the headed-display validation (003-AC8, folds into the module AC8 evidence), provider keys for any live-call check.

## Overview

Package Studio as an Electron desktop application (ADR-020) so a user goes from install to finished render without ever opening a terminal. The app hosts the existing Studio loopback server in its main process, ships the Svelte Studio UI as a hardened renderer, stores provider keys encrypted per ADR-017, is launched or focused by the extension per ADR-016, carries the recording flow defined by ADR-018, processes recordings automatically on stop, distributes as unsigned Windows and macOS installers per ADR-020, owns project creation and switching without `WAGGLE_PROJECT_DIR`-at-boot, and exposes narrate/render/regen as authenticated in-app actions with live progress.

## Goals

- Zero terminal use from install to finished render, proven on a clean machine profile.
- The standing Studio loopback Low finding (no per-launch authentication) closed by this PRD, because packaging is distribution.
- Provider keys entered in-app, encrypted at rest per ADR-017, decrypted in-process at call time only.
- Extension launch/focus behavior exactly as ADR-016 specifies; recording control surfaces exactly as ADR-018 specifies.
- Unsigned installer distribution with honest install copy, per ADR-020.

## Non-Goals

- Code signing, notarization, or an auto-update channel - deferred by ADR-020.
- Any new CLI surface (ADR-019); `packages/cli` command surface is frozen. Sub-PRD i adds Studio routes, not CLI flags.
- Cloud services of any kind (ADR-014).
- prd-011 / prd-012 check tooling.
- The formal raw-capture retention policy document - a release gate, not an app feature; this PRD ships only the in-app warning and delete controls (sub-PRD d).
- Linux packaging; Linux remains a documented from-source build (Mario's 2026-08-21 ruling: no Linux desktop artifact, no Linux CI job; reversible by edit).

## Features

| Sub-PRD | Feature | Status |
|---|---|---|
| [prd-018a-desktop-application-electron-shell](./prd-018a-desktop-application-electron-shell.md) | Electron shell: main-process server hosting, hardened renderer, explicit main/renderer boundary | Draft |
| [prd-018b-desktop-application-loopback-auth](./prd-018b-desktop-application-loopback-auth.md) | Per-launch loopback authentication, host validation, bounded request bodies, health endpoint, focus route | Draft |
| [prd-018c-desktop-application-provider-key-store](./prd-018c-desktop-application-provider-key-store.md) | Provider-key encryption via safeStorage per ADR-017 | Draft |
| [prd-018d-desktop-application-recordings-retention](./prd-018d-desktop-application-recordings-retention.md) | Recordings list with raw-capture warning and delete controls | Draft |
| [prd-018e-desktop-application-extension-handshake](./prd-018e-desktop-application-extension-handshake.md) | Extension health-ping / focus / `waggle://` launch, single instance | Draft |
| [prd-018f-desktop-application-recording-control](./prd-018f-desktop-application-recording-control.md) | Countdown, capture-excluded control, converged stop, automatic processing | Draft |
| [prd-018g-desktop-application-packaging](./prd-018g-desktop-application-packaging.md) | Unsigned Windows/macOS installers, engine floor, resource bundling, checksums, install copy, extension packing | Draft |
| [prd-018h-desktop-application-project-lifecycle](./prd-018h-desktop-application-project-lifecycle.md) | Zero-terminal project creation, selection, and switching (replaces the `WAGGLE_PROJECT_DIR`-at-boot contract) | Draft |
| [prd-018i-desktop-application-gui-triggers](./prd-018i-desktop-application-gui-triggers.md) | Authenticated GUI narrate/render/regen actions with live progress (Studio surface, ADR-019 untouched) | Draft |

## Acceptance Criteria

Module-level criteria; each is expanded into Given/When/Then acceptance criteria inside its sub-PRD.

- [ ] AC1: Electron main process hosts the existing Studio loopback server in-process; the Svelte Studio UI renders under contextIsolation, nodeIntegration disabled, sandboxed renderer, and a content security policy; no `node:` builtin warnings remain in the renderer build (sub-PRD a).
- [ ] AC2: Per-launch loopback authentication - unauthenticated requests rejected, host validation, bounded request bodies, health endpoint created (none exists on main today), focus route claimed; closes the standing Studio Low finding (sub-PRD b).
- [ ] AC3: Provider keys encrypted through safeStorage into app-data per ADR-017, never inside a project directory, decrypted in-process at call time only; CLI/CI env-ref path unchanged (sub-PRD c).
- [ ] AC4: Recordings list shows each recording with a raw-capture sensitivity warning and a delete control that removes the capture master and derived artifacts from disk (sub-PRD d).
- [ ] AC5: Extension-to-app handshake per ADR-016 - health-ping, focus running instance or open via registered `waggle://` scheme, single-instance enforcement (sub-PRD e).
- [ ] AC6: Recording flow per ADR-018 - countdown surface, draggable capture-excluded control with popup fallback, second action-icon click always stops, automatic processing on stop (sub-PRD f).
- [ ] AC7: Unsigned packaging per ADR-020 - Windows installer and macOS disk image build without signing ceremony, embedded Node meets the Node 24+ engine floor (Electron major 43, embedded Node 24.18, per the 2026-08-21 pin), Playwright Chromium and ffmpeg delivered by a documented strategy, SHA-256 checksums published per artifact, install copy states the expected warning and override steps, no auto-updater ships and the manual update path is documented (sub-PRD g).
- [ ] AC8: Zero-terminal acceptance pass on a clean machine profile: install, launch, enter keys, create or select a project, record via the extension, automatic processing, GUI-triggered narrate and render, finished render - no terminal opened at any point, captured as evidence (sub-PRDs h and i are prerequisites).
- [ ] AC9: CLI/CI regression contract: `waggle studio` keeps working through its CLI path with the per-launch token (generated and printed once), the studio smoke e2e harness passes with token auth in place, and `waggle regen` stays headless-capable with the CLI surface unchanged (ADR-019); verified by the existing studio and replay e2e suites running green against the amended server.

## Extension delivery (owned here, decided with Mario's store ruling)

Off-store install is not generally available on Windows or macOS, so the Chrome Web Store is the only real path to a clean-machine extension install. This PRD owns: the manifest `key` field that fixes the packed extension id (the handshake origin allowlist in sub-PRD b depends on a stable id), a packed `.zip` artifact produced by the sub-PRD g build, and the store-versus-documented-sideload decision recorded in g's install copy. Interim state until the listing is live: the install docs describe the sideload path honestly, and the origin allowlist carries both the fixed packed id and a documented dev-mode id.

## Implementation waves

Revised 2026-08-21 per the HANDOFF-4 audit (supersedes the earlier four-wave table; rationale: every A0 amendment is a contradiction or orphan that otherwise surfaces in wave 3 or 4, after a through f are built on it).

| Wave | Content | Exit condition |
|---|---|---|
| A0 | The Wave 0 amendments themselves: Electron major pinned (43), health endpoint owned as create-not-narrow, focus route claimed, port pinned at 4310, project-lifecycle (h) and GUI-trigger (i) sub-PRDs authored, extension delivery assigned | This document set; no code |
| A1 | prd-018a alone | Packaged shell hosts the real server in-process; hardened renderer asserted |
| A2 | prd-018b alone | Every unauthenticated request rejected; handshake under one adversarial review before three consumers depend on it |
| A3 | prd-018c, prd-018d, prd-018e in parallel | Keys round-trip encrypted; recordings list warns and deletes; extension launches/focuses the app |
| A4 | prd-018f plus prd-018h and prd-018i | Recording flow complete with auto-processing; project lifecycle and GUI triggers are AC8 prerequisites |
| A5 | prd-018g plus module AC8 evidence | Installers build unsigned with checksums; clean-machine zero-terminal pass recorded |

Sequencing note: prd-018b lands before PRD-011 AC4's Studio review surface regardless of track interleaving, so PRD-011 inherits authenticated routes instead of retrofitting them.

Bee mapping: a, c, e, f, h, i - typescript-node-worker-bee; b - security-worker-bee; d - svelte-worker-bee; g - ci-release-worker-bee with readme-writing-worker-bee for install copy; AC8 evidence - quality-worker-bee.

## Deferral record: ADR-018's pause control

ADR-018 names drag, pause, and stop on the recording control; sub-PRD f ships drag and stop and defers pause. A sub-PRD scope note cannot amend an accepted ADR (HANDOFF-4 contract 10), so the deferral is recorded as a follow-up ADR note appended to ADR-018 at f's dispatch: pause defers to a follow-up issue because it touches MediaRecorder timeslice semantics, and the deferral does not revise ADR-018's decision that the control carries pause eventually. The ADR note is written before f's implementation begins.

## QA evidence

`qa/` receives the zero-terminal walkthrough evidence (screens or video), the headed manual `chrome.tabCapture` flow validation HANDOFF-3 requires before any release claims extension capture, token-rejection test output against the packaged app, and a release-checklist pointer to the raw-capture retention policy review that precedes external distribution. QA report authorship belongs to quality-worker-bee; this file never writes it.

## Related

- [ADR-016 - Studio packaged desktop app](../../../knowledge/private/architecture/ADR-016-studio-packaged-desktop-app.md)
- [ADR-017 - Provider keys encrypted local config](../../../knowledge/private/architecture/ADR-017-provider-api-keys-encrypted-local-config.md)
- [ADR-018 - Extension-driven recording UX](../../../knowledge/private/architecture/ADR-018-extension-driven-recording-ux.md)
- [ADR-019 - CLI frozen, GUI primary](../../../knowledge/private/architecture/ADR-019-cli-frozen-gui-primary.md)
- [ADR-020 - Electron shell, unsigned builds](../../../knowledge/private/architecture/ADR-020-electron-desktop-shell-unsigned-builds.md)
- [HANDOFF-3](../../../HANDOFF-3.md) - known boundaries this PRD closes
