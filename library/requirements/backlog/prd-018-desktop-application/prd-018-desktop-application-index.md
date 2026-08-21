# PRD-018: Desktop application and zero-terminal flow

> **Status:** Backlog
> **Priority:** P0
> **Effort:** XL

## Overview

Package Studio as an Electron desktop application (ADR-020) so a user goes from install to finished render without ever opening a terminal. The app hosts the existing Studio loopback server in its main process, ships the Svelte Studio UI as a hardened renderer, stores provider keys encrypted per ADR-017, is launched or focused by the extension per ADR-016, carries the recording flow defined by ADR-018, processes recordings automatically on stop, and distributes as unsigned Windows and macOS installers per ADR-020.

Consumes the shipped prd-005 Studio loopback app and prd-003 extension as they exist on `main`. No other PRD blocks this one. Governing ADRs: ADR-014, ADR-016, ADR-017, ADR-018, ADR-019, ADR-020; ADR-008's demo-credential contract is unchanged. Corpus: `library/knowledge/private/waggle/waggle-master-spec.md`.

## Goals

- Zero terminal use from install to finished render, proven on a clean machine profile.
- The standing Studio loopback Low finding (no per-launch authentication) closed by this PRD, because packaging is distribution.
- Provider keys entered in-app, encrypted at rest per ADR-017, decrypted in-process at call time only.
- Extension launch/focus behavior exactly as ADR-016 specifies; recording control surfaces exactly as ADR-018 specifies.
- Unsigned installer distribution with honest install copy, per ADR-020.

## Non-Goals

- Code signing, notarization, or an auto-update channel — deferred by ADR-020.
- Any new CLI surface (ADR-019); `packages/cli` command surface is frozen.
- Cloud services of any kind (ADR-014).
- prd-011 / prd-012 check tooling.
- The formal raw-capture retention policy document — a release gate, not an app feature; this PRD ships only the in-app warning and delete controls (sub-PRD d).
- Linux packaging; Linux remains a documented from-source build.

## Features

| Sub-PRD | Feature | Status |
|---|---|---|
| [prd-018a-desktop-application-electron-shell](./prd-018a-desktop-application-electron-shell.md) | Electron shell: main-process server hosting, hardened renderer, explicit main/renderer boundary | Draft |
| [prd-018b-desktop-application-loopback-auth](./prd-018b-desktop-application-loopback-auth.md) | Per-launch loopback authentication, host validation, bounded request bodies | Draft |
| [prd-018c-desktop-application-provider-key-store](./prd-018c-desktop-application-provider-key-store.md) | Provider-key encryption via safeStorage per ADR-017 | Draft |
| [prd-018d-desktop-application-recordings-retention](./prd-018d-desktop-application-recordings-retention.md) | Recordings list with raw-capture warning and delete controls | Draft |
| [prd-018e-desktop-application-extension-handshake](./prd-018e-desktop-application-extension-handshake.md) | Extension health-ping / focus / `waggle://` launch, single instance | Draft |
| [prd-018f-desktop-application-recording-control](./prd-018f-desktop-application-recording-control.md) | Countdown, capture-excluded draggable control, always-works stop, automatic processing | Draft |
| [prd-018g-desktop-application-packaging](./prd-018g-desktop-application-packaging.md) | Unsigned Windows/macOS installers, engine floor, resource bundling, install copy | Draft |

## Acceptance Criteria

Module-level criteria; each is expanded into Given/When/Then acceptance criteria inside its sub-PRD.

- [ ] AC1: Electron main process hosts the existing Studio loopback server in-process; the Svelte Studio UI renders under contextIsolation, nodeIntegration disabled, sandboxed renderer, and a content security policy; no `node:` builtin warnings remain in the renderer build (sub-PRD a).
- [ ] AC2: Per-launch loopback authentication — unauthenticated requests rejected, host validation, bounded request bodies; closes the standing Studio Low finding (sub-PRD b).
- [ ] AC3: Provider keys encrypted through safeStorage into app-data per ADR-017, never inside a project directory, decrypted in-process at call time only; CLI/CI env-ref path unchanged (sub-PRD c).
- [ ] AC4: Recordings list shows each recording with a raw-capture sensitivity warning and a delete control that removes the capture master and derived artifacts from disk (sub-PRD d).
- [ ] AC5: Extension-to-app handshake per ADR-016 — health-ping, focus running instance or open via registered `waggle://` scheme, single-instance enforcement (sub-PRD e).
- [ ] AC6: Recording flow per ADR-018 — countdown surface, draggable capture-excluded control with popup fallback, second action-icon click always stops, automatic processing on stop (sub-PRD f).
- [ ] AC7: Unsigned packaging per ADR-020 — Windows installer and macOS disk image build without signing ceremony, embedded Node meets the Node 24+ engine floor, Playwright Chromium and ffmpeg delivered by a documented strategy, install copy states the expected warning and override steps (sub-PRD g).
- [ ] AC8: Zero-terminal acceptance pass on a clean machine profile: install, launch, enter keys, record via the extension, automatic processing, finished render — no terminal opened at any point, captured as evidence.

## Implementation waves

Execution order for the orchestrator; each task decomposes to 10 minutes or less inside its sub-PRD.

| Wave | Sub-PRDs | Exit condition |
|---|---|---|
| 1 | a, b | Packaged shell hosts the real server; every unauthenticated request rejected |
| 2 | c, d | Keys round-trip encrypted; recordings list warns and deletes |
| 3 | e, f | Extension launches/focuses the app; recording flow complete with auto-processing |
| 4 | g + module AC8 | Installers build unsigned; clean-machine zero-terminal pass recorded |

Bee mapping: a, c, e, f — typescript-node-worker-bee; b — security-worker-bee; d — svelte-worker-bee; g — ci-release-worker-bee with readme-writing-worker-bee for install copy; AC8 evidence — quality-worker-bee.

## QA evidence

`qa/` receives the zero-terminal walkthrough evidence (screens or video), the headed manual `chrome.tabCapture` flow validation HANDOFF-3 requires before any release claims extension capture, token-rejection test output against the packaged app, and a release-checklist pointer to the raw-capture retention policy review that precedes external distribution. QA report authorship belongs to quality-worker-bee; this file never writes it.

## Related

- [ADR-016 — Studio packaged desktop app](../../../knowledge/private/architecture/ADR-016-studio-packaged-desktop-app.md)
- [ADR-017 — Provider keys encrypted local config](../../../knowledge/private/architecture/ADR-017-provider-api-keys-encrypted-local-config.md)
- [ADR-018 — Extension-driven recording UX](../../../knowledge/private/architecture/ADR-018-extension-driven-recording-ux.md)
- [ADR-019 — CLI frozen, GUI primary](../../../knowledge/private/architecture/ADR-019-cli-frozen-gui-primary.md)
- [ADR-020 — Electron shell, unsigned builds](../../../knowledge/private/architecture/ADR-020-electron-desktop-shell-unsigned-builds.md)
- [HANDOFF-3](../../../HANDOFF-3.md) — known boundaries this PRD closes
